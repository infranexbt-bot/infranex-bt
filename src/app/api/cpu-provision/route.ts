// CPU-CATALOG-1 — CPU provisioning API: rent the exact catalogued box and
// auto-install the mining base on it.
//
//   POST ?body { provider, offerId, region?, netuid, walletName, hotkeyName, name? }
//     1. resolves the offer against the provider LIVE (dead types fail loudly),
//     2. pulls the subnet requirements profile FROM THE SUBNET'S GIT
//        (pullSubnetRequirements — chain + GitHub + overrides, 6h cache),
//     3. refuses GPU-documented subnets (use the GPU Catalog) and boxes below
//        the CPU floor (CPU_MIN_SPECS),
//     4. registers an ephemeral ed25519 SSH key + creates the server with a
//        cloud-init that auto-installs docker / python venv / bittensor,
//     5. records a DevOps host (GpuHost, transport ssh) so the machine shows
//        up in the DevOps Engine,
//     6. STAGES the subnet install plan (HostInstall) — the gated steps
//        (wallet files, miner launch) stay approval-gated by design.
//
//   GET ?id=<hostId> — poll the provider for the server's lifecycle state and
//   capture the first public IPv4 into the host record.
//
// Both verbs touch spending credentials → POST is admin-only (same posture
// as provider keys); GET is session-gated read-only.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdmin, requireActiveUser } from "@/lib/auth-admin";
import { encryptSecret } from "@/lib/devops/crypto";
import { generateSshKeypair } from "@/lib/infranex/deployment/ssh-keys";
import { getProviderKey } from "@/lib/infranex/providers";
import {
  CPU_MIN_SPECS,
  buildBaseCloudInit,
  getCpuServerStatus,
  isCpuProviderId,
  provisionCpuServer,
  resolveCpuOffer,
} from "@/lib/infranex/cpu-providers";
import { pullSubnetRequirements } from "@/lib/devops/subnet-requirements";
import { buildInstallPlan } from "@/lib/devops/installer";
import { logAudit } from "@/lib/infranex/audit";

export const dynamic = "force-dynamic";

const NAME_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;

export async function POST(req: NextRequest) {
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = body?.provider;
  const offerId = typeof body?.offerId === "string" ? body.offerId.trim() : "";
  const region = typeof body?.region === "string" ? body.region.trim() : "";
  const netuid = parseInt(String(body?.netuid ?? ""), 10);
  const walletName = String(body?.walletName ?? "").trim();
  const hotkeyName = String(body?.hotkeyName ?? "").trim();
  const rawName = typeof body?.name === "string" ? body.name.trim().toLowerCase() : "";

  if (!isCpuProviderId(provider)) {
    return NextResponse.json({ error: "provider must be \"hetzner\" or \"digitalocean\"." }, { status: 400 });
  }
  if (!offerId) {
    return NextResponse.json({ error: "offerId is required." }, { status: 400 });
  }
  if (!Number.isFinite(netuid) || netuid < 0 || netuid > 1024) {
    return NextResponse.json({ error: "netuid must be 0-1024." }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(walletName)) {
    return NextResponse.json({ error: "walletName: 1-32 chars [a-zA-Z0-9_-]" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(hotkeyName)) {
    return NextResponse.json({ error: "hotkeyName: 1-32 chars [a-zA-Z0-9_-]" }, { status: 400 });
  }
  if (rawName && !NAME_RE.test(rawName)) {
    return NextResponse.json(
      { error: "name: 3-48 chars, lowercase letters/numbers/hyphens, starts alphanumeric." },
      { status: 400 }
    );
  }

  const resolvedKey = await getProviderKey(provider).catch(() => null);
  if (!resolvedKey) {
    return NextResponse.json(
      { error: `No ${provider} API key configured — connect it in the CPU Catalog first.` },
      { status: 400 }
    );
  }

  // The subnet's own requirements — pulled from its git repo (this is the
  // "engine pulls the required requirements from their git" step).
  let profile;
  try {
    ({ profile } = await pullSubnetRequirements(netuid));
  } catch (e) {
    return NextResponse.json(
      { error: `Requirements profiler failed for SN${netuid}: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  // Honest routing: a subnet whose repo documents GPU requirements does not
  // become CPU-mineable by renting a VPS.
  if (profile.minVramGb > 0) {
    return NextResponse.json(
      {
        error: `SN${netuid} (${profile.subnetName}) documents GPU requirements (≥ ${profile.minVramGb} GB VRAM, ${profile.recommendedGpu}). Rent it from the GPU Catalog instead.`,
      },
      { status: 400 }
    );
  }

  // Live-resolve the offer — price/spec drift or a dead type must fail here,
  // before any money is spent.
  let offer;
  try {
    offer = await resolveCpuOffer(provider, resolvedKey.key, offerId, region || undefined);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 }
    );
  }

  const short: string[] = [];
  if (offer.cpuCores < CPU_MIN_SPECS.cores) short.push(`${offer.cpuCores} vCPU < ${CPU_MIN_SPECS.cores}`);
  if (offer.ramGb < CPU_MIN_SPECS.ramGb) short.push(`${offer.ramGb} GB RAM < ${CPU_MIN_SPECS.ramGb} GB`);
  if (offer.diskGb < CPU_MIN_SPECS.diskGb) short.push(`${offer.diskGb} GB disk < ${CPU_MIN_SPECS.diskGb} GB`);
  if (short.length > 0) {
    return NextResponse.json(
      {
        error: `${offer.model} is below the CPU-mining floor (${short.join(", ")}). Bigger boxes stay profitable because CPU-subnet rewards don't depend on hardware size.`,
      },
      { status: 400 }
    );
  }

  const hostName = rawName || `sn${netuid}-cpu-${Math.random().toString(36).slice(2, 6)}`;

  // Ephemeral ed25519 keypair — public half goes to the provider, private
  // half is stored AES-256-GCM encrypted on the host record.
  const kp = generateSshKeypair(`infranex-cpu-${netuid}`);

  let server: { providerServerId: string; status: string; ip: string | null };
  try {
    server = await provisionCpuServer(provider, resolvedKey.key, {
      name: hostName,
      slug: offer.slug,
      region: offer.region,
      sshPublicKey: kp.publicKey,
      userData: buildBaseCloudInit(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }

  const host = await db.gpuHost.create({
    data: {
      name: hostName,
      transport: "ssh",
      host: server.ip ?? "provisioning",
      port: 22,
      user: "root",
      secretEnc: encryptSecret(kp.privateKey),
      authMethod: "key",
      provider,
      providerPodId: server.providerServerId,
      status: "pending",
      hostInfo: JSON.stringify({
        cpuModel: offer.model,
        cpuCores: offer.cpuCores,
        ramGb: offer.ramGb,
        diskGb: offer.diskGb,
        provider,
        region: offer.region,
        monthlyCostUsd: offer.monthlyPrice,
        provisionedVia: "cpu-catalog",
        provisionedAt: new Date().toISOString(),
      }),
    },
  });

  // Stage the subnet install plan for the DevOps Engine — the installer
  // turns the pulled profile into the executable 9-step plan. Steps execute
  // one at a time from the DevOps console; wallet + launch stay gated.
  let installId: string | null = null;
  let installStepCount = 0;
  try {
    const steps = buildInstallPlan({ profile, walletName, hotkeyName, hostFacts: null });
    await db.hostInstall.updateMany({
      where: { hostId: host.id, status: { in: ["staged", "running", "waiting_approval", "failed"] } },
      data: { status: "stopped" },
    });
    const install = await db.hostInstall.create({
      data: {
        hostId: host.id,
        netuid,
        subnetName: profile.subnetName,
        walletName,
        hotkeyName,
        status: "staged",
        requirementsJson: JSON.stringify(profile),
        stepsJson: JSON.stringify(steps),
      },
    });
    installId = install.id;
    installStepCount = steps.length;
  } catch {
    // Provisioning succeeded; staging is recoverable from the DevOps console.
  }

  await logAudit({
    action: "cpu-host.provisioned",
    actor: gate.session.uid,
    target: host.id,
    detail: `${offer.model} (${provider}, ${offer.region}) rented for SN${netuid} — ${offer.cpuCores} vCPU / ${offer.ramGb} GB / ${offer.diskGb} GB @ $${offer.monthlyPrice}/mo. Base stack installing via cloud-init; ${installStepCount > 0 ? `${installStepCount}-step install staged` : "install staging deferred"}.`,
    meta: {
      provider,
      offerId,
      netuid,
      providerServerId: server.providerServerId,
      monthlyUsd: offer.monthlyPrice,
    },
  });

  return NextResponse.json(
    {
      host: {
        id: host.id,
        name: host.name,
        provider,
        status: host.status,
        host: host.host,
        providerServerId: server.providerServerId,
      },
      server: { id: server.providerServerId, status: server.status, ip: server.ip },
      offer: {
        model: offer.model,
        region: offer.region,
        cpuCores: offer.cpuCores,
        ramGb: offer.ramGb,
        diskGb: offer.diskGb,
        hourlyPrice: offer.hourlyPrice,
        monthlyPrice: offer.monthlyPrice,
      },
      subnet: { netuid, name: profile.subnetName, repoUrl: profile.repoUrl },
      install: installId ? { id: installId, stepCount: installStepCount, staged: true } : null,
      sshPublicKey: kp.publicKey,
    },
    { status: 201 }
  );
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const host = await db.gpuHost.findUnique({ where: { id } });
  if (!host) return NextResponse.json({ error: "host not found" }, { status: 404 });
  if (!isCpuProviderId(host.provider) || !host.providerPodId) {
    return NextResponse.json({ error: "not a CPU-provisioned host" }, { status: 400 });
  }

  const resolvedKey = await getProviderKey(host.provider).catch(() => null);
  if (!resolvedKey) {
    return NextResponse.json({ host: { id: host.id, name: host.name, status: host.status, host: host.host }, server: null, error: "provider key removed" });
  }

  try {
    const status = await getCpuServerStatus(host.provider, resolvedKey.key, host.providerPodId);
    // Capture the first public IPv4 once the provider reports it.
    if (status.ip && host.host !== status.ip) {
      await db.gpuHost.update({ where: { id: host.id }, data: { host: status.ip } });
    }
    return NextResponse.json({
      host: {
        id: host.id,
        name: host.name,
        status: host.status,
        host: status.ip ?? host.host,
      },
      server: status,
    });
  } catch (e) {
    return NextResponse.json(
      {
        host: { id: host.id, name: host.name, status: host.status, host: host.host },
        server: null,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    );
  }
}
