import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";
import { buildLive, type LandscapeLive } from "@/lib/infranex/gpu-landscape";

export const dynamic = "force-dynamic";

// GET /api/playbook — MINER-PLAYBOOK-1: per-subnet miner intelligence
// (what it does / hardware / requirements / miner job / top-10 strategy /
// follow-the-leaders) joined with live yield metrics from the latest chain
// snapshot and the scraped GPU/hosting requirements.
export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check).
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [plays, rows, snap] = await Promise.all([
    db.subnetPlaybook.findMany({ orderBy: { netuid: "asc" } }),
    db.subnetOverride.findMany({
      select: {
        netuid: true,
        name: true,
        category: true,
        recommendedGpu: true,
        minVramGb: true,
        gpuCount: true,
        hostingRequirements: true,
        githubUrl: true,
        website: true,
      },
      orderBy: { netuid: "asc" },
    }),
    db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  const taoUsd = snap?.taoPriceUsd ?? 0;
  const liveList = snap ? (JSON.parse(snap.subnetsJson) as Record<string, unknown>[]) : [];
  const liveByNetuid = new Map<number, LandscapeLive>();
  for (const s of liveList) {
    const netuid = typeof s.netuid === "number" ? s.netuid : Number(s.netuid);
    if (!Number.isFinite(netuid)) continue;
    liveByNetuid.set(
      netuid,
      buildLive(
        {
          minersCount: s.minersCount as number | null | undefined,
          rewardedMiners: s.rewardedMiners as number | null | undefined,
          minerEmissionTaoPerDay: s.minerEmissionTaoPerDay as number | null | undefined,
          rewardRealizability: s.rewardRealizability as number | null | undefined,
        },
        taoUsd
      )
    );
  }

  const byNetuid = new Map(rows.map((r) => [r.netuid, r]));
  const entries = plays
    .map((p) => {
      const o = byNetuid.get(p.netuid);
      let hosting: Record<string, unknown> | null = null;
      try {
        hosting = o?.hostingRequirements ? JSON.parse(o.hostingRequirements) : null;
      } catch {}
      const b = (v: unknown) => v === true;
      return {
        netuid: p.netuid,
        name: o?.name ?? `SN${p.netuid}`,
        category: o?.category ?? null,
        gpu: o?.recommendedGpu ?? null,
        minVramGb: o?.minVramGb ?? null,
        gpuCount: o?.gpuCount ?? null,
        hosting: hosting
          ? {
              bareMetal: b(hosting.bareMetal) || b(hosting.bareMetalOnly),
              tee: b(hosting.tee) || b(hosting.teeRequired),
              staticIp: b(hosting.staticIp) || b(hosting.staticIpRequired),
            }
          : null,
        githubUrl: o?.githubUrl ?? null,
        website: o?.website ?? null,
        live: liveByNetuid.get(p.netuid) ?? null,
        whatItDoes: p.whatItDoes,
        hardwareRec: p.hardwareRec,
        keyRequirements: safeArr(p.keyRequirements),
        minerJob: p.minerJob,
        minerJobProvide: safeArr(p.minerJobProvide),
        top10Strategy: p.top10Strategy,
        top10Levers: safeArr(p.top10Levers),
        followTopMiners: p.followTopMiners,
        confidence: p.confidence,
        sources: safeSources(p.sources),
        researchedAt: p.researchedAt,
      };
    })
    .sort((a, b) => (b.live?.perEarningUsdPerDay ?? -1) - (a.live?.perEarningUsdPerDay ?? -1));

  return NextResponse.json(
    {
      meta: {
        blockNumber: snap?.blockNumber ?? null,
        taoPriceUsd: taoUsd,
        snapshotAt: snap?.createdAt ?? null,
        totalSubnets: entries.length,
      },
      entries,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

function safeArr(json: string | null): string[] {
  try {
    const v = json ? JSON.parse(json) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch {
    return [];
  }
}

function safeSources(json: string | null): Array<{ label: string; url: string }> {
  try {
    const v = json ? JSON.parse(json) : [];
    return Array.isArray(v)
      ? v.filter((x) => x && typeof x.url === "string").map((x) => ({ label: String(x.label ?? "source"), url: x.url }))
      : [];
  } catch {
    return [];
  }
}
