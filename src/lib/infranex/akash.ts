// ---------------------------------------------------------------------------
// PROVIDER-AKASH — Akash Network adapter (GPU + CPU offers, key validation).
//
// Akash is a decentralized compute marketplace: tenants deploy Docker
// containers via SDL and pay per-block escrow leases. Two data paths matter
// for the catalogs:
//
//   GPU  — GET /v1/gpu-prices on the Console API is PUBLIC (no key): it
//          aggregates live bid prices per GPU template across all providers
//          (median/avg USD per hour + availability). This means the GPU
//          catalog shows real Akash pricing the moment the app runs, no key
//          setup required.
//
//   CPU  — Akash has NO public per-spec CPU price endpoint: CPU lease prices
//          are bid-discovered at deploy time (each provider quotes an SDL).
//          The CPU catalog therefore ships reference tiers — sized from the
//          subnet floor (CPU_MIN_SPECS) up through the specs CPU-classified
//          subnets actually rent — priced from Akash's published market
//          ranges, with live provider capacity pulled from /v1/providers.
//          HONESTY: every Akash CPU offer is suffixed "(est.)" and marked
//          availability "limited" so it can never be confused with the
//          bid-backed offers of Hetzner/DO/Vast; the catalog note explains.
//
//   KEY  — a Console API key (console.akash.network → Settings → API Keys)
//          is OPTIONAL for offers and unlocks account operations (the
//          Managed Wallet / AEP-63 API: programmatic deployments, lease
//          lifecycle, USD billing). Validation hits GET /v1/deployments.
//
// SERVER-SAFETY: imported by providers.ts / cpu-providers.ts — server only.
// Never import from client components; the catalogs read the offer APIs.
// ---------------------------------------------------------------------------

import type { GPUOffer } from "./types";
import { normalizeModel } from "./runpod";

const CONSOLE_API = "https://console-api.akash.network/v1";
const HTTP_TIMEOUT_MS = 15_000;

const MONTHLY_HOURS = 730;

// --- Shared fetch helper -----------------------------------------------------

interface AkashJson {
  ok: boolean;
  status: number;
  json: unknown;
}

async function akashGet(path: string, key?: string): Promise<AkashJson> {
  const res = await fetch(`${CONSOLE_API}${path}`, {
    headers: key ? { "x-api-key": key } : {},
    cache: "no-store",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as unknown;
  return { ok: res.ok, status: res.status, json };
}

// --- Key validation ----------------------------------------------------------

/**
 * Console API keys are validated against the account-scoped deployments
 * endpoint: a valid key answers 200 (even with zero deployments), a bad one
 * 401 with { error, message }.
 */
export async function validateAkashKey(key: string): Promise<{ ok: boolean; message: string }> {
  const res = await akashGet("/deployments", key);
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: "Key rejected by Akash Console (401) — double-check the API key." };
  }
  if (!res.ok) return { ok: false, message: `Akash Console API HTTP ${res.status}` };
  return { ok: true, message: "Key valid — Akash Console account verified." };
}

// --- GPU offers (PUBLIC — no key needed) -------------------------------------

interface AkashGpuPrice {
  vendor?: string;
  model?: string;
  ram?: string; // "80Gi"
  interface?: string; // "SXM4" | "PCIE" | ...
  availability?: { total?: number; available?: number };
  providerAvailability?: { total?: number; available?: number };
  price?: {
    currency?: string;
    min?: number;
    max?: number;
    avg?: number;
    weightedAverage?: number;
    med?: number;
  };
}

interface GpuPricesResponse {
  availability?: { total?: number; available?: number };
  models?: AkashGpuPrice[];
}

/** Parse Akash's K8s-style ram ("80Gi", "141Gi") into marketing GB. */
function parseGi(ram: string | undefined): number {
  const m = (ram ?? "").match(/^(\d+(?:\.\d+)?)Gi$/);
  return m ? Math.round(Number(m[1])) : 0;
}

/**
 * Akash GPU row → the canonical name normalizeModel expects. Akash reports
 * lowercase chip names ("a100", "h100nvl", "l40s", "rtx4090") plus an
 * interface ("SXM4", "PCIE"); the provider map keys on RunPod-style bare
 * names ("A100 SXM", "RTX 4090") — so no vendor prefix, interface folded in.
 */
function akashGpuDisplayName(model: string, iface: string, vramGb: number): string {
  let m = (model || "").trim().toLowerCase().replace(/^nvidia\s*/, "").replace(/_/g, " ");
  const it = (iface || "").trim().toUpperCase();
  if (m === "h100nvl") m = "h100 nvl";
  else if (m === "a100xl" || (m === "a100" && it.startsWith("PCI"))) m = "a100 pcie";
  else if (m === "a100") m = "a100 sxm";
  else if (m === "h100" && it.startsWith("PCI")) m = "h100 pcie";
  else if (m === "h100") m = "h100 sxm";
  const name = m.toUpperCase();
  // normalizeModel distinguishes the 40GB SXM variant by an explicit label.
  const suffix = name === "A100 SXM" && vramGb === 40 ? " 40GB" : "";
  return name + suffix;
}

/**
 * Live Akash GPU offers from the public bid-price aggregation. Pricing uses
 * the MEDIAN of current bids — sturdier against one provider skewing the
 * average than price.avg, and what the Console's own pricing page leads with.
 */
export async function akashGpuOffers(): Promise<LiveAkashGpuOffer[]> {
  const res = await akashGet("/gpu-prices");
  if (!res.ok) throw new Error(`Akash GPU prices HTTP ${res.status}`);
  const j = (res.json ?? {}) as GpuPricesResponse;
  const models = j.models ?? [];

  const out: LiveAkashGpuOffer[] = [];
  for (const g of models) {
    const vramRaw = parseGi(g.ram);
    const med = Number(g.price?.med ?? NaN);
    if (!Number.isFinite(med) || med <= 0) continue;
    const displayName = akashGpuDisplayName(g.model ?? "", g.interface ?? "", vramRaw);
    if (!displayName) continue;
    // Canonicalize through the shared GPU map (skips consumer chips, fixes
    // VRAM drift) — unknown datacenter models pass through untouched.
    const norm = normalizeModel(displayName, vramRaw);
    const vramGb = norm?.vramGb ?? vramRaw;

    const avail = g.providerAvailability?.available ?? g.availability?.available ?? 0;
    out.push({
      id: `akash-gpu-${(g.vendor ?? "")}-${(g.model ?? "")}-${vramGb}`.toLowerCase().replace(/\s+/g, "-"),
      model: norm?.model ?? displayName,
      vramGb,
      provider: "Akash Network",
      region: "global",
      hourlyPrice: Math.round(med * 1000) / 1000,
      monthlyPrice: Math.round(med * MONTHLY_HOURS),
      availability: avail > 0 ? "available" : "scarce",
      isSpot: false, // Akash leases are escrowed on-chain, not pre-emptible spot
      ramGb: 0,
      cpuCores: 0,
      source: "akash",
      _availabilityDetail: g.availability ?? null,
    } as LiveAkashGpuOffer);
  }
  return out;
}

export type LiveAkashGpuOffer = GPUOffer & {
  source: "akash";
  /** Raw availability block from /v1/gpu-prices (chips + count in catalog UIs). */
  _availabilityDetail?: { total?: number; available?: number } | null;
};

// --- CPU offers (reference tiers + live capacity, PUBLIC) --------------------

/**
 * Reference CPU tiers for the CPU catalog. Spec floor matches CPU_MIN_SPECS
 * (2 c / 4 GB / 40 GB — the smallest box a CPU-classified miner survives on).
 * Prices are mid-range ESTIMATES from Akash's published market pricing
 * ($15–25/mo for small shared CPU, scaling roughly linearly with vCPU) —
 * actual lease cost is bid-discovered per provider at deploy time.
 */
const AKASH_CPU_TIERS: Array<{ cores: number; ramGb: number; diskGb: number; monthly: number }> = [
  { cores: 2, ramGb: 4, diskGb: 40, monthly: 8 },
  { cores: 4, ramGb: 8, diskGb: 80, monthly: 15 },
  { cores: 8, ramGb: 16, diskGb: 160, monthly: 28 },
  { cores: 16, ramGb: 32, diskGb: 320, monthly: 52 },
];

interface AkashProviderRow {
  owner?: string;
  ipRegionCode?: string | null;
  ipCountryCode?: string | null;
  stats?: {
    cpu?: { active?: number; available?: number };
    gpu?: { active?: number; available?: number };
    memory?: { active?: number; available?: number };
    storage?: { active?: number; available?: number };
  };
}

/**
 * Akash CPU catalog entries: the reference tiers above, each annotated with
 * LIVE network capacity (how many vCPU are actually available to lease right
 * now across all providers) so the user can tell the market is real. Offers
 * are availability "limited" + "(est.)" — bid-discovered pricing means the
 * final number is set when a provider accepts the SDL.
 */
export async function akashCpuOffers(): Promise<LiveAkashCpuOffer[]> {
  const res = await akashGet("/providers");
  if (!res.ok) throw new Error(`Akash providers HTTP ${res.status}`);
  const providers = (Array.isArray(res.json) ? res.json : []) as AkashProviderRow[];

  // Live capacity: sum of available vCPU across all responding providers.
  // Akash chain stats are in MILLI-units (1 vCPU = 1,000) — normalize to
  // whole vCPU for the catalog.
  let availCpuMilli = 0;
  let online = 0;
  for (const p of providers) {
    const cpuAvail = Number(p.stats?.cpu?.available ?? 0);
    if (cpuAvail > 0) online += 1;
    availCpuMilli += cpuAvail;
  }
  const availCpu = Math.round(availCpuMilli / 1000); // whole vCPU

  const out: LiveAkashCpuOffer[] = AKASH_CPU_TIERS.map((t) => {
    const monthly = Math.round(t.monthly * 100) / 100;
    return {
      id: `akash-cpu-${t.cores}c-${t.ramGb}g`,
      model: `AKASH-${t.cores}C-${t.ramGb}G (est.)`,
      provider: "Akash Network",
      region: "global",
      cpuCores: t.cores,
      ramGb: t.ramGb,
      diskGb: t.diskGb,
      cpuType: "shared" as const,
      hourlyPrice: Math.round((monthly / MONTHLY_HOURS) * 10_000) / 10_000,
      monthlyPrice: monthly,
      availability: "limited" as const, // never rendered as a bid-backed price
      source: "akash" as const,
      _network: { providersOnline: online, availCpu, providersSeen: providers.length },
    };
  });
  return out;
}

export interface LiveAkashCpuOffer {
  id: string;
  model: string;
  provider: string;
  region: string;
  cpuCores: number;
  ramGb: number;
  diskGb: number;
  cpuType: "shared" | "dedicated";
  hourlyPrice: number;
  monthlyPrice: number;
  availability: "limited";
  source: "akash";
  /** Live capacity snapshot backing this tier (transparency for the UI). */
  _network: { providersOnline: number; availCpu: number; providersSeen: number };
}
