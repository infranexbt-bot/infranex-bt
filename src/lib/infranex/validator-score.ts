// ---------------------------------------------------------------------------
// VALIDATOR STAKE SCORE (0–100) — the per-(subnet, validator) decision number
// for staking, built in the exact pattern of opportunity-score.ts (the miner
// scoring): documented weighted components, explicit normalization formulas,
// missing-data neutrality, risk haircuts, honesty gates.
//
//   yieldEdge            30%   sustainable net APY edge over the root baseline
//   rewardQuality        20%   realizable/spot — demand-backed flow vs paper α price
//   exitLiquidity        15%   pool depth + round-trip exit slippage for S
//   takeEfficiency       10%   commission drag (0% → 100, 18% → 55, ≥36% → 5)
//   decentralization     10%   1 − top-validator concentration (whale-lane risk)
//   priceStability       10%   |α 24h| drift calm (≤5% → 100, ≥25% → 15)
//   dilutionDiscipline    5%   dilutionRatio (≤1× → 100, ≥10× → 10)
//
// NORMALIZATION (documented formulas):
//   yieldEdge        edge = sustainableApyPct − rootBaselineApyPct (pp)
//                    pts = 100·ln(1 + max(edge,0)/2) / ln(1 + 30/2)
//                    (edge 2pp ≈ 25, 10pp ≈ 65, ≥30pp = 100; edge ≤ 0 → 0)
//   rewardQuality    ratio = realizable/spot (≤1 by construction)
//                    pts = clamp((ratio − 0.6)/0.4 × 100)
//                    (ratio 1.0 → 100, 0.9 → 75, 0.8 → 50, ≤0.6 → 0)
//   exitLiquidity    slippage spine (≤0.5%→100, ≤1%→85, ≤3%→60, ≤5%→35,
//                    >5%→10) × depth factor (≥100k TAO→1.0, ≥50k→0.9,
//                    ≥10k→0.7, ≥1k→0.5, <1k→0.25)
//   takeEfficiency   pts = clamp(100 − takePct×2.5, 5, 100)
//   decentralization pts = clamp(100 − (concPct − 30)×1.4, 5, 100)
//                    (≤30% whale-free → 100, 70% → 44, 100% → 5)
//   priceStability   pts = clamp(100 − (|d24| − 5)×4.25, 10, 100)
//                    (≤5%/24h → 100, 20% → 36, ≥25% → 15)
//   dilutionDisc.    pts = clamp(100 − (ratio − 1)×10, 10, 100)
//
// MISSING DATA RULE (same spirit as opportunity-score): a component without
// inputs scores a BELOW-AVERAGE neutral (35) — never above a measured
// median — and is flagged in `flags` so the UI can show why.
//
// HONESTY GATES:
//   - verdict AVOID (root-losing or α crashing) caps the score at 25 — a
//     pick can never headline on component math alone.
//   - the score never overrides the verdict; UI shows both.
//   - score is a comparative lens over the SAME auditable inputs the APY
//     math uses — no new data sources, nothing fabricated.
//
// GRADES: A ≥ 75 · B ≥ 60 · C ≥ 45 · D < 45.
// ---------------------------------------------------------------------------

export type ValidatorVerdict = "STRONG" | "VIABLE" | "SPECULATIVE" | "AVOID";

export interface ValidatorScoreInput {
  /** Sustainable net APY % for the user's stake (take-adjusted, realizable). */
  sustainableApyPct: number;
  /** Root net APY % this pick must beat. */
  rootBaselineApyPct: number;
  realizableTao: number;
  alphaSpotTao: number;
  poolTao: number;
  /** Round-trip exit slippage for the user's stake, % (null = uncomputable). */
  exitSlippagePct: number | null;
  /** Delegate take, % (0..50). */
  takePct: number;
  /** Top validator capture share of the lane, % (null = unknown). */
  concentrationPct: number | null;
  /** α price change 24h, % (null = unknown). */
  alphaChange24hPct: number | null;
  /** α rewards ÷ TAO inflow (null = unknown). */
  dilutionRatio: number | null;
  verdict: ValidatorVerdict;
}

export interface ValidatorScorePart {
  key: string;
  label: string;
  /** Weight in percent (of the 0–100 total). */
  weightPct: number;
  /** Raw component points 0–100. */
  points: number;
  /** Weighted contribution to the final score. */
  weighted: number;
  /** False when the component fell back to missing-data neutral. */
  measured: boolean;
  note: string;
}

export interface ValidatorScoreResult {
  /** 0–100, 1dp. */
  score: number;
  grade: "A" | "B" | "C" | "D";
  parts: ValidatorScorePart[];
  flags: string[];
  /** True when the AVOID honesty cap clipped the composite. */
  cappedByVerdict: boolean;
}

const WEIGHTS = {
  yieldEdge: 30,
  rewardQuality: 20,
  exitLiquidity: 15,
  takeEfficiency: 10,
  decentralization: 10,
  priceStability: 10,
  dilutionDiscipline: 5,
} as const;

const MISSING_NEUTRAL = 35;
const AVOID_CAP = 25;
const LN_DENOM = Math.log(1 + 30 / 2);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

export function validatorStakeScore(input: ValidatorScoreInput): ValidatorScoreResult {
  const parts: ValidatorScorePart[] = [];
  const flags: string[] = [];
  const push = (
    key: string,
    label: string,
    weightPct: number,
    points: number,
    measured: boolean,
    note: string
  ) => {
    if (!measured) {
      flags.push(`${label} unmeasured → neutral 35`);
    }
    parts.push({
      key,
      label,
      weightPct,
      points: r1(points),
      weighted: r1((points * weightPct) / 100),
      measured,
      note,
    });
  };

  // 1 — yield edge over root (the reason to leave root at all)
  const edge = input.sustainableApyPct - input.rootBaselineApyPct;
  const edgePts = edge <= 0 ? 0 : clamp((100 * Math.log(1 + edge / 2)) / LN_DENOM, 0, 100);
  push(
    "yieldEdge",
    "Yield edge vs root",
    WEIGHTS.yieldEdge,
    edgePts,
    true,
    edge <= 0
      ? `no edge — ${r1(input.sustainableApyPct)}% ≤ root ${r1(input.rootBaselineApyPct)}%`
      : `+${r1(edge)}pp over root ${r1(input.rootBaselineApyPct)}%`
  );

  // 2 — reward quality: how much of the daily α flow actually sells at value
  const ratio =
    input.alphaSpotTao > 0 && input.realizableTao > 0
      ? Math.min(input.realizableTao / input.alphaSpotTao, 1)
      : null;
  const rewardPts =
    ratio == null ? MISSING_NEUTRAL : clamp(((ratio - 0.6) / 0.4) * 100, 0, 100);
  push(
    "rewardQuality",
    "Reward quality",
    WEIGHTS.rewardQuality,
    rewardPts,
    ratio != null,
    ratio == null
      ? "realizable price unknown"
      : `realizable ${r1(ratio * 100)}% of α spot`
  );

  // 3 — exit liquidity: slippage spine × pool depth factor
  let liqPts: number;
  let liqNote: string;
  if (input.exitSlippagePct == null) {
    liqPts = MISSING_NEUTRAL;
    liqNote = "slippage uncomputable";
  } else {
    const s = input.exitSlippagePct;
    const slipPts = s <= 0.5 ? 100 : s <= 1 ? 85 : s <= 3 ? 60 : s <= 5 ? 35 : 10;
    const p = input.poolTao;
    const depth = p >= 100_000 ? 1 : p >= 50_000 ? 0.9 : p >= 10_000 ? 0.7 : p >= 1_000 ? 0.5 : 0.25;
    liqPts = slipPts * depth;
    liqNote = `slip ${r1(s)}% · pool ${Math.round(p)} TAO`;
  }
  push("exitLiquidity", "Exit liquidity", WEIGHTS.exitLiquidity, liqPts, input.exitSlippagePct != null, liqNote);

  // 4 — take efficiency: commission drag
  const takePts = clamp(100 - input.takePct * 2.5, 5, 100);
  push(
    "takeEfficiency",
    "Take efficiency",
    WEIGHTS.takeEfficiency,
    takePts,
    true,
    `commission ${r1(input.takePct)}%`
  );

  // 5 — decentralization: whale-lane risk
  const concPts =
    input.concentrationPct == null
      ? MISSING_NEUTRAL
      : clamp(100 - (input.concentrationPct - 30) * 1.4, 5, 100);
  push(
    "decentralization",
    "Decentralization",
    WEIGHTS.decentralization,
    concPts,
    input.concentrationPct != null,
    input.concentrationPct == null
      ? "lane concentration unknown"
      : `top validator holds ${r1(input.concentrationPct)}% of lane`
  );

  // 6 — price stability: α 24h drift
  const d24 = input.alphaChange24hPct;
  const stabPts = d24 == null ? MISSING_NEUTRAL : clamp(100 - (Math.abs(d24) - 5) * 4.25, 10, 100);
  push(
    "priceStability",
    "Price stability",
    WEIGHTS.priceStability,
    stabPts,
    d24 != null,
    d24 == null
      ? "α 24h drift unknown"
      : `α ${d24 >= 0 ? "+" : ""}${r1(d24)}%/24h`
  );

  // 7 — dilution discipline: α rewards vs TAO inflow
  const dil = input.dilutionRatio;
  const dilPts = dil == null ? MISSING_NEUTRAL : clamp(100 - (dil - 1) * 10, 10, 100);
  push(
    "dilutionDiscipline",
    "Dilution discipline",
    WEIGHTS.dilutionDiscipline,
    dilPts,
    dil != null,
    dil == null
      ? "dilution ratio unknown"
      : `dilution ${r1(dil)}×`
  );

  let score = parts.reduce((s, p) => s + p.weighted, 0);

  // Honesty gate — AVOID can never headline on components alone.
  let cappedByVerdict = false;
  if (input.verdict === "AVOID" && score > AVOID_CAP) {
    score = AVOID_CAP;
    cappedByVerdict = true;
    flags.push("score capped at 25 — verdict AVOID (root-losing or α crashing)");
  }

  const grade = score >= 75 ? "A" : score >= 60 ? "B" : score >= 45 ? "C" : "D";
  return { score: r1(clamp(score, 0, 100)), grade, parts, flags, cappedByVerdict };
}

// ---------------------------------------------------------------------------
// FLAT RANKING — turn SubnetStakeOpportunity[] into the scored cross-subnet
// "best validators to stake" list, in the opportunity-engine display order:
// verdict tier first, then score, then sustainable APY as tiebreak.
// ---------------------------------------------------------------------------

import type { SubnetStakeOpportunity } from "./tao-engine";
import { classifyVerdict } from "./tao-engine";

export interface ScoredValidatorRow {
  netuid: number;
  subnetName: string;
  validatorUid: number;
  validatorHotkey: string;
  verdict: ValidatorVerdict;
  score: ValidatorScoreResult;
  takePct: number;
  captureSharePct: number;
  stakeAlpha: number;
  poolTao: number;
  alphaSpotTao: number;
  realizableTao: number;
  exitSlippagePct: number | null;
  sustainableApyPct: number;
  apyLowPct: number;
  apyHighPct: number;
  instantApyPct: number;
  taoPerMonth: number;
  rootBaselineApyPct: number;
  beatsRoot: boolean;
  alphaChange24hPct: number | null;
  dilutionRatio: number | null;
  concentrationPct: number | null;
}

/** Score every validator row of every opportunity; flat + sorted. */
export function scoreAllValidators(
  opportunities: SubnetStakeOpportunity[]
): ScoredValidatorRow[] {
  const rows: ScoredValidatorRow[] = [];
  for (const op of opportunities) {
    const concentrationPct =
      op.topValidatorConcentration != null
        ? Math.round(op.topValidatorConcentration * 10000) / 100
        : null;
    for (const v of op.validators) {
      const takePct = v.take * 100;
      const verdict = classifyVerdict({
        beatsRoot: op.beatsRoot,
        poolTao: op.poolTao,
        dilutionRatio: op.dilutionRatio,
        takePct,
        concentrationPct,
        exitSlippagePct: op.exitSlippagePct,
        alphaChange24hPct: op.alphaChange24hPct,
      });
      const score = validatorStakeScore({
        sustainableApyPct: v.apySustainablePct,
        rootBaselineApyPct: op.rootBaselineApyPct,
        realizableTao: op.realizableTao,
        alphaSpotTao: op.alphaSpotTao,
        poolTao: op.poolTao,
        exitSlippagePct: op.exitSlippagePct,
        takePct,
        concentrationPct,
        alphaChange24hPct: op.alphaChange24hPct,
        dilutionRatio: op.dilutionRatio,
        verdict,
      });
      rows.push({
        netuid: op.netuid,
        subnetName: op.name,
        validatorUid: v.uid,
        validatorHotkey: v.hotkey,
        verdict,
        score,
        takePct: Math.round(takePct * 100) / 100,
        captureSharePct: Math.round(v.captureShare * 10000) / 100,
        stakeAlpha: v.stakeAlpha,
        poolTao: op.poolTao,
        alphaSpotTao: op.alphaSpotTao,
        realizableTao: op.realizableTao,
        exitSlippagePct: op.exitSlippagePct,
        sustainableApyPct: v.apySustainablePct,
        apyLowPct: v.apyLowPct,
        apyHighPct: v.apyHighPct,
        instantApyPct: v.apyInstantPct,
        taoPerMonth: v.taoPerMonth,
        rootBaselineApyPct: op.rootBaselineApyPct,
        beatsRoot: op.beatsRoot,
        alphaChange24hPct: op.alphaChange24hPct,
        dilutionRatio: op.dilutionRatio,
        concentrationPct,
      });
    }
  }
  const tier: Record<ValidatorVerdict, number> = { STRONG: 0, VIABLE: 1, SPECULATIVE: 2, AVOID: 3 };
  rows.sort((a, b) => {
    if (tier[a.verdict] !== tier[b.verdict]) return tier[a.verdict] - tier[b.verdict];
    if (b.score.score !== a.score.score) return b.score.score - a.score.score;
    return b.sustainableApyPct - a.sustainableApyPct;
  });
  return rows;
}
