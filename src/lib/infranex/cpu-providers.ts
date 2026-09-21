// ---------------------------------------------------------------------------
// CPU-CATALOG-1 — CPU VPS provider engine (the CPU side of the provider
// system in providers.ts).
//
// Same contract as the GPU side, different market:
//   1. validateProviderKey   → providers.ts (key vault stays single-source)
//   2. live CPU offers       → hetznerOffers() + digitalOceanOffers(), pulled
//                              into the CPU Catalog + the provision dialog
//   3. real provisioning     → registerSshKey + createServer with cloud-init:
//                              the platform rents the exact box you pick,
//                              injects an ephemeral ed25519 SSH key and
//                              auto-installs the mining base stack (docker,
//                              python venv, bittensor) via cloud-init.
//
// PRICING HONESTY: Hetzner advertises monthly (net + gross); DigitalOcean
// ships both monthly and hourly. Everything is normalized to hourly
// (monthly / 730) + monthly so the CPU Catalog can be compared 1:1 with the
// GPU Catalog (a $0.22/hr RTX 3090 ≈ $161/mo vs CX32 ≈ $9/mo for the
// CPU-classified subnets).
//
// SERVER-SAFETY: imports providers.ts (db-backed key vault) — server only.
// Never import this module from client components; the CPU Catalog reads
// /api/cpu-offers instead.
// ---------------------------------------------------------------------------

import { getProviderKey, PROVIDER_META, type ProviderId } from "./providers";
import { akashCpuOffers } from "./akash";
import type { CPUOffer } from "./types";
import crypto from "crypto";

const HTTP_TIMEOUT_MS = 15_000;
export const MONTHLY_HOURS = 730;

export const CPU_PROVIDER_IDS: ProviderId[] = PROVIDER_META
  .filter((p) => p.kind !== "gpu" && p.offers)
  .map((p) => p.id);

export function isCpuProviderId(v: unknown): v is "hetzner" | "digitalocean" {
  return v === "hetzner" || v === "digitalocean";
}

/**
 * Typical CPU-subnet floor (RedTeam α61 documents 2 c / 8 GB / 50 GB; the
 * CPU Guide's verified profiles all run on ≥ 2 vCPU / 4 GB). Offers below
 * this floor are still catalogued but the provisioner refuses them — a
 * $4 droplet that OOMs on first build is not a "good offer".
 */
export const CPU_MIN_SPECS = { cores: 2, ramGb: 4, diskGb: 40 };

// --- Hetzner Cloud ----------------------------------------------------------

interface HetznerPriceEntry {
  location?: string;
  price_monthly?: { net?: string; gross?: string };
  price_hourly?: { net?: string; gross?: string };
}

interface HetznerServerType {
  id?: number;
  name?: string;
  cores?: number;
  memory?: number; // GB
  disk?: number; // GB
  cpu_type?: "shared" | "dedicated";
  architecture?: "x86" | "arm";
  deprecated?: boolean | string;
  prices?: HetznerPriceEntry[];
}

// Exported for the fixture test suite (scripts/test-cpu-adapters.ts) — the
// snapshot + provisioner compose these; no other module should import them.
export async function hetznerOffers(key: string): Promise<LiveCpuOffer[]> {
  const res = await fetch("https://api.hetzner.cloud/v1/server_types?per_page=100", {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Hetzner HTTP ${res.status}`);
  const j = (await res.json().catch(() => null)) as { server_types?: HetznerServerType[] } | null;
  const items = j?.server_types ?? [];

  const out: LiveCpuOffer[] = [];
  for (const t of items) {
    const name = String(t.name ?? "");
    const cores = Number(t.cores ?? 0);
    const ramGb = Number(t.memory ?? 0);
    const diskGb = Number(t.disk ?? 0);
    // Mining machines: x86 only (miner docker images are amd64), not
    // deprecated, not the dedicated-GPU lines, and big enough to matter.
    if (!name || cores <= 0 || ramGb <= 0) continue;
    if (t.architecture && t.architecture !== "x86") continue;
    if (t.deprecated) continue;
    if (/gpu/i.test(name)) continue;

    // Hetzner prices vary (slightly) by location — catalogue the CHEAPEST
    // location and remember it as the offer's region.
    let best: { location: string; monthlyGross: number } | null = null;
    for (const p of t.prices ?? []) {
      const gross = Number(p.price_monthly?.gross ?? NaN);
      if (!Number.isFinite(gross) || gross <= 0) continue;
      const loc = String(p.location ?? "");
      if (!loc) continue;
      if (!best || gross < best.monthlyGross) best = { location: loc, monthlyGross: gross };
    }
    if (!best) continue;
    const monthly = Math.round(best.monthlyGross * 100) / 100;
    const hourly = Math.round((monthly / MONTHLY_HOURS) * 10_000) / 10_000;
    out.push({
      id: `hetzner-${name}`,
      model: name.toUpperCase(),
      provider: "Hetzner Cloud",
      region: best.location,
      cpuCores: cores,
      ramGb,
      diskGb,
      cpuType: t.cpu_type === "dedicated" ? "dedicated" : "shared",
      hourlyPrice: hourly,
      monthlyPrice: monthly,
      availability: "available",
      live: true,
      source: "hetzner",
    });
  }
  return out;
}

// --- DigitalOcean -----------------------------------------------------------

interface DoSize {
  slug?: string;
  memory?: number; // MB
  vcpus?: number;
  disk?: number; // GB
  price_monthly?: number;
  price_hourly?: number;
  available?: boolean;
  regions?: string[];
}

// See hetznerOffers note — exported for the fixture test suite only.
export async function digitalOceanOffers(key: string): Promise<LiveCpuOffer[]> {
  const res = await fetch("https://api.digitalocean.com/v2/sizes?per_page=200", {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DigitalOcean HTTP ${res.status}`);
  const j = (await res.json().catch(() => null)) as { sizes?: DoSize[] } | null;
  const items = j?.sizes ?? [];

  const out: LiveCpuOffer[] = [];
  for (const s of items) {
    const slug = String(s.slug ?? "");
    const cores = Number(s.vcpus ?? 0);
    const ramGb = Math.round(Number(s.memory ?? 0) / 1024);
    const diskGb = Number(s.disk ?? 0);
    const monthly = Number(s.price_monthly ?? 0);
    if (!slug || cores <= 0 || ramGb <= 0 || monthly <= 0) continue;
    if (s.available === false) continue;
    // GPU droplets (g-/gd-/gpu-*) belong to the GPU market, not the CPU one.
    if (/^(g|gd|gpu)-/i.test(slug)) continue;
    const hourly = Number(s.price_hourly ?? monthly / MONTHLY_HOURS);
    out.push({
      id: `do-${slug}`,
      model: slug,
      provider: "DigitalOcean",
      region: "global", // DO prices are region-independent
      cpuCores: cores,
      ramGb,
      diskGb,
      cpuType: slug.startsWith("c-") || slug.startsWith("c2-") ? "dedicated" : "shared",
      hourlyPrice: Math.round(hourly * 10_000) / 10_000,
      monthlyPrice: Math.round(monthly * 100) / 100,
      availability: "available",
      live: true,
      source: "digitalocean",
    });
  }
  return out;
}

// --- Vast.ai (CPU-only machines — PROVIDER-AKASH) ---------------------------
//
// Vast lists CPU-only boxes alongside GPU bundles: the same bundle search
// API, filtered to num_gpus = 0. Key is REQUIRED (Vast requires auth for
// bundle search) — the same Vast key that feeds the GPU catalog.

interface VastCpuBundle {
  id?: number | string;
  dph_total?: number;
  cpu_cores?: number;
  cpu_ram?: number; // MB
  disk_space?: number; // MB
  cpu_model?: string;
  geolocation?: string;
  is_interruptible?: boolean;
  rentable?: boolean;
  reliability2?: number;
}

// See hetznerOffers note — exported for the fixture test suite only.
export async function vastCpuOffers(key: string): Promise<LiveCpuOffer[]> {
  const q = encodeURIComponent(JSON.stringify({ num_gpus: { eq: 0 }, rentable: { eq: true } }));
  const res = await fetch(`https://console.vast.ai/api/v0/bundles?q=${q}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Vast.ai HTTP ${res.status}`);
  // Same dual response shape as the GPU side (vastOffers in providers.ts).
  const j = (await res.json().catch(() => null)) as
    | { offers?: VastCpuBundle[]; data?: { bundles?: VastCpuBundle[]; offers?: VastCpuBundle[] } }
    | null;
  const items: VastCpuBundle[] =
    j?.offers ?? j?.data?.bundles ?? j?.data?.offers ?? [];

  const out: LiveCpuOffer[] = [];
  for (const o of items) {
    const cores = Number(o.cpu_cores ?? 0);
    const ramGb = Math.round(Number(o.cpu_ram ?? 0) / 1024);
    const diskGb = Math.round(Number(o.disk_space ?? 0) / 1024);
    const hourly = Number(o.dph_total ?? 0);
    if (cores <= 0 || ramGb <= 0 || hourly <= 0) continue;
    // Vast CPU models read like "AMD EPYC 7402 24-Core Processor" / "Intel
    // Core i9-10980XE" — compact them into a stable catalog model string.
    const cpuModel = String(o.cpu_model ?? "")
      .replace(/\s+(x86-64|aes|avx.*)$/i, "")
      .replace(/\s*CPU\s*$/i, "")
      .trim();
    const label = `${cores} vCPU · ${ramGb} GB${cpuModel ? ` · ${cpuModel.split(" ").slice(0, 3).join(" ")}` : ""}`;
    const monthly = Math.round(hourly * MONTHLY_HOURS * 100) / 100;
    out.push({
      id: `vast-cpu-${String(o.id ?? `${cores}-${ramGb}-${hourly}`)}`,
      model: label,
      provider: "Vast.ai",
      region: o.geolocation ? String(o.geolocation) : "global",
      cpuCores: cores,
      ramGb,
      diskGb,
      cpuType: cores >= 8 ? "dedicated" : "shared",
      hourlyPrice: Math.round(hourly * 10_000) / 10_000,
      monthlyPrice: monthly,
      availability: "available",
      live: true,
      source: "vast",
    });
  }
  return out;
}

// --- Akash Network (reference tiers + live capacity — PROVIDER-AKASH) -------

/**
 * Akash CPU entries are reference tiers ("(est.)", availability "limited")
 * — Akash CPU leases are bid-priced per provider at deploy time and there is
 * no public per-spec price endpoint. akashCpuOffers() also pulls live
 * network capacity so the entries stay anchored to a real market.
 */
export async function akashCpuCatalogOffers(): Promise<LiveCpuOffer[]> {
  const rows = await akashCpuOffers(); // throws on HTTP failure — snapshot surfaces the error
  return rows.map((r) => ({ ...r, live: true as const }));
}

// --- Multi-provider snapshot (serves /api/cpu-offers) -----------------------

export type LiveCpuOffer = CPUOffer & { live: true; source: string };

export interface CpuProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  origin?: "db" | "env" | "public";
  offers: number;
  error?: string;
  /** Present for publicOffers providers pulled without a key. */
  keyless?: boolean;
}

export interface CpuOffersSnapshot {
  offers: LiveCpuOffer[];
  source: "live" | "partial" | "error";
  fetchedAt: string;
  totalOffers: number;
  providers: CpuProviderStatus[];
}

const SNAPSHOT_TTL_MS = 60_000;

let cachedCpuSnapshot: CpuOffersSnapshot | null = null;
let cpuSnapshotExpiresAt = 0;

/** Called alongside invalidateProvidersCache() when a CPU key changes. */
export function invalidateCpuProvidersCache(): void {
  cachedCpuSnapshot = null;
  cpuSnapshotExpiresAt = 0;
}

/**
 * Pull LIVE CPU offers from every configured CPU provider in parallel —
 * the CPU mirror of fetchAllLiveOffers(). Providers without keys are
 * reported as not configured; failing providers carry their error.
 */
export async function fetchAllLiveCpuOffers(force = false): Promise<CpuOffersSnapshot> {
  const now = Date.now();
  if (!force && cachedCpuSnapshot && now < cpuSnapshotExpiresAt) return cachedCpuSnapshot;

  const adapters: Record<string, (key: string) => Promise<LiveCpuOffer[]>> = {
    hetzner: hetznerOffers,
    digitalocean: digitalOceanOffers,
    vast: vastCpuOffers,
    akash: akashCpuCatalogOffers, // ignores the key — public market data
  };

  const results = await Promise.all(
    CPU_PROVIDER_IDS.map(async (id): Promise<{ status: CpuProviderStatus; offers: LiveCpuOffer[] }> => {
      const meta = PROVIDER_META.find((p) => p.id === id)!;
      const resolved = await getProviderKey(id).catch(() => null);
      if (!resolved && !meta.publicOffers) {
        return { status: { id, label: meta.label, configured: false, offers: 0 }, offers: [] };
      }
      try {
        const offers = await adapters[id](resolved?.key ?? "");
        return {
          status: {
            id,
            label: meta.label,
            configured: true,
            origin: resolved?.origin ?? "public",
            keyless: !resolved,
            offers: offers.length,
          },
          offers,
        };
      } catch (e) {
        return {
          status: {
            id,
            label: meta.label,
            configured: true,
            origin: resolved?.origin ?? "public",
            keyless: !resolved,
            offers: 0,
            error: e instanceof Error ? e.message : String(e),
          },
          offers: [],
        };
      }
    })
  );

  const offers = results
    .flatMap((r) => r.offers)
    .sort(
      (a, b) =>
        a.monthlyPrice - b.monthlyPrice ||
        b.cpuCores - a.cpuCores ||
        b.ramGb - a.ramGb
    );
  const configuredCount = results.filter((r) => r.status.configured).length;

  const snapshot: CpuOffersSnapshot = {
    offers,
    source: offers.length > 0 ? "live" : configuredCount > 0 ? "partial" : "error",
    fetchedAt: new Date().toISOString(),
    totalOffers: offers.length,
    providers: results.map((r) => r.status),
  };

  cachedCpuSnapshot = snapshot;
  cpuSnapshotExpiresAt = Date.now() + SNAPSHOT_TTL_MS;
  return snapshot;
}

// --- Provisioning -----------------------------------------------------------
//
// The provisioner does the same thing the RunPod/Vast adapters do for GPUs,
// adapted to classic VPS APIs:
//   1. register a fresh ephemeral ed25519 public key with the provider,
//   2. create the server (Ubuntu 22.04) with a cloud-init user-data that
//      auto-installs the mining base stack,
//   3. report the provider-side id — the route then records a DevOps host
//      (GpuHost, transport ssh) so the existing install pipeline takes over.

export interface ResolvedCpuOffer extends CPUOffer {
  /** Provider-side plan/type slug used at create time ("cx32", "s-4vcpu-8gb"). */
  slug: string;
}

/** Re-resolve a catalogued offer against the provider RIGHT NOW (no cache): prices drift and dead types must fail loudly before we rent. */
export async function resolveCpuOffer(
  providerId: "hetzner" | "digitalocean",
  key: string,
  offerId: string,
  regionOverride?: string
): Promise<ResolvedCpuOffer> {
  const offers = providerId === "hetzner" ? await hetznerOffers(key) : await digitalOceanOffers(key);
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) throw new Error(`Offer ${offerId} is no longer available at ${providerId} — re-open the catalog and pick again.`);
  if (regionOverride) offer.region = regionOverride;
  return { ...offer, slug: offerId.replace(/^(hetzner|do)-/, "") };
}

/** Generate a unique, provider-safe SSH key name. */
export function sshKeyName(): string {
  return `infranex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function hetznerRegisterSshKey(key: string, name: string, publicKey: string): Promise<number> {
  const res = await fetch("https://api.hetzner.cloud/v1/ssh_keys", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ name, public_key: publicKey }),
    cache: "no-store",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const j = (await res.json().catch(() => null)) as
    | { ssh_key?: { id?: number }; error?: { code?: string; message?: string } }
    | null;
  if (!res.ok) {
    // 23akes = "name already in use" — practically impossible (random name),
    // but surface the API error honestly instead of guessing.
    throw new Error(`Hetzner SSH key registration failed: ${j?.error?.message ?? `HTTP ${res.status}`}`);
  }
  if (!j?.ssh_key?.id) throw new Error("Hetzner SSH key registration returned no id");
  return j.ssh_key.id;
}

interface HetznerServer {
  id?: number;
  status?: string;
  public_net?: { ipv4?: { ip?: string | null } };
}

async function hetznerCreateServer(
  key: string,
  opts: { name: string; serverType: string; location: string; sshKeyId: number; userData: string }
): Promise<{ id: number; status: string; ip: string | null }> {
  const res = await fetch("https://api.hetzner.cloud/v1/servers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      name: opts.name,
      server_type: opts.serverType,
      location: opts.location,
      image: "ubuntu-22.04",
      ssh_keys: [opts.sshKeyId],
      start_after_create: true,
      user_data: opts.userData,
      labels: { managed_by: "infranex", role: "cpu-miner" },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json().catch(() => null)) as
    | { server?: HetznerServer; error?: { message?: string } }
    | null;
  if (!res.ok || !j?.server?.id) {
    throw new Error(`Hetzner server creation failed: ${j?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return {
    id: j.server.id,
    status: j.server.status ?? "initializing",
    ip: j.server.public_net?.ipv4?.ip ?? null,
  };
}

async function doRegisterSshKey(key: string, name: string, publicKey: string): Promise<number> {
  const res = await fetch("https://api.digitalocean.com/v2/account/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ name, public_key: publicKey }),
    cache: "no-store",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const j = (await res.json().catch(() => null)) as
    | { ssh_key?: { id?: number }; id?: string; message?: string }
    | null;
  if (res.ok && j?.ssh_key?.id) return j.ssh_key.id;
  // 422 "already in use" — the key fingerprint was registered before (retry
  // after a partial provision). Look it up by fingerprint instead.
  if (res.status === 422) {
    const fpRes = await fetch(`https://api.digitalocean.com/v2/account/keys/${encodeURIComponent(sshFingerprint(publicKey))}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const fp = (await fpRes.json().catch(() => null)) as { ssh_key?: { id?: number } } | null;
    if (fpRes.ok && fp?.ssh_key?.id) return fp.ssh_key.id;
  }
  throw new Error(`DigitalOcean SSH key registration failed: ${j?.message ?? `HTTP ${res.status}`}`);
}

/** DO keys are addressed by MD5 fingerprint — compute it from the OpenSSH public key. */
function sshFingerprint(publicKey: string): string {
  const b64 = publicKey.trim().split(/\s+/)[1];
  if (!b64) throw new Error("malformed SSH public key");
  return crypto.createHash("md5").update(Buffer.from(b64, "base64")).digest("hex").match(/.{2}/g)!.join(":");
}

interface DoDroplet {
  id?: number;
  status?: string;
  networks?: { v4?: Array<{ type?: string; ip_address?: string }> };
}

async function doCreateDroplet(
  key: string,
  opts: { name: string; size: string; region: string; sshKeyId: number; userData: string }
): Promise<{ id: number; status: string; ip: string | null }> {
  const res = await fetch("https://api.digitalocean.com/v2/droplets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      name: opts.name,
      region: opts.region,
      size: opts.size,
      image: "ubuntu-22-04-x64",
      ssh_keys: [opts.sshKeyId],
      user_data: opts.userData,
      tags: ["infranex", "cpu-miner"],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json().catch(() => null)) as
    | { droplet?: DoDroplet; id?: string; message?: string }
    | null;
  if (!res.ok || !j?.droplet?.id) {
    throw new Error(`DigitalOcean droplet creation failed: ${j?.message ?? `HTTP ${res.status}`}`);
  }
  return { id: j.droplet.id, status: j.droplet.status ?? "new", ip: null };
}

/**
 * The mining base stack, installed by cloud-init on first boot — the same
 * environment the DevOps inspector expects on a host: git + build tools,
 * Docker (get.docker.com), a /opt/infranex venv with bittensor. NO wallet
 * material, NO subnet secrets — those flow through the gated DevOps install
 * steps (hotkey-only policy, deployment/ssh-keys.ts).
 */
export function buildBaseCloudInit(): string {
  return [
    "#cloud-config",
    "package_update: true",
    "package_upgrade: false",
    "packages:",
    "  - git",
    "  - curl",
    "  - build-essential",
    "  - python3",
    "  - python3-venv",
    "  - python3-pip",
    "  - jq",
    "  - ca-certificates",
    "write_files:",
    "  - path: /opt/infranex/README.txt",
    "    content: |",
    "      InfraNex-managed CPU miner host.",
    "      Base stack installed via cloud-init (docker, python3 venv, bittensor).",
    "      Subnet installs are driven by the InfraNex DevOps Engine over SSH.",
    "    permissions: '0644'",
    "runcmd:",
    "  - curl -fsSL https://get.docker.com | sh",
    "  - mkdir -p /opt/infranex",
    "  - python3 -m venv /opt/infranex/venv",
    "  - /opt/infranex/venv/bin/pip install --upgrade pip wheel",
    "  - /opt/infranex/venv/bin/pip install --upgrade bittensor",
    "  - touch /var/lib/infranex-base-ready",
    '  - echo "infranex base ready" > /etc/motd.tail',
    'final_message: "infranex base stack ready after $UPTIME seconds"',
  ].join("\n");
}

/**
 * Register the ephemeral SSH key + create the server. Returns the provider
 * object id and the first-known state.
 */
export async function provisionCpuServer(
  providerId: "hetzner" | "digitalocean",
  key: string,
  opts: {
    name: string;
    slug: string; // server_type / size slug
    region: string;
    sshPublicKey: string;
    userData: string;
  }
): Promise<{ providerServerId: string; status: string; ip: string | null }> {
  if (providerId === "hetzner") {
    const sshKeyId = await hetznerRegisterSshKey(key, sshKeyName(), opts.sshPublicKey);
    const server = await hetznerCreateServer(key, {
      name: opts.name,
      serverType: opts.slug,
      location: opts.region || "fsn1",
      sshKeyId,
      userData: opts.userData,
    });
    return { providerServerId: String(server.id), status: server.status, ip: server.ip };
  }
  const sshKeyId = await doRegisterSshKey(key, sshKeyName(), opts.sshPublicKey);
  const droplet = await doCreateDroplet(key, {
    name: opts.name,
    size: opts.slug,
    region: opts.region || "nyc3",
    sshKeyId,
    userData: opts.userData,
  });
  return { providerServerId: String(droplet.id), status: droplet.status, ip: droplet.ip };
}

/** Poll the provider for the server's lifecycle state + first public IPv4. */
export async function getCpuServerStatus(
  providerId: "hetzner" | "digitalocean",
  key: string,
  providerServerId: string
): Promise<{ status: string; ip: string | null }> {
  if (providerId === "hetzner") {
    const res = await fetch(`https://api.hetzner.cloud/v1/servers/${providerServerId}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Hetzner HTTP ${res.status}`);
    const j = (await res.json().catch(() => null)) as { server?: HetznerServer } | null;
    return {
      status: j?.server?.status ?? "unknown",
      ip: j?.server?.public_net?.ipv4?.ip ?? null,
    };
  }
  const res = await fetch(`https://api.digitalocean.com/v2/droplets/${providerServerId}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DigitalOcean HTTP ${res.status}`);
  const j = (await res.json().catch(() => null)) as { droplet?: DoDroplet } | null;
  const ip =
    j?.droplet?.networks?.v4?.find((n) => n.type === "public")?.ip_address ?? null;
  return { status: j?.droplet?.status ?? "unknown", ip };
}

/** Destroy the rented box (used when a host is removed from the platform). */
export async function terminateCpuServer(
  providerId: "hetzner" | "digitalocean",
  key: string,
  providerServerId: string
): Promise<{ success: boolean; message: string }> {
  const url =
    providerId === "hetzner"
      ? `https://api.hetzner.cloud/v1/servers/${providerServerId}`
      : `https://api.digitalocean.com/v2/droplets/${providerServerId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (res.status === 204 || res.ok) {
    return { success: true, message: `${providerId} server ${providerServerId} deleted.` };
  }
  return { success: false, message: `${providerId} delete returned HTTP ${res.status}` };
}
