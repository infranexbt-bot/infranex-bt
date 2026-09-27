import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { getUidState } from "@/lib/infranex/metagraph";
import { getChainApi } from "@/lib/infranex/chain";
import { encodeAddress } from "@polkadot/util-crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/subnets/[netuid]/neurons — live per-UID metagraph for a subnet.
//
// Reads the SAME chain storage the validator chain itself uses (Active,
// Incentive, Consensus, Emission, ValidatorTrust, LastUpdate via
// getUidState's 60s vector cache) and adds a best-effort batch hotkey scan
// (Keys double map, one state_queryStorageAt for all uids). "Active" is the
// chain's own activity flag — a UID is active when it has recently served
// validator queries; "earning" means it held incentive in the last epoch.

interface NeuronRow {
  uid: number;
  hotkey: string | null;
  active: boolean;
  tier: "earning" | "active" | "stale" | "idle";
  incentive: number; // 0-1 normalized
  consensus: number; // 0-1
  validatorTrust: number; // 0-1
  emissionRel: number; // 0-1 relative to top earner
  blocksSinceUpdate: number | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ netuid: string }> }
) {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check).
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { netuid } = await params;
  const n = parseInt(netuid, 10);
  if (!Number.isInteger(n) || n < 0 || n > 1024) {
    return NextResponse.json({ error: "Invalid netuid" }, { status: 400 });
  }

  let state: Awaited<ReturnType<typeof getUidState>>;
  try {
    // No hotkey → skips the expensive per-hotkey key scan; vectors are cached.
    state = await getUidState(n);
  } catch (e) {
    return NextResponse.json(
      { error: `Chain query failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 }
    );
  }

  const v = state.vectors;
  if (!v) {
    return NextResponse.json(
      { error: `Metagraph vectors unavailable for α${n} (chain returned no vectors)` },
      { status: 502 }
    );
  }
  const count = Math.min(v.registeredUids, 1024);

  // Best-effort hotkey resolution — one batched .multi() round-trip for all
  // uids (same shape handling as findUidByHotkey: Option or auto-unwrapped
  // AccountId32). Failure degrades gracefully: rows keep hotkey=null.
  const hotkeys: (string | null)[] = new Array(count).fill(null);
  if (count > 0) {
    try {
      const api = await getChainApi();
      const args: [number, number][] = [];
      for (let uid = 0; uid < count; uid++) args.push([n, uid]);
      const results = await (api.query.subtensorModule as unknown as Record<string, any>)
        .keys.multi(args);
      for (let i = 0; i < results.length && i < count; i++) {
        const opt = results[i] as any;
        if (!opt) continue;
        if (typeof opt.isSome === "boolean" && !opt.isSome) continue;
        const raw = opt.value !== undefined && opt.value?.toU8a ? opt.value : opt.inner ?? opt;
        const bytes = raw?.toU8a ? raw.toU8a() : raw;
        if (!bytes) continue;
        const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (arr.length !== 32) continue;
        if (arr.every((b: number) => b === 0)) continue;
        try {
          hotkeys[i] = encodeAddress(arr, 42);
        } catch {
          // unencodable bytes — leave null
        }
      }
    } catch {
      // keys scan failed — hotkeys stay null, vectors still shown
    }
  }

  // 7200 blocks ≈ 1 day @ 12s — an idle uid with no chain update for a day
  // is flagged stale so operators can tell dormant seats from merely
  // unrewarded ones.
  const STALE_BLOCKS = 7200;
  const rows: NeuronRow[] = [];
  for (let uid = 0; uid < count; uid++) {
    const incentive = v.incentive[uid] ?? 0;
    const active = v.active[uid] ?? false;
    const lu = v.lastUpdateBlock[uid] ?? 0;
    // LastUpdate stores the absolute block of the neuron's last chain update;
    // guard against clock/storage drift by clamping at 0.
    const blocksSinceUpdate =
      lu > 0 && v.blockNumber >= lu ? v.blockNumber - lu : null;
    let tier: NeuronRow["tier"];
    if (incentive > 0.0005) tier = "earning";
    else if (active) tier = "active";
    else tier = "idle";
    if (tier === "idle" && blocksSinceUpdate !== null && blocksSinceUpdate > STALE_BLOCKS) {
      tier = "stale";
    }
    rows.push({
      uid,
      hotkey: hotkeys[uid],
      active,
      tier,
      incentive,
      consensus: v.consensus[uid] ?? 0,
      validatorTrust: v.validatorTrust[uid] ?? 0,
      emissionRel: v.emissionRel[uid] ?? 0,
      blocksSinceUpdate,
    });
  }

  const activeCount = rows.filter((r) => r.active).length;
  const earningCount = rows.filter((r) => r.tier === "earning").length;

  return NextResponse.json(
    {
      netuid: n,
      blockNumber: v.blockNumber,
      registeredUids: v.registeredUids,
      maxAllowedUids: state.hyperparams.maxAllowedUids,
      tempo: state.hyperparams.tempo,
      immunityPeriod: state.hyperparams.immunityPeriod,
      summary: {
        activeCount,
        earningCount,
        medianRewardedIncentive: state.cohort.medianRewardedIncentive,
      },
      rows,
      fetchedAt: state.fetchedAt,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
