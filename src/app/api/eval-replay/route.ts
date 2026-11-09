import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";
import { replayEval, PROSPECT_PERCENTILES, type ProspectKey } from "@/lib/infranex/eval-harness";
import { getUidState } from "@/lib/infranex/metagraph";

export const dynamic = "force-dynamic";

// GET /api/eval-replay?netuid=83&percentile=top10        — PROSPECT replay
// GET /api/eval-replay?netuid=83&hotkey=5F...            — MY-UID replay
//
// Score replay for one subnet: the live per-UID incentive vector is pulled
// straight off the chain (getUidState — the same 60s-cached read the UID
// defense uses), the money side comes from the latest chain snapshot (miner
// pool, realizability, TAO price) and the operator's $/mo target from
// ProfitabilitySettings. Everything dollar-shaped is "what the UID at that
// rank actually earns" — replay, not simulation of invented scores.

interface SnapshotSub {
  netuid: number;
  minerEmissionTaoPerDay?: number | null;
  minersCount?: number | null;
  rewardedMiners?: number | null;
  rewardRealizability?: number | null;
  top10IncentiveShare?: number | null;
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const sp = req.nextUrl.searchParams;
  const netuidRaw = sp.get("netuid");
  const netuid = netuidRaw != null ? Number(netuidRaw) : NaN;
  if (!Number.isInteger(netuid) || netuid < 0 || netuid > 1024) {
    return NextResponse.json({ error: "netuid must be an integer 0-1024" }, { status: 400 });
  }

  const hotkey = sp.get("hotkey");
  const percentileParam = sp.get("percentile");
  const uidParam = sp.get("uid");

  let prospectKey: ProspectKey | null = null;
  if (percentileParam) {
    const found = PROSPECT_PERCENTILES.find((p) => p.key === percentileParam);
    if (!found) {
      return NextResponse.json(
        { error: `percentile must be one of: ${PROSPECT_PERCENTILES.map((p) => p.key).join(", ")}` },
        { status: 400 }
      );
    }
    prospectKey = found.key;
  }
  if (!prospectKey && !hotkey) {
    return NextResponse.json(
      { error: "pass percentile=<key> (prospect replay) or hotkey=<ss58> (my-uid replay)" },
      { status: 400 }
    );
  }

  // Money side — same snapshot the explorer / rank-sim read.
  const [snap, prof] = await Promise.all([
    db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
    db.profitabilitySettings.findFirst(),
  ]);
  const taoUsd = snap?.taoPriceUsd ?? 0;
  const sub: SnapshotSub | undefined = snap
    ? (JSON.parse(snap.subnetsJson) as SnapshotSub[]).find((s) => s.netuid === netuid)
    : undefined;

  const targetUsdPerMonth = prof?.minNetProfitTargetUsd ?? 300;

  // Live per-UID vectors (~3s RPC, 60s server-side vector cache).
  let state;
  try {
    state = await getUidState(netuid, hotkey ?? null);
  } catch {
    return NextResponse.json(
      { error: "chain read failed — the finney entrypoint is unreachable right now" },
      { status: 502 }
    );
  }

  const vectors = state.vectors;
  if (!vectors || vectors.incentive.length === 0) {
    return NextResponse.json(
      { error: `no incentive vector available for SN${netuid} (empty subnet or runtime drift)` },
      { status: 502 }
    );
  }

  const replay = replayEval(
    netuid,
    {
      incentive: vectors.incentive,
      poolTaoPerDay: sub?.minerEmissionTaoPerDay ?? null,
      rewardRealizability: sub?.rewardRealizability ?? null,
      taoUsd,
      targetUsdPerMonth,
      minersCount: sub?.minersCount ?? null,
      rewardedMiners: sub?.rewardedMiners ?? null,
      top10IncentiveShare: sub?.top10IncentiveShare ?? null,
    },
    {
      prospect: prospectKey ?? undefined,
      myUid: hotkey
        ? {
            uid: state.uid ?? (uidParam != null ? Number(uidParam) : null),
            lastUpdateBlock:
              state.uid != null && vectors.lastUpdateBlock.length > state.uid
                ? vectors.lastUpdateBlock[state.uid]
                : null,
          }
        : undefined,
    }
  );

  return NextResponse.json(
    {
      ...replay,
      meta: {
        hyperparams: state.hyperparams,
        vectorBlock: vectors.blockNumber,
        fetchedAt: state.fetchedAt,
        snapshotAt: snap?.createdAt ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
