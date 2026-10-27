import type { LiveOpportunity } from "./live-merge";
import { resolveCompat, type CompatTier } from "./compat";

// ---------------------------------------------------------------------------
// OPPORTUNITY-SCORE-1 — the per-subnet Opportunity Score (0–100), the core
// decision number of the app.
//
// Every subnet receives a score built from five weighted components:
//   expected net contribution  30%   rewards minus ALL operating costs
//   actual miner performance   20%   comparable miners' incentives/uptime/response
//   hardware & deployment fit  20%   exact GPU / RAM / software / network fit
//   competition & entry risk   15%   active miners, capacity, reg cost, eviction
//   data quality & stability   15%   freshness of measurements, demand stability
//
// THE WEIGHTS ARE A STARTING POINT, NOT A PROVEN REWARD PREDICTOR.
//
// HARD GATES — a high score must NEVER override:
//   · a failed mandatory hardware requirement (bare-metal/TEE-only subnet vs a
//     container rig, or an 8-GPU documented config priced against 1 GPU)
//   · an unverified payout mechanism (no curated mechanics, no repo source)
//   · negative net economics under the active cost basis
// Gated rows keep their raw score for evidence, but the EFFECTIVE score is
// capped so they can never headline the ranking.
// ---------------------------------------------------------------------------

export const OPPORTUNITY_WEIGHTS = {
  netContribution: 0.3,
  minerPerformance: 0.2,
  hardwareFit: 0.2,
  entryRisk: 0.15,
  dataQuality: 0.15,
} as const;

export type OpportunityComponentKey = keyof typeof OPPORTUNITY_WEIGHTS;

const COMPONENT_LABELS: Record<OpportunityComponentKey, string> = {
  netContribution: "Expected net contribution",
  minerPerformance: "Actual miner performance",
  hardwareFit: "Hardware & deployment fit",
  entryRisk: "Competition & entry risk",
  dataQuality: "Data quality & stability",
};

export type OpportunityGateKind =
  | "HARDWARE_INCOMPATIBLE"
  | "PAYOUT_UNVERIFIED"
  | "NET_NEGATIVE"
  | "NET_BELOW_TARGET";

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
  /** One-sentence summary of WHY the score landed where it did. */
  oneLine: string;
}

export interface OpportunityScoreContext {
  /** Active cost basis — "rented" rigs cannot satisfy bare-metal requirements. */
  hardwareMode?: "owned" | "rented";
  /** User's minimum acceptable net profit, USD/month (settings). */
  minNetTargetUsd?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

// --- Component 1: expected net contribution (30%) ---------------------------
// Log curve: $300/mo net ≈ 29 pts, $1,000 ≈ 62, $3,000+ = 100. Mining net is
// heavy-tailed; a log map keeps a solid $500/mo play clearly ahead of a
// break-even one without letting a $20k jackpot dominate the whole scale.
const NET_REF_USD = 300;
const NET_FULL_USD = 3000;

function scoreNetContribution(o: LiveOpportunity): OpportunityScoreComponent {
  const net = o.netMonthlyUsd;
  const ev: string[] = [];
  if (net == null) {
    return {
      key: "netContribution",
      label: COMPONENT_LABELS.netContribution,
      weight: OPPORTUNITY_WEIGHTS.netContribution,
      points: 30,
      weighted: 30 * OPPORTUNITY_WEIGHTS.netContribution,
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
    key: "netContribution",
    label: COMPONENT_LABELS.netContribution,
    weight: OPPORTUNITY_WEIGHTS.netContribution,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.netContribution),
    evidence: ev,
    missing: false,
  };
}

// --- Component 2: actual miner performance (20%) -----------------------------
// rewardedRatio = share of registered seats that earned last epoch — the
// most honest "do comparable miners actually get paid" signal on chain.
function scoreMinerPerformance(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  const ratio = o.rewardedRatio;
  if (ratio == null) {
    return {
      key: "minerPerformance",
      label: COMPONENT_LABELS.minerPerformance,
      weight: OPPORTUNITY_WEIGHTS.minerPerformance,
      points: 40,
      weighted: 40 * OPPORTUNITY_WEIGHTS.minerPerformance,
      evidence: ["No reward vector yet — cannot see what share of miners earned last epoch."],
      missing: true,
    };
  }
  const pctEarned = Math.round(ratio * 100);
  ev.push(`${pctEarned}% of registered miners earned rewards last epoch.`);
  // ≥65% of seats earning = 100 pts, sliding to ~5 pts at 3%.
  let points = clamp(((ratio - 0.03) / (0.65 - 0.03)) * 100, 4, 100);
  const med = o.rewardMedianShare;
  if (med != null) {
    ev.push(`Median earning miner takes ${(med * 100).toFixed(1)}% of the subnet's incentive flow.`);
    if (med < 0.3 && points > 70) {
      points = 70;
      ev.push("Median reward share is thin even for miners who do earn — capped this component.");
    }
  }
  if (o.liveMiners != null) {
    ev.push(`≈${o.liveMiners} registered miners observed on chain.`);
  }
  return {
    key: "minerPerformance",
    label: COMPONENT_LABELS.minerPerformance,
    weight: OPPORTUNITY_WEIGHTS.minerPerformance,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.minerPerformance),
    evidence: ev,
    missing: false,
  };
}

// --- Component 3: hardware & deployment fit (20%) ----------------------------
// Compatibility tier is the spine (compat.ts full audit), then two reality
// haircuts: an unclassified GPU line, and a documented multi-GPU requirement
// the user's single-rig mental model can't satisfy.
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

function scoreHardwareFit(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  const compat = resolveCompat(o.netuid, o.hosting ?? null, o.requirementsSource ?? null);
  let points = TIER_POINTS[compat.tier];
  ev.push(compat.instructions);
  if (compat.requirements.length) ev.push(`Documented requirements: ${compat.requirements.join(", ")}.`);
  if (compat.evidenceSource) ev.push(`Source: ${compat.evidenceSource}.`);
  if (compat.tier === "bare-metal-only" || compat.tier === "tee-required") {
    ev.push("Container clouds (Vast/Akash/RunPod) cannot satisfy this requirement — needs a dedicated server build.");
  }
  if (o.hardwareClassified === false) {
    points *= 0.9;
    ev.push("GPU line is a revenue-based estimate, not a repo-documented spec.");
  }
  if ((o.gpuCount ?? 1) >= 2) {
    const n = o.gpuCount!;
    points *= n >= 8 ? 0.65 : n >= 4 ? 0.75 : 0.9;
    ev.push(
      `Documented config is ${n}× GPU${n >= 8 ? " — a single-GPU build cannot run this as documented" : " — plan a multi-GPU build"}.`
    );
  }
  points = clamp(points, 0, 100);
  return {
    key: "hardwareFit",
    label: COMPONENT_LABELS.hardwareFit,
    weight: OPPORTUNITY_WEIGHTS.hardwareFit,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.hardwareFit),
    evidence: ev,
    missing: compat.tier === "unclear" || compat.tier === "no-repo",
  };
}

// --- Component 4: competition & entry risk (15%) ------------------------------
// Month-1 odds a NEW seat earns (earnChance) is the base; whale concentration
// and long ramps haircut it.
function scoreEntryRisk(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  const chance = o.earnChance;
  if (!chance) {
    return {
      key: "entryRisk",
      label: COMPONENT_LABELS.entryRisk,
      weight: OPPORTUNITY_WEIGHTS.entryRisk,
      points: 40,
      weighted: 40 * OPPORTUNITY_WEIGHTS.entryRisk,
      evidence: ["No entry-odds data — competition signals missing for this subnet."],
      missing: true,
    };
  }
  ev.push(chance.note);
  let points = clamp(chance.pct, 0, 100);
  const top10 = o.top10IncentiveShare;
  if (top10 != null) {
    ev.push(`Top-10 validators/miners hold ${(top10 * 100).toFixed(0)}% of incentive flow.`);
    if (top10 >= 0.85) {
      points *= 0.6;
      ev.push("Winner-take-all concentration — a new entrant rarely breaks in.");
    } else if (top10 >= 0.7) {
      points *= 0.8;
    }
  }
  if (o.rampWeeks != null && o.rampWeeks >= 8) {
    points *= 0.9;
    ev.push(`≈${o.rampWeeks} weeks of break-in before scores stabilize.`);
  }
  if (o.freeSlots != null && o.freeSlots <= 0) {
    points *= 0.95;
    ev.push("No free registration slots right now — entry costs (recycle) buy a queue position.");
  }
  points = clamp(points, 0, 100);
  return {
    key: "entryRisk",
    label: COMPONENT_LABELS.entryRisk,
    weight: OPPORTUNITY_WEIGHTS.entryRisk,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.entryRisk),
    evidence: ev,
    missing: false,
  };
}

// --- Component 5: data quality & stability (15%) ------------------------------
// Additive checklist of measurement freshness + demand-stability signals.
function scoreDataQuality(o: LiveOpportunity): OpportunityScoreComponent {
  const ev: string[] = [];
  let points = clamp((o.confidence ?? 0.4) * 40, 0, 40); // model confidence → 0–40
  const src = o.requirementsSource;
  if (src) {
    points += 25;
    ev.push(`Requirements scraped from the subnet's repo (${src}).`);
  }
  if (o.hardwareClassified) {
    points += 10;
    ev.push("Hardware profile classified from name/description, not guessed from revenue.");
  }
  if (o.mechanics) {
    points += 15;
    ev.push("Payout mechanism verified against curated official sources.");
  }
  if (o.rewardedRatio != null) {
    points += 10;
    ev.push("Live reward vector available — performance is measured, not modeled.");
  }
  const demand = o.demandScore;
  if (demand != null) {
    points += clamp(demand * 0.1, 0, 10); // on-chain demand composite → 0–10
    ev.push(
      `On-chain demand score ${Math.round(demand)}/100${o.demandBand ? ` (${o.demandBand.replace("-", " ")})` : ""}.`
    );
  }
  if (!ev.length) ev.push("Few verified signals yet — treat every number for this subnet as provisional.");
  points = clamp(points, 0, 100);
  return {
    key: "dataQuality",
    label: COMPONENT_LABELS.dataQuality,
    weight: OPPORTUNITY_WEIGHTS.dataQuality,
    points: r1(points),
    weighted: r1(points * OPPORTUNITY_WEIGHTS.dataQuality),
    evidence: ev,
    missing: ev.length <= 1,
  };
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
  // MANDATORY-RIG-GATE — the user's own example: a documented 8×-GPU config
  // must never headline against a single-rig operator. 4+ repo-documented
  // GPUs is a server build, not a rig; 2–3 stays a fit haircut only. If a
  // hardware gate already fired (bare-metal/TEE), merge into it instead of
  // stacking a second chip of the same kind.
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
      detail: `Net −$${Math.abs(Math.round(o.netMonthlyUsd)).toLocaleString()}/mo under the active cost basis — operating here is a guaranteed loss.`,
    });
  } else if (o.meetsMinimum === false) {
    gates.push({
      kind: "NET_BELOW_TARGET",
      label: `Under $${Math.round(ctx.minNetTargetUsd ?? 300)}/mo`,
      detail: `Net profit is below your $${Math.round(ctx.minNetTargetUsd ?? 300)}/mo minimum — viable only if you accept less.`,
    });
  }
  return gates;
}

const GATE_CAPS: Record<OpportunityGateKind, number> = {
  HARDWARE_INCOMPATIBLE: 44,
  PAYOUT_UNVERIFIED: 49,
  NET_NEGATIVE: 15,
  NET_BELOW_TARGET: 35,
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
  const components = [
    scoreNetContribution(o),
    scoreMinerPerformance(o),
    scoreHardwareFit(o),
    scoreEntryRisk(o),
    scoreDataQuality(o),
  ];
  const raw = clamp(
    components.reduce((s, c) => s + c.weighted, 0),
    0,
    100
  );
  const gates = computeGates(o, ctx);
  const cap = gates.length ? Math.min(...gates.map((g) => GATE_CAPS[g.kind])) : 100;
  const effective = Math.min(raw, cap);

  const strongest = [...components].sort((a, b) => b.weighted - a.weighted)[0];
  const weakest = [...components].filter((c) => !c.missing).sort((a, b) => a.points - b.points)[0];
  const oneLine = gates.length
    ? `Gated: ${gates.map((g) => g.label.toLowerCase()).join(", ")}.`
    : `Score rides on ${strongest.label.toLowerCase()} (${r1(strongest.weighted)}/${OPPORTUNITY_WEIGHTS[strongest.key]} wts)${weakest && weakest.key !== strongest.key ? `, held back by ${weakest.label.toLowerCase()}` : ""}.`;

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
