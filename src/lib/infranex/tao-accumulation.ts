import type { LiveOpportunity } from "./live-merge";
import type { NetEarningsEstimate } from "./net-earnings";

// ---------------------------------------------------------------------------
// TAO-ACCUMULATION-1 — "My goal is to accumulate TAO, not to mine the most
// emission." The user's bet: mining is the ACQUISITION mechanism for TAO
// (~$248 and long-term bullish); the target pace is ~1 TAO/month. So the
// question the app must answer per subnet is not "what $/mo does it net" but
// "how many TAO does a NEW miner actually BANK per month after converting
// the α rewards at realizable prices".
//
// This module is a RE-DENOMINATION + GOAL layer over the net-earnings engine
// (net-earnings.ts), never a second source of truth:
//
//   grossTaoPerMonth = base gross USD  ÷ live TAO price
//                      (the ledger top line is ALREADY realizable TAO — the
//                       chain rewardRealizability haircut is applied inside
//                       miner-score before any USD math happens)
//   costsTaoPerMonth = cost stack USD  ÷ live TAO price
//   netTaoPerMonth   = grossTao − costsTao          ← the headline number
//   goalPct          = netTao ÷ targetTaoPerMonth   ← progress vs the goal
//
// Scenarios carry over 1:1 (conservative ≤ base ≤ optimistic) by dividing the
// net-earnings USD months by the same TAO price, so the two views can never
// disagree — the verify script asserts this bijection.
//
// The hold-α path (keep the alpha, don't convert) is shown as ONE comparison
// line: staying in α is a bet on that subnet, not on TAO — the user's bet is
// TAO, so conversion is the primary path.
//
// HONESTY CONTRACT — same as live-merge/net-earnings: provider-marketplace
// rows (SN51) earn USD-denominated rental income, NOT α, so their physical
// α/month is null and flagged; a missing TAO price or missing estimate yields
// no row at all, never a fabricated one.
// ---------------------------------------------------------------------------

export type TaoVerdict = "GOAL_MET" | "PROGRESS" | "NEGATIVE";

export interface TaoAccumulation {
  id: string;
  netuid: number;
  subnetName: string;
  /** Live TAO price the whole re-denomination used. */
  taoPriceUsd: number;
  /** Physical α the newcomer mines per month (null for provider-marketplace
   *  rows — their income is USD rental, not α tokens). */
  alphaPerMonth: number | null;
  /** Realizable TAO the base month grosses (slippage already inside). */
  grossTaoPerMonth: number;
  /** Extra haircut the chain's realizability already charged vs spot (%). */
  conversionHaircutPct: number | null;
  /** Monthly bill re-denominated to TAO at the live price. */
  costsTaoPerMonth: number;
  /** BASE month headline: what you actually bank in TAO. */
  netTaoPerMonth: number;
  conservativeNetTaoPerMonth: number;
  optimisticNetTaoPerMonth: number;
  /** User goal (settings), TAO/month. */
  targetTaoPerMonth: number;
  /** netTao ÷ target (×1.0 = goal exactly met). Null when target is 0. */
  goalRatio: number | null;
  verdict: TaoVerdict;
  /** TAO-side pool depth = exit liquidity for converting the α. */
  poolDepthTao: number | null;
  /** Thin pool → converting large α flows realizes badly. */
  thinPool: boolean;
  /** One-sentence comparison for the hold-α path (null when not meaningful). */
  holdAlphaNote: string | null;
}

export interface TaoAccumulationContext {
  /** Live TAO price (snap.taoPriceUsd). Required — no price, no row. */
  taoPriceUsd?: number;
  /** User goal in TAO/month (settings.targetTaoPerMonth, default 1). */
  targetTaoPerMonth?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeTaoAccumulation(
  o: LiveOpportunity,
  est: NetEarningsEstimate,
  ctx: TaoAccumulationContext = {}
): TaoAccumulation | null {
  const taoUsd = ctx.taoPriceUsd ?? 0;
  if (!(taoUsd > 0)) return null; // no price → no honest re-denomination
  const target = Math.max(ctx.targetTaoPerMonth ?? 1, 0);

  // Re-denomination (single source of truth: the net-earnings estimate).
  const grossTaoPerMonth = est.base.grossMonthlyUsd / taoUsd;
  const costsTaoPerMonth = est.costs.totalUsd / taoUsd;
  const netTaoPerMonth = grossTaoPerMonth - costsTaoPerMonth;
  const conservativeNetTaoPerMonth = est.conservative.netMonthlyUsd / taoUsd;
  const optimisticNetTaoPerMonth = est.optimistic.netMonthlyUsd / taoUsd;

  // Physical α path — provider-marketplace rows earn USD, not α.
  const isProvider = o.revenueBasis === "provider-marketplace";
  const realizableAlphaUsd = o.realizableAlphaPriceUsd ?? 0;
  const alphaPerMonth =
    !isProvider && realizableAlphaUsd > 0
      ? est.base.grossMonthlyUsd / realizableAlphaUsd
      : null;

  const realizability =
    o.rewardRealizability != null && o.rewardRealizability > 0
      ? Math.min(o.rewardRealizability, 1)
      : null;
  const conversionHaircutPct =
    realizability != null ? r2((1 - realizability) * 100) : null;

  const poolDepthTao = o.liquidityTao ?? null;
  const thinPool =
    poolDepthTao != null &&
    (poolDepthTao < 1000 || (o.slippagePct != null && o.slippagePct > 5));

  const goalRatio = target > 0 ? r2(netTaoPerMonth / target) : null;
  // Verdict is computed on the ROUNDED net so the chip always agrees with the
  // number the user can actually see (same principle as the net-earnings
  // confidence banding).
  const netTaoRounded = r2(netTaoPerMonth);
  const verdict: TaoVerdict =
    netTaoRounded >= target ? "GOAL_MET" : netTaoRounded > 0 ? "PROGRESS" : "NEGATIVE";

  // Hold-α comparison — one honest sentence, α units when we know them.
  let holdAlphaNote: string | null = null;
  if (alphaPerMonth != null && alphaPerMonth > 0) {
    const price = o.livePrice ?? null;
    const chg = o.alphaChange24h ?? null;
    holdAlphaNote =
      `hold instead: ${alphaPerMonth < 10 ? alphaPerMonth.toFixed(2) : Math.round(alphaPerMonth).toLocaleString()} α/mo` +
      (price != null ? ` (α at ${price < 0.01 ? price.toFixed(4) : price.toFixed(3)} TAO` : "") +
      (chg != null ? `, 24h ${chg > 0 ? "+" : ""}${chg.toFixed(1)}%` : "") +
      (price != null ? ")" : "") +
      " — keeping α bets on this subnet; converting banks TAO.";
  } else if (isProvider) {
    holdAlphaNote =
      "provider-marketplace income is USD-denominated rental revenue — buy TAO with it after payout (no α to hold).";
  }

  return {
    id: o.id,
    netuid: o.netuid,
    subnetName: o.subnetName,
    taoPriceUsd: taoUsd,
    alphaPerMonth: alphaPerMonth != null ? r2(alphaPerMonth) : null,
    grossTaoPerMonth: r2(grossTaoPerMonth),
    conversionHaircutPct,
    costsTaoPerMonth: r2(costsTaoPerMonth),
    netTaoPerMonth: r2(netTaoPerMonth),
    conservativeNetTaoPerMonth: r2(conservativeNetTaoPerMonth),
    optimisticNetTaoPerMonth: r2(optimisticNetTaoPerMonth),
    targetTaoPerMonth: target,
    goalRatio,
    verdict,
    poolDepthTao,
    thinPool,
    holdAlphaNote,
  };
}

/** One pass over rows+estimates — rows without an estimate yield nothing. */
export function computeTaoAccumulationMap(
  rows: LiveOpportunity[],
  estByRow: Map<string, NetEarningsEstimate>,
  ctx: TaoAccumulationContext = {}
): Map<string, TaoAccumulation> {
  const m = new Map<string, TaoAccumulation>();
  for (const r of rows) {
    if (!r?.id) continue;
    const est = estByRow.get(r.id);
    if (!est) continue;
    try {
      const t = computeTaoAccumulation(r, est, ctx);
      if (t) m.set(r.id, t);
    } catch {
      // A row that cannot be re-denominated must never break the table.
    }
  }
  return m;
}

/** Ranking helper — most TAO banked per month first (the user's goal), ties
 *  broken by the conservative month. Rows without accumulation sink. */
export function rankByTaoAccumulation<T extends LiveOpportunity>(
  rows: T[],
  map: Map<string, TaoAccumulation>
): T[] {
  return [...rows].sort((a, b) => {
    const ta = map.get(a.id ?? "");
    const tb = map.get(b.id ?? "");
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    if (tb.netTaoPerMonth !== ta.netTaoPerMonth)
      return tb.netTaoPerMonth - ta.netTaoPerMonth;
    return tb.conservativeNetTaoPerMonth - ta.conservativeNetTaoPerMonth;
  });
}

export const TAO_VERDICT_META: Record<
  TaoVerdict,
  { label: string; className: string; detail: string }
> = {
  GOAL_MET: {
    label: "✓ Goal met",
    className: "text-success border-success/40 bg-success/10",
    detail: "Base month banks at least the TAO goal after converting α at realizable prices.",
  },
  PROGRESS: {
    label: "Under goal",
    className: "text-warning border-warning/40 bg-warning/10",
    detail: "Cash-positive in TAO but below the monthly goal — size or stack accordingly.",
  },
  NEGATIVE: {
    label: "Burns TAO",
    className: "text-destructive border-destructive/40 bg-destructive/10",
    detail: "Costs exceed realizable rewards — every month mined reduces TAO holdings.",
  },
};
