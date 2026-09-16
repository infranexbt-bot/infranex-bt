import { NextRequest, NextResponse } from "next/server";
import {
  createDeployment,
  listDeployments,
} from "@/lib/infranex/deployment/engine";
import { fetchLiveSnapshot } from "@/lib/infranex/chain";
import { pullSubnetRequirements } from "@/lib/devops/subnet-requirements";
import { computeDeploymentProjection } from "@/lib/infranex/trust";
import type { SubnetProfileHint } from "@/lib/infranex/deployment/config";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { requireActiveAdmin } from "@/lib/auth-admin";

// AUDIT-SEC-1 — wallet/hotkey/miner names reach shell commands on the target
// host (env files, systemd units, docker names) and Prisma records; restrict
// to a safe charset so no quoting/escaping trick can inject commands.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function validName(v: string | undefined): v is string {
  return !!v && NAME_RE.test(v);
}
import type { Subnet, GPUOffer } from "@/lib/infranex/types";

export const dynamic = "force-dynamic";

// GET /api/deployments — list deployments.
// TIER4 light tenancy: ?scope=mine restricts the list to the caller's own
// deployments (ownerUserId). Default (no scope) returns everything — the
// team-shared model: pre-tenancy rows have no owner and stay visible to all.
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope");
  if (scope === "mine") {
    const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (session?.uid) {
      const deployments = await listDeployments({ ownerUserId: session.uid });
      return NextResponse.json({ deployments });
    }
  }
  const deployments = await listDeployments();
  return NextResponse.json({ deployments });
}

// DATA-AUDIT-1 — every deployment resolves from the LIVE chain snapshot
// (min VRAM + GPU come from the cached requirements profile so the
// installer's compat gate stays accurate). The old curated-catalog branch —
// which returned fabricated prices/market data for 16 netuids — is gone.
// This is what lets the wizard deploy to ALL ~120 live subnets.
async function resolveSubnet(netuid: number): Promise<Subnet | null> {
  try {
    const snap = await fetchLiveSnapshot();
    const m = snap.subnets.find((s) => s.netuid === netuid);
    if (!m) return null;

    let minVramGb = 24;
    let recommendedGpu = "H100";
    try {
      const { profile } = await pullSubnetRequirements(netuid);
      if (profile.minVramGb > 0) minVramGb = profile.minVramGb;
      if (profile.recommendedGpu) recommendedGpu = profile.recommendedGpu;
    } catch {
      // profiler unavailable — generic fallbacks above
    }

    const name = m.name ?? `Subnet ${netuid}`;
    return {
      netuid,
      name,
      symbol: name.replace(/[^A-Za-z0-9]/g, "").slice(0, 5).toUpperCase() || `S${netuid}`,
      description: m.identityDescription ?? "",
      category: "Live",
      owner: m.owner ?? "",
      tempo: m.tempo || 360,
      emission: m.emission ?? 0,
      taoInReserve: m.subnetTao ?? 0,
      price: m.movingPrice ?? 0,
      marketCap: 0,
      volume24h: 0,
      change24h: 0,
      minersCount: m.minersCount,
      validatorsCount: m.validatorsCount ?? 0,
      maxNeurons: m.maxUids ?? 256,
      status: m.emissionEnabled ? "active" : "inactive",
      // No chain source for registration openness — honest default.
      registrationOpen: false,
      createdAt: m.registeredAt ? String(m.registeredAt) : new Date().toISOString(),
      tags: [],
      minVramGb,
      recommendedGpu,
      burnCostTao: m.burnCostTao ?? null,
      immunityBlocks: m.immunityBlocks ?? null,
      maxUids: m.maxUids ?? null,
      rewardedMiners: m.rewardedMiners ?? null,
    } as Subnet;
  } catch {
    return null;
  }
}

// POST /api/deployments — create a new deployment (spends real provider
// credit → admin-gated; AUDIT-SEC-3).
export async function POST(req: NextRequest) {
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const body = await req.json();
    const { netuid, offerId, minerName, hotkey, walletName, mode } = body as {
      netuid: number;
      offerId: string;
      minerName: string;
      hotkey?: string;
      walletName?: string;
      mode: "runpod" | "vast";
    };

    // MOCK-PURGE-1 — mock deployments are engine-test-harness-only; the live
    // API provisions real rentals exclusively.
    if (mode !== "runpod" && mode !== "vast") {
      return NextResponse.json({ error: "mode must be runpod or vast" }, { status: 400 });
    }

    // AUDIT-SEC-1 — charset-validate every name that flows into shell
    // commands on the target host (install plan env/unit lines) — a name
    // like "x';reboot;'a" previously escaped its quoting.
    if (!validName(minerName?.trim())) {
      return NextResponse.json(
        { error: "minerName must be 1-64 chars: letters, digits, dot, dash, underscore (must start alphanumeric)" },
        { status: 400 }
      );
    }
    if (walletName && !validName(walletName.trim())) {
      return NextResponse.json(
        { error: "walletName must be 1-64 chars: letters, digits, dot, dash, underscore (must start alphanumeric)" },
        { status: 400 }
      );
    }
    if (hotkey && !validName(hotkey.trim())) {
      return NextResponse.json(
        { error: "hotkey name must be 1-64 chars: letters, digits, dot, dash, underscore (must start alphanumeric)" },
        { status: 400 }
      );
    }

    const subnet = await resolveSubnet(netuid);
    if (!subnet) return NextResponse.json({ error: "Subnet not found" }, { status: 400 });

    // MOCK-PURGE-2 — offers resolve from LIVE provider catalogs only. The
    // curated o1..o14 "fast path" was a mock-mode leftover (fabricated
    // marketplace prices) and is gone; with no provider key configured the
    // POST fails honestly until a real key is added in the GPU catalog.
    let offer: GPUOffer | undefined;
    try {
      const { fetchAllLiveOffers } = await import("@/lib/infranex/providers");
      const snap = await fetchAllLiveOffers();
      offer = snap.offers.find((o) => o.id === offerId) ?? undefined;
    } catch {
      offer = undefined;
    }
    if (!offer) {
      return NextResponse.json(
        { error: "GPU offer not found — connect a provider API key in the GPU catalog and pick a live offer" },
        { status: 400 }
      );
    }

    if (!minerName?.trim()) {
      return NextResponse.json({ error: "minerName is required" }, { status: 400 });
    }

    // OVERLAY-2 — pull the requirements profile (6h DB cache) so the pod
    // template + runtime requirements reflect THIS subnet's repo instead of
    // a category template: CUDA-matched image, parsed entrypoint, real
    // python/cuda versions. Failure is non-fatal (template fallback).
    let profileHint: SubnetProfileHint | null = null;
    try {
      profileHint = (await pullSubnetRequirements(netuid)).profile;
    } catch {
      profileHint = null;
    }

    // TRUST-LOOP — snapshot the subnet's chain-measured earning rate NOW;
    // this is the number the miner's actuals will be judged against for its
    // whole life. Null (offline chain, zero-emission subnet) = honest
    // no-projection, the miner just gets no trust verdict.
    const projection = await computeDeploymentProjection(netuid).catch(
      () => null
    );

    // TIER4 — attribute the deployment to its creator (light tenancy).
    const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    const deployment = await createDeployment({
      subnet,
      offer,
      minerName: minerName.trim(),
      hotkey: hotkey?.trim() || undefined,
      walletName: walletName?.trim() || undefined,
      mode,
      profileHint,
      projection,
      owner: session?.uid
        ? { userId: session.uid, label: session.label ?? undefined }
        : undefined,
    });

    return NextResponse.json({ deployment }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
