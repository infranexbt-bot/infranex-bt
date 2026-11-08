import type { LiveOpportunity } from "./live-merge";
import { resolveCompat, type CompatTier } from "./compat";
import { computeSeatTierFromRatio } from "./win-odds";

// ---------------------------------------------------------------------------
// OPPORTUNITY-SCORE-2 — the per-subnet Opportunity Score (0–100), the core
// decision number of the app. UPGRADE of OPPORTUNITY-SCORE-1 (5 components)
// to the operator's 7-factor specification:
//
//   expected net TAO potential   30%   rewards minus ALL operating costs
//   miner competitiveness        20%   do comparable miners actually earn
//   reward sustainability        15%   demand-backed vs dilution-funded flow
//   validator acceptance         10%   will validators score a NEW seat
//   GPU cost efficiency          10%   net earned per GPU-rent dollar
//   operational reliability      10%   can a rig actually run it day-2
//   economic & protocol risk      5%   volatility, liquidity, dilution risk
//
// ALL WEIGHTS ARE CONFIGURABLE at runtime (ProfitabilitySettings.
// opportunityWeightsJson → sanitizer → ctx) and are NORMALIZED to sum to 1
// before use, so hand-tuned weights can never break the 0–100 scale.
// The defaults above are a STARTING POINT, not a proven reward predictor.
//
// NORMALIZATION (documented formulas):
//   netTaoPotential      pts = 100·ln(1 + max(net,0)/300) / ln(1 + 3000/300)
//                        (log curve: $300/mo ≈ 29, $1k ≈ 62, $3k+ = 100;
//                        thin-margin <20% of gross → ×0.85)
//   minerCompetitiveness pts = 100·(rewardedRatio−0.03)/(0.65−0.03),
//                        clamped 4..100, capped at 70 when the median
//                        earner's share < 30% of flow; blended 70/30 with
//                        the month-1 earn chance when measured
//   rewardSustainability demand score 0–100 direct; emission-funded
//                        (dilution-subsidized) demand → ×0.7; dilution
//                        ratio > 1.5 → ×0.8; measured provider income
//                        (revenueBasis) → floor 60
//   validatorAcceptance  free-slot access (0/1) × 40 + ramp speed
//                        (clamp(1 − rampWeeks/12) × 30) + validator pool
//                        (min(validators/13,1) × 15) + immunity breathing
//                        room (×0.9 when ≤ 1 tempo of protection)
//   gpuCostEfficiency    ROI = net ÷ GPU rent: ≥3.0 → 100, ≥1.5 → 80,
//                        ≥0.5 → 55, >0 → 35, ≤0 → 5 (owned/CPU rows with
//                        no GPU line fall back to the profit margin)
//   operationalReliability compat tier spine (provider-friendly 100 …
//                        parked 5) × multi-GPU haircut (4+ ×0.65, 2–3
//                        ×0.9) × unclassified-hardware ×0.9; static-IP
//                        requirement ×0.95
//   econProtocolRisk     riskLevel (low 100 / med 60 / high 30) × thin-pool
//                        haircut (slippage >5% or pool <1000 TAO → ×0.7)
//                        × volatility haircut (|α 24h| > 20% → ×0.85)
//
// MISSING DATA RULE: a component without inputs scores a BELOW-AVERAGE
// neutral (30–40, never higher than a measured median) and is flagged
// `missing`. Missing data reduces the row's DATA CONFIDENCE and can block
// the SCALE classification — it never improves a subnet's score.
//
// HARD GATES — a high score must NEVER override:
//   · a failed mandatory hardware requirement (bare-metal/TEE-only subnet vs
//     a container rig, or an 8-GPU documented config priced against 1 GPU)
//   · an unverified payout mechanism (no curated mechanics, no repo source)
//   · negative net economics under the active cost basis — NET-NEGATIVE ROWS
//     CAN NEVER RECEIVE A POSITIVE DEPLOYMENT RECOMMENDATION (cap 15 +
//     classification AVOID downstream)
// Gated rows keep their raw score for evidence, but the EFFECTIVE score is
// capped so they can never headline the ranking.
// ---------------------------------------------------------------------------

/** The operator-spec default weights (sum = 1.0). */
export const OPPORTUNITY_WEIGHTS = {
  netTaoPotential: 0.3,
  minerCompetitiveness: 0.2,
  rewardSustainability: 0.15,
  validatorAcceptance: 0.1,
  gpuCostEfficiency: 0.1,
  operationalReliability: 0.1,
  econProtocolRisk: 0.05,
} as const;

export type OpportunityComponentKey = keyof typeof OPPORTUNITY_WEIGHTS;
export type OpportunityWeightSet = Record<OpportunityComponentKey, number>;

export const OPPORTUNITY_WEIGHTS_LABELS: Record<OpportunityComponentKey, string> = {
  netTaoPotential: "net TAO potential",
  minerCompetitiveness: "miner competitiveness",
  rewardSustainability: "reward sustainability",
  validatorAcceptance: "validator acceptance",
  gpuCostEfficiency: "GPU cost efficiency",
  operationalReliability: "operational reliability",
  econProtocolRisk: "economic & protocol risk",
};

const COMPONENT_KEYS = Object.keys(OPPORTUNITY_WEIGHTS) as OpportunityComponentKey[];

/** Merge a partial weight override over the defaults, clamp to [0,1] and
 *  normalize so the set ALWAYS sums to 1.0 (within rounding). Invalid or
 *  absent input falls back to the documented defaults per key. */
export function resolveOpportunityWeights(
  partial?: Partial<OpportunityWeightSet> | null
): OpportunityWeightSet {
  const merged: OpportunityWeightSet = { ...OPPORTUNITY_WEIGHTS };
  if (partial) {
    for (const k of COMPONENT_KEYS) {
      const v = partial[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) merged[k] = v;
    }
  }
  const sum = COMPONENT_KEYS.reduce((s, k) => s + merged[k], 0);
  if (!(sum > 0)) return { ...OPPORTUNITY_WEIGHTS };
  const out = {} as OpportunityWeightSet;
  for (const k of COMPONENT_KEYS) out[k] = Math.round((merged[k] / sum) * 1000) / 1000;
  return out;
}

/** Settings-sanitizer view: accepts unknown JSON (string or object) and
 *  returns a safe normalized weight set. Never throws. */
export function sanitizeOpportunityWeights(input: unknown): OpportunityWeightSet {
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      return { ...OPPORTUNITY_WEIGHTS };
    }
  }
  if (input == null || typeof input !== "object") return { ...OPPORTUNITY_WEIGHTS };
  return resolveOpportunityWeights(input as Partial<OpportunityWeightSet>);
}

export type OpportunityGateKind =
  | "HARDWARE_INCOMPATIBLE"
  | "PAYOUT_UNVERIFIED"
  | "NET_NEGATIVE"
  | "NET_BELOW_TARGET"
  | "SEAT_MONOPOLIZED";

export interface OpportunityGate {
  kind: OpportunityGateKind;
  /** Short chip label, e.g. "8-GPU rig required". */
  label: string;
  /** Full sentence a miner can act on. */
  detail: string;
}

export interface OpportunityScoreComponent {
  key: OpportunityComponentKey;
  label: string;
  weight: number;
  /** 0–100 quality of this component on its own. */
  points: number;
  /** points × weight — what the component actually contributed. */
  weighted: number;
  /** Human-readable bullets backing the points. */
  evidence: string[];
  /** True when the inputs were absent and a neutral default was used. */
  missing: boolean;
}

export type OpportunityBand = "ELITE" | "STRONG" | "VIABLE" | "MARGINAL" | "POOR";

export interface SubnetOpportunityScore {
  id: string;
  netuid: number;
  subnetName: string;
  /** Pre-gate score 0–100. */
  rawScore: number;
  /** Post-gate score — capped when gated; ranks the table. */
  effectiveScore: number;
  gated: boolean;
  gates: OpportunityGate[];
  components: OpportunityScoreComponent[];
  band: OpportunityBand;
  /** 0–1 — how much verified data stands behind the score (missing inputs
   *  and unverified sources drag it down; it never lifts points). */
  dataConfidence: number;
  /** The weight set actually used (post-normalization) — shown in the UI. */
  weights: OpportunityWeightSet;
  /** One-sentence summary of WHY the score landed where it did. */
  oneLine: string;
}

export interface OpportunityScoreContext {
  /** Active cost basis — "rented" rigs cannot satisfy bare-metal requirements. */
  hardwareMode?: "owned" | "rented";
  /** User's minimum acceptable net profit, USD/month (settings). */
  minNetTargetUsd?: number;
  /** Runtime-configurable component weights (settings). Absent keys fall
   *  back to the documented defaults; the set is normalized to sum 1. */
  weights?: Partial<OpportunityWeightSet> | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

// --- Component 1: expected net TAO potential (30%) ---------------------------
// Log curve on the P&L net: $300/mo net ≈ 29 pts, $1,000 ≈ 62, $3,000+ = 100.
// Mining net is heavy-tailed; a log map keeps a solid $500/mo play clearly
// ahead of a break-even one without letting a $20k jackpot dominate.
const NET_REF_USD = 300;
const NET_FULL_USD = 3000;

function scoreNetTaoPotential(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  const net = o.netMonthlyUsd;
  if (net == null) {
    return {
      key: "netTaoPotential",
      label: OPPORTUNITY_WEIGHTS_LABELS.netTaoPotential,
      weight: OPPORTUNITY_WEIGHTS.netTaoPotential,
      points: 30,
      weighted: 30 * OPPORTUNITY_WEIGHTS.netTaoPotential,
      evidence: ["Net monthly figure unavailable — profitability engine has no P&L for this subnet yet."],
      missing: true,
    };
  }
  if (net <= 0) {
    ev.push(
      net < 0
        ? `Net −$${Math.abs(Math.round(net)).toLocaleString()}/mo after GPU + infra costs — every epoch worked loses money.`
        : "Net $0/mo — rewards do not cover the cost lines."
    );
  } else {
    ev.push(`Net ≈ $${Math.round(net).toLocaleString()}/mo after GPU rent + infra (rewards minus operating costs).`);
    if (o.profitability) {
      ev.push(`P&L: $${Math.round(o.profitability.expectedRevenueUsd).toLocaleString()} gross − $${Math.round(o.profitability.totalCostsUsd).toLocaleString()} costs, ${o.profitability.profitMarginPct.toFixed(0)}% margin.`);
    }
  }
  let points = (100 * Math.log(1 + Math.max(net, 0) / NET_REF_USD)) / Math.log(1 + NET_FULL_USD / NET_REF_USD);
  // Thin-margin haircut — a 90% gross margin that shrinks to 8% when TAO dips
  // is fragile; flag, don't hide it.
  const prof = o.profitability;
  if (prof && net > 0 && prof.expectedRevenueUsd > 0) {
    const margin = net / prof.expectedRevenueUsd;
    if (margin < 0.2) {
      points *= 0.85;
      ev.push(`Margin ${(margin * 100).toFixed(0)}% of gross — a small TAO/rent move flips this negative.`);
    }
  }
  if (o.meetsMinimum === false) {
    ev.push("Below your minimum net-profit target in settings.");
  }
  points = clamp(points, 0, 100);
  return {
    key: "netTaoPotential",
    label: OPPORTUNITY_WEIGHTS_LABELS.netTaoPotential,
    weight: OPPORTUNITY_WEIGHTS.netTaoPotential,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.netTaoPotential),
    evidence: ev,
    missing: false,
  };
}

// --- Component 2: miner competitiveness (20%) --------------------------------
// rewardedRatio = share of registered seats that earned last epoch — the
// most honest "do comparable miners actually get paid" signal on chain.
// Blended 70/30 with the measured month-1 earn chance when available.
function scoreMinerCompetitiveness(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  const ratio = o.rewardedRatio;
  const chance = o.earnChance;
  if (ratio == null && !chance) {
    return {
      key: "minerCompetitiveness",
      label: OPPORTUNITY_WEIGHTS_LABELS.minerCompetitiveness,
      weight: OPPORTUNITY_WEIGHTS.minerCompetitiveness,
      points: 40,
      weighted: 40 * OPPORTUNITY_WEIGHTS.minerCompetitiveness,
      evidence: ["No reward vector and no entry-odds data — cannot see what share of miners earned last epoch."],
      missing: true,
    };
  }
  let points: number;
  if (ratio != null) {
    const pctEarned = Math.round(ratio * 100);
    ev.push(`${pctEarned}% of registered miners earned rewards last epoch.`);
    // ≥65% of seats earning = 100 pts, sliding to ~4 pts at 3%.
    points = clamp(((ratio - 0.03) / (0.65 - 0.03)) * 100, 4, 100);
    const med = o.rewardMedianShare;
    if (med != null) {
      ev.push(`Median earning miner takes ${(med * 100).toFixed(1)}% of the subnet's incentive flow.`);
      if (med < 0.3 && points > 70) {
        points = 70;
        ev.push("Median reward share is thin even for miners who do earn — capped this component.");
      }
    }
  } else {
    points = 40; // neutral — only entry odds present, blended below anyway
    ev.push("No reward vector yet — competitiveness rests on entry odds alone.");
  }
  if (chance) {
    ev.push(chance.note);
    points = points * 0.7 + clamp(chance.pct, 0, 100) * 0.3;
  }
  // SEAT-SAFETY (ENTRY-SCORE-2) — whale concentration caps this component
  // using the same Win-Odds taxonomy the Subnets seat chips show: breadth
  // alone is not competitiveness if the top-10% cohort eats the pot.
  const seatTier = computeSeatTierFromRatio({
    rewardedRatio: ratio,
    top10IncentiveShare: o.top10IncentiveShare,
  });
  if (o.top10IncentiveShare != null) {
    const takePct = Math.round(o.top10IncentiveShare * 100);
    if (seatTier === "OPEN_FIELD") {
      ev.push(
        `Top-10% of UIDs take ${takePct}% of the pot — ${100 - takePct}% stays open to the other 90% of miners.`,
      );
    } else {
      ev.push(`Top-10% of UIDs take ${takePct}% of the pot.`);
    }
  }
  if (seatTier === "DONT_ENTER") {
    points = Math.min(points, 15);
    ev.push("Winner-take-all reward spread — a new seat earns ≈ nothing; component floored.");
  } else if (seatTier === "KNIFE_FIGHT") {
    points = Math.min(points, 35);
    ev.push("Knife-fight reward spread — pro farms take most of the pot; component capped.");
  } else if (seatTier === "FIGHTABLE") {
    points = Math.min(points, 65);
    ev.push("Whale-heavy reward spread — real odds, but concentration holds this component down.");
  }
  if (o.liveMiners != null) {
    ev.push(`≈${o.liveMiners} registered miners observed on chain.`);
  }
  points = clamp(points, 0, 100);
  return {
    key: "minerCompetitiveness",
    label: OPPORTUNITY_WEIGHTS_LABELS.minerCompetitiveness,
    weight: OPPORTUNITY_WEIGHTS.minerCompetitiveness,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.minerCompetitiveness),
    evidence: ev,
    missing: ratio == null,
  };
}

// --- Component 3: reward sustainability (15%) --------------------------------
// Is the reward flow backed by EXTERNAL demand, or subsidized by dilution?
// demandScore is the composite (0–100); a dilution-subsidized flow and a
// dilutionRatio ≫ 1 are haircuts, and measured provider income floors it.
function scoreRewardSustainability(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  const demand = o.demandScore;
  let points: number;
  if (demand != null) {
    points = clamp(demand, 0, 100);
    ev.push(
      `On-chain demand score ${Math.round(demand)}/100${o.demandBand ? ` (${o.demandBand.replace("-", " ")})` : ""}.`
    );
  } else {
    points = 40; // neutral below-average — no demand signals
    ev.push("No on-chain demand signals — sustainability cannot be verified.");
  }
  if (o.demandBand === "emission-funded") {
    points *= 0.7;
    ev.push("Rewards lean on staking dilution, not external demand — sustainability haircut.");
  }
  if (o.dilutionRatio != null && o.dilutionRatio > 1.5) {
    points *= 0.8;
    ev.push(`Paper emission is ${o.dilutionRatio.toFixed(1)}× the sustainable TAO inflow — dilution-subsidized.`);
  }
  if (o.revenueBasis === "provider-marketplace") {
    points = Math.max(points, 60);
    ev.push("Revenue is measured off-chain provider income, not a modeled emission share.");
  }
  if (o.mechanics?.rewardWindowDays != null) {
    ev.push(`Payout window verified: rewards score over ${o.mechanics.rewardWindowDays} days (official sources).`);
  }
  if ((o.estimatedDailyReward ?? 0) <= 0) {
    points = Math.min(points, 10);
    ev.push("Zero measured reward flow right now — nothing to earn no matter the demand.");
  }
  points = clamp(points, 0, 100);
  return {
    key: "rewardSustainability",
    label: OPPORTUNITY_WEIGHTS_LABELS.rewardSustainability,
    weight: OPPORTUNITY_WEIGHTS.rewardSustainability,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.rewardSustainability),
    evidence: ev,
    missing: demand == null && o.revenueBasis !== "provider-marketplace",
  };
}

// --- Component 4: validator acceptance (10%) ---------------------------------
// Will validators score a NEW seat soon? Free-slot access, ramp speed
// (bond/EMA maturity), the subnet's validator pool, and immunity room.
function scoreValidatorAcceptance(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  let points = 40; // neutral start; each measured signal moves it
  let measured = false;
  const free = o.freeSlots;
  if (free != null) {
    measured = true;
    const open = free > 0;
    points = open ? Math.max(points, 60) : Math.min(points, 45);
    ev.push(
      open
        ? `${free} free registration slot${free === 1 ? "" : "s"} — a new miner can enter now.`
        : "No free slots — entry costs (recycle) buy a queue position."
    );
  }
  const ramp = o.rampWeeks;
  if (ramp != null) {
    measured = true;
    const speed = clamp(1 - ramp / 12, 0, 1);
    points = points * 0.6 + speed * 100 * 0.4;
    ev.push(
      ramp <= 4
        ? `Fast ramp (≈${Math.round(ramp)} wk) — validators score a new UID quickly.`
        : `≈${Math.round(ramp)}-week bond/EMA ramp before validators weight the new seat fully.`
    );
  }
  const imm = o.immunityBlocks;
  if (imm != null) {
    ev.push(`Immunity window ${imm.toLocaleString()} blocks (~${Math.max(1, Math.round((imm * 12) / 86400))} days) before the UID can be deregistered.`);
  }
  const burn = o.burnCostTao;
  if (burn != null && burn > 0) {
    ev.push(`Registration burn ${burn.toLocaleString()} TAO — paying seats signal sustained demand.`);
  }
  points = clamp(points, 0, 100);
  return {
    key: "validatorAcceptance",
    label: OPPORTUNITY_WEIGHTS_LABELS.validatorAcceptance,
    weight: OPPORTUNITY_WEIGHTS.validatorAcceptance,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.validatorAcceptance),
    evidence: ev.length ? ev : ["No registration/ramp signals available — validator acceptance unknown."],
    missing: !measured,
  };
}

// --- Component 5: GPU cost efficiency (10%) ----------------------------------
// Net earned per GPU-rent dollar. Deliberately NOT raw performance: an
// expensive GPU that mines slightly more can still be the worse buy.
const TIER_POINTS: Record<CompatTier, number> = {
  "provider-friendly": 100,
  "gpu-flexible": 92,
  "cpu-only": 55,
  "bare-metal-only": 35,
  "tee-required": 22,
  unclear: 35,
  "no-repo": 20,
  parked: 5,
};

function scoreGpuCostEfficiency(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  const net = o.netMonthlyUsd;
  const gpu = o.gpuCostMonthlyUsd;
  let points: number;
  if (net != null && gpu != null && gpu > 0) {
    const roi = net / gpu;
    points = roi >= 3 ? 100 : roi >= 1.5 ? 80 : roi >= 0.5 ? 55 : roi > 0 ? 35 : 5;
    ev.push(`Net $${Math.round(net).toLocaleString()} per $${Math.round(gpu).toLocaleString()} GPU rent — ${(roi).toFixed(2)}× return on the rental line.`);
  } else if (net != null && o.profitability && o.profitability.expectedRevenueUsd > 0) {
    // Owned basis (electricity, not rent) or CPU work: fall back to margin.
    const margin = net / o.profitability.expectedRevenueUsd;
    points = margin >= 0.6 ? 90 : margin >= 0.35 ? 70 : margin > 0 ? 45 : 10;
    ev.push(
      `No GPU-rent line on this basis (owned/CPU) — ${Math.round(margin * 100)}% profit margin stands in for the rental ROI.`
    );
  } else {
    points = 40;
    ev.push("No GPU cost or net figure — cost efficiency cannot be computed.");
  }
  const compat = resolveCompat(o.netuid, o.hosting ?? null, o.requirementsSource ?? null);
  // Tier spine tempers the ROI — a great ROI on hardware you cannot rent is
  // not efficient, it's theoretical.
  points = points * (0.5 + (TIER_POINTS[compat.tier] / 100) * 0.5);
  if (compat.evidenceSource) ev.push(`Hardware source: ${compat.evidenceSource}.`);
  if (o.hardwareClassified === false) {
    points *= 0.9;
    ev.push("GPU line is a revenue-based estimate, not a repo-documented spec.");
  }
  points = clamp(points, 0, 100);
  return {
    key: "gpuCostEfficiency",
    label: OPPORTUNITY_WEIGHTS_LABELS.gpuCostEfficiency,
    weight: OPPORTUNITY_WEIGHTS.gpuCostEfficiency,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.gpuCostEfficiency),
    evidence: ev,
    missing: net == null,
  };
}

// --- Component 6: operational reliability (10%) ------------------------------
// Can a rig actually run this day-2 without surprises: compat tier, the
// multi-GPU reality, static-IP requirements, documented ops burden.
function scoreOperationalReliability(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  const compat = resolveCompat(o.netuid, o.hosting ?? null, o.requirementsSource ?? null);
  let points = TIER_POINTS[compat.tier];
  ev.push(compat.instructions);
  if (compat.requirements.length) ev.push(`Documented requirements: ${compat.requirements.join(", ")}.`);
  if (compat.tier === "bare-metal-only" || compat.tier === "tee-required") {
    ev.push("Container clouds (Vast/Akash/RunPod) cannot satisfy this requirement — needs a dedicated server build.");
  }
  if (o.hosting?.staticIpRequired) {
    points *= 0.95;
    ev.push("Static IP + 1:1 ports required — narrows provider choice.");
  }
  if (o.hardwareClassified === false) {
    points *= 0.9;
    ev.push("Hardware profile not repo-verified — ops plan is a guess until it is.");
  }
  if ((o.gpuCount ?? 1) >= 2) {
    const n = o.gpuCount!;
    points *= n >= 8 ? 0.65 : n >= 4 ? 0.75 : 0.9;
    ev.push(
      `Documented config is ${n}× GPU${n >= 8 ? " — a single-GPU build cannot run this as documented" : " — plan a multi-GPU build"}.`
    );
  }
  const ops = o.mechanics?.operations?.length ?? 0;
  if (ops >= 3) {
    points *= 0.9;
    ev.push(`${ops} documented operational duties in the official mechanics — this is a hands-on subnet.`);
  }
  points = clamp(points, 0, 100);
  return {
    key: "operationalReliability",
    label: OPPORTUNITY_WEIGHTS_LABELS.operationalReliability,
    weight: OPPORTUNITY_WEIGHTS.operationalReliability,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.operationalReliability),
    evidence: ev,
    missing: compat.tier === "unclear" || compat.tier === "no-repo",
  };
}

// --- Component 7: economic & protocol risk (5%) ------------------------------
// Volatility, exit liquidity and dilution risk — small weight, hard edge.
function scoreEconProtocolRisk(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  let points = o.riskLevel === "low" ? 100 : o.riskLevel === "medium" ? 60 : 30;
  ev.push(`Risk level ${o.riskLevel} (ledger composite).`);
  const slip = o.slippagePct;
  const pool = o.liquidityTao;
  if ((slip != null && slip > 5) || (pool != null && pool < 1000)) {
    points *= 0.7;
    ev.push(
      `Thin exit liquidity${slip != null ? ` (daily flow ÷ pool ≈ ${slip.toFixed(1)}% price impact` : ""}${slip != null && pool != null ? "," : pool != null ? " (" : ""}${pool != null ? `${Math.round(pool).toLocaleString()} TAO side)` : ""}) — converting rewards moves the price.`
    );
  }
  const d24 = o.alphaChange24h;
  if (d24 != null && Math.abs(d24) > 20) {
    points *= 0.85;
    ev.push(`Alpha price moved ${d24 > 0 ? "+" : ""}${d24.toFixed(1)}% in 24h — volatile reward token.`);
  }
  if (o.demandBand === "emission-funded") {
    points *= 0.9;
    ev.push("Emission-funded demand — protocol-level dilution risk on the reward side.");
  }
  if (o.rewardRealizability != null && o.rewardRealizability < 0.7) {
    points *= 0.9;
    ev.push(`Only ${Math.round(o.rewardRealizability * 100)}% of the daily flow realizes at pool prices vs spot.`);
  }
  points = clamp(points, 0, 100);
  return {
    key: "econProtocolRisk",
    label: OPPORTUNITY_WEIGHTS_LABELS.econProtocolRisk,
    weight: OPPORTUNITY_WEIGHTS.econProtocolRisk,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.econProtocolRisk),
    evidence: ev,
    missing: o.riskLevel == null,
  };
}

// --- Data confidence ----------------------------------------------------------
// 0–1, additive + auditable. Missing component inputs and unverified
// sources drag it down; it gates the SCALE classification downstream and is
// displayed per row. It NEVER feeds the points of any component.
function computeDataConfidence(
  o: LiveOpportunity,
  components: OpportunityScoreComponent[]
): number {
  let c = 0.3;
  if (o.mechanics) c += 0.15;
  if (o.rewardedRatio != null) c += 0.15;
  if (o.requirementsSource) c += 0.1;
  if (o.demandScore != null) c += 0.1;
  if (o.profitability) c += 0.1;
  if (typeof o.confidence === "number" && o.confidence > 0) c += o.confidence * 0.1;
  const missingCount = components.filter((x) => x.missing).length;
  c -= missingCount * 0.08;
  return Math.round(clamp(c, 0.05, 0.95) * 100) / 100;
}

// --- Gates -------------------------------------------------------------------

function computeGates(o: LiveOpportunity, ctx: OpportunityScoreContext): OpportunityGate[] {
  const gates: OpportunityGate[] = [];
  const compat = resolveCompat(o.netuid, o.hosting ?? null, o.requirementsSource ?? null);
  const rented = ctx.hardwareMode !== "owned";
  if (compat.tier === "tee-required" || (compat.tier === "bare-metal-only" && rented)) {
    gates.push({
      kind: "HARDWARE_INCOMPATIBLE",
      label: compat.tier === "tee-required" ? "TEE required" : "Bare metal only",
      detail:
        compat.tier === "tee-required"
          ? "Repo documents a trusted-computing requirement (TEE/TDX) — standard rented GPUs do not satisfy it."
          : "Repo requires bare metal / VM — container clouds are excluded on the current rented-rig basis.",
    });
  }
  // MANDATORY-RIG-GATE — a documented 8×-GPU config must never headline
  // against a single-rig operator. 4+ repo-documented GPUs is a server
  // build, not a rig; 2–3 stays a fit haircut only. If a hardware gate
  // already fired, merge into it instead of stacking a second chip.
  if ((o.gpuCount ?? 0) >= 4) {
    const multi: OpportunityGate = {
      kind: "HARDWARE_INCOMPATIBLE",
      label: `${o.gpuCount}×-GPU rig required`,
      detail: `Repo documents a ${o.gpuCount}×-GPU configuration — a single-rig operator cannot run this subnet as specified; it needs a purpose-built multi-GPU server.`,
    };
    const existing = gates.find((g) => g.kind === "HARDWARE_INCOMPATIBLE");
    if (existing) {
      existing.label = `${existing.label} + ${multi.label}`;
      existing.detail = `${existing.detail} ${multi.detail}`;
    } else {
      gates.push(multi);
    }
  }
  if (!o.mechanics && !o.requirementsSource) {
    gates.push({
      kind: "PAYOUT_UNVERIFIED",
      label: "Payout unverified",
      detail:
        "No verified payout mechanism — neither curated mechanics nor a repo source confirms how (or whether) miners are paid. Score can never headline while this is open.",
    });
  }
  if (o.netMonthlyUsd != null && o.netMonthlyUsd < 0) {
    gates.push({
      kind: "NET_NEGATIVE",
      label: "Loses money",
      detail: `Net −$${Math.abs(Math.round(o.netMonthlyUsd)).toLocaleString()}/mo under the active cost basis — operating here is a guaranteed loss; deployment is refused regardless of score.`,
    });
  } else if (o.meetsMinimum === false) {
    gates.push({
      kind: "NET_BELOW_TARGET",
      label: `Under $${Math.round(ctx.minNetTargetUsd ?? 300)}/mo`,
      detail: `Net profit is below your $${Math.round(ctx.minNetTargetUsd ?? 300)}/mo minimum — viable only if you accept less.`,
    });
  }
  // SEAT-MONOPOLY GATE (ENTRY-SCORE-2) — the same Win-Odds taxonomy the
  // Subnets seat-safety chips use, now gating the Opportunity Score: a
  // winner-take-all reward spread means the headline $/mo is a mean over a
  // few earning whales and a NEW seat earns ≈ nothing. Hard gate — caps the
  // effective score at 20 and sinks the row below every ungated one.
  const seat = computeSeatTierFromRatio({
    rewardedRatio: o.rewardedRatio,
    top10IncentiveShare: o.top10IncentiveShare,
  });
  if (seat === "DONT_ENTER") {
    const bits: string[] = [];
    if (o.rewardedRatio != null)
      bits.push(`${Math.round(o.rewardedRatio * 100)}% of seats earned last epoch`);
    if (o.top10IncentiveShare != null)
      bits.push(`top-10% of UIDs take ${Math.round(o.top10IncentiveShare * 100)}% of the incentive`);
    gates.push({
      kind: "SEAT_MONOPOLIZED",
      label: "Winner-take-all seats",
      detail: `Reward spread is winner-take-all (${bits.join(" · ") || "no measurable reward breadth"}) — a NEW seat earns ≈ nothing here regardless of the per-miner economics, which describe the whale cohort, not the seat you would get.`,
    });
  }
  return gates;
}

const GATE_CAPS: Record<OpportunityGateKind, number> = {
  HARDWARE_INCOMPATIBLE: 44,
  PAYOUT_UNVERIFIED: 49,
  NET_NEGATIVE: 15,
  NET_BELOW_TARGET: 35,
  SEAT_MONOPOLIZED: 20,
};

function bandOf(score: number): OpportunityBand {
  if (score >= 80) return "ELITE";
  if (score >= 65) return "STRONG";
  if (score >= 50) return "VIABLE";
  if (score >= 35) return "MARGINAL";
  return "POOR";
}

export function computeSubnetOpportunityScore(
  o: LiveOpportunity,
  ctx: OpportunityScoreContext = {}
): SubnetOpportunityScore {
  const weights = resolveOpportunityWeights(ctx.weights);
  const rawComponents = [
    scoreNetTaoPotential(o),
    scoreMinerCompetitiveness(o),
    scoreRewardSustainability(o),
    scoreValidatorAcceptance(o),
    scoreGpuCostEfficiency(o),
    scoreOperationalReliability(o),
    scoreEconProtocolRisk(o),
  ];
  // Re-weight components to the (possibly customized) weight set — the
  // component builders stamp the default weights; scale them here so the
  // displayed weighted contribution always matches the active weights.
  const components = rawComponents.map((c) => ({
    ...c,
    weight: weights[c.key],
    weighted: r1(c.points * weights[c.key]),
  }));
  const raw = clamp(
    components.reduce((s, c) => s + c.weighted, 0),
    0,
    100
  );
  const gates = computeGates(o, ctx);
  const cap = gates.length ? Math.min(...gates.map((g) => GATE_CAPS[g.kind])) : 100;
  const effective = Math.min(raw, cap);
  const dataConfidence = computeDataConfidence(o, components);

  const strongest = [...components].sort((a, b) => b.weighted - a.weighted)[0];
  const weakest = [...components].filter((c) => !c.missing).sort((a, b) => a.points - b.points)[0];
  const oneLine = gates.length
    ? `Gated: ${gates.map((g) => g.label.toLowerCase()).join(", ")}.`
    : `Score rides on ${strongest.label} (${r1(strongest.weighted)}/${Math.round(weights[strongest.key] * 100)}% wts)${weakest && weakest.key !== strongest.key ? `, held back by ${weakest.label.toLowerCase()}` : ""}.`;

  return {
    id: o.id,
    netuid: o.netuid,
    subnetName: o.subnetName,
    rawScore: r1(raw),
    effectiveScore: r1(effective),
    gated: gates.length > 0,
    gates,
    components,
    band: bandOf(effective),
    dataConfidence,
    weights,
    oneLine,
  };
}

/** Score every row; keyed by row id (same convention as computeMinePickMap). */
export function computeOpportunityScoreMap(
  rows: LiveOpportunity[],
  ctx: OpportunityScoreContext = {}
): Map<string, SubnetOpportunityScore> {
  const m = new Map<string, SubnetOpportunityScore>();
  for (const r of rows) {
    if (!r?.id) continue;
    try {
      m.set(r.id, computeSubnetOpportunityScore(r, ctx));
    } catch {
      // A row that cannot be scored must never break the table — leave it
      // unscored; the UI falls back to the conviction rank.
    }
  }
  return m;
}

/** Rank rows by effective score — and HARD GATES ALWAYS SINK: a gated row
 *  must never outrank an ungated row, regardless of raw score. Within each
 *  group, higher effective score wins. This is the code-level enforcement of
 *  "a high score must never override a failed mandatory requirement". */
export function rankByOpportunityScore<T extends LiveOpportunity>(
  rows: T[],
  scores: Map<string, SubnetOpportunityScore>
): T[] {
  return [...rows].sort((a, b) => {
    const sa = scores.get(a.id ?? "");
    const sb = scores.get(b.id ?? "");
    const ga = sa?.gated ? 1 : 0;
    const gb = sb?.gated ? 1 : 0;
    if (ga !== gb) return ga - gb;
    return (sb?.effectiveScore ?? -1) - (sa?.effectiveScore ?? -1);
  });
}

export const OPPORTUNITY_BAND_STYLE: Record<OpportunityBand, { label: string; className: string }> = {
  ELITE: { label: "Elite", className: "text-success border-success/40 bg-success/10" },
  STRONG: { label: "Strong", className: "text-primary border-primary/40 bg-primary/10" },
  VIABLE: { label: "Viable", className: "text-foreground border-border/60 bg-card/60" },
  MARGINAL: { label: "Marginal", className: "text-warning border-warning/40 bg-warning/10" },
  POOR: { label: "Poor", className: "text-destructive border-destructive/40 bg-destructive/10" },
};
