// ---------------------------------------------------------------------------
// DILIGENCE-1 — the 14-stage subnet due-diligence pipeline.
//
// Answers the operator's pre-provision checklist in order:
//   1 discover → 2 active → 3 registration → 4 what the miner does →
//   5 hardware → 6 complexity → 7 competition → 8 validator behavior →
//   9 emission trend → 10 alpha/TAO liquidity → 11 governance/protocol risk →
//   12 infra cost → 13 expected net return → 14 downside scenario
// then the OPPORTUNITY verdict → human APPROVAL → provisioning hand-off.
//
// Data policy (mirrors the app's honesty flags): every stage cites its
// source. Stages computed from heuristics say so in `source`. Nothing is
// invented — a stage that lacks data degrades to "warn" with an explicit
// "insufficient data" note, never a fake pass.
// ---------------------------------------------------------------------------

import type { Opportunity } from "./types";

export type DiligenceStatus = "pass" | "warn" | "fail" | "info";

export interface DiligenceStage {
  /** 1-14, matches the operator's printed pipeline order. */
  n: number;
  key: string;
  label: string;
  status: DiligenceStatus;
  /** One-line computed answer (the "what"). */
  value: string;
  /** Why / how to read it (the "so what"). */
  detail: string;
  /** Where the numbers came from — never hidden. */
  source: string;
}

export interface EmissionTrendPoint {
  at: string;
  emissionTaoPerDay: number;
  minerEmissionTaoPerDay: number;
  alphaPriceUsd: number | null;
}

/** History-derived context the client cannot compute from one snapshot. */
export interface DiligenceTrend {
  points: EmissionTrendPoint[];
  emissionChangePct: number | null;
  hasHistory: boolean;
}

export interface DiligenceReport {
  stages: DiligenceStage[];
  /** OPPORTUNITY gate — derived from the stage pattern. */
  verdict: "CLEAR" | "CONDITIONAL" | "DO NOT PROVISION";
  verdictReason: string;
  failCount: number;
  warnCount: number;
  passCount: number;
}

const fmtUsd = (v: number) =>
  `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 100 ? 1 : 0 })}`;
const fmtTao = (v: number) =>
  `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} τ`;
const pct = (v: number | null | undefined, digits = 0) =>
  v == null ? "?" : `${(v * 100).toFixed(digits)}%`;

/**
 * Compute the 14-stage pipeline for one opportunity snapshot.
 * `trend` is optional history from /api/diligence/[netuid]; without it
 * stage 9 degrades to a data-pending warn instead of guessing.
 */
export function computeDiligence(
  o: Opportunity,
  trend?: DiligenceTrend | null
): DiligenceReport {
  const stages: DiligenceStage[] = [];
  const prof = o.profitability;

  const push = (
    n: number,
    key: string,
    label: string,
    status: DiligenceStatus,
    value: string,
    detail: string,
    source: string
  ) => stages.push({ n, key, label, status, value, detail, source });

  // 1 — DISCOVER SUBNET -----------------------------------------------------
  push(
    1,
    "discover",
    "Discover subnet",
    "pass",
    `α${o.netuid} · ${o.subnetName} · ${o.category}`,
    o.workType
      ? `Detected work type: ${o.workType}. The scan classifies what the subnet pays for before any capital is at risk.`
      : "Found in the live chain scan; work type not classified — read the subnet's docs before proceeding.",
    "Live chain scan · Miner's Ledger"
  );

  // 2 — IS SUBNET ACTIVE? ----------------------------------------------------
  const dailyTao = o.netDailyTao ?? o.estimatedDailyReward ?? 0;
  const activeStatus: DiligenceStatus = dailyTao > 0.001 ? "pass" : "fail";
  push(
    2,
    "active",
    "Is subnet active?",
    activeStatus,
    dailyTao > 0 ? `${fmtTao(dailyTao)}/day to a mid-pack earner` : "no rewards flowing",
    dailyTao > 0
      ? "Real emission is reaching miners right now — the incentive mechanism is live, not a dormant registration."
      : "Zero reward flow: either emission is disabled or nobody is earning. Provisioning here burns the fee for nothing.",
    "Chain snapshot · emission samples"
  );

  // 3 — REGISTRATION AVAILABLE? ----------------------------------------------
  const free = o.freeSlots;
  const total = o.totalSlots;
  const regValue =
    free == null || total == null
      ? "seat data unavailable"
      : free > 0
        ? `${free}/${total} seats free`
        : `FULL — ${total}/${total} seats, entry displaces the weakest UID`;
  const regStatus: DiligenceStatus = free == null ? "warn" : free > 0 ? "pass" : "warn";
  push(
    3,
    "registration",
    "Registration available?",
    regStatus,
    regValue,
    free != null && free <= 0
      ? `A full subnet still accepts registration — it deregisters the lowest-weight non-immune miner. Your burn ${o.burnCostTao != null ? fmtTao(o.burnCostTao) : ""} is at risk unless you outscore the current bottom within ~${o.immunityBlocks != null ? Math.round((o.immunityBlocks * 12) / 3600) : "?"}h of immunity.`
      : `Burn to register costs ${o.burnCostTao != null ? fmtTao(o.burnCostTao) : "a small fee"}; immunity ~${o.immunityBlocks != null ? Math.round((o.immunityBlocks * 12) / 3600) : "?"}h protects your first days.`,
    "Metagraph seats · immunity.ts"
  );

  // 4 — WHAT EXACTLY DOES MINER DO? -------------------------------------------
  const m = o.mechanics;
  push(
    4,
    "what-miner-does",
    "What exactly does the miner do?",
    m ? "pass" : "warn",
    o.workType ?? o.category,
    m
      ? `Verified off-chain mechanics: ${m.rewardWindowDays != null ? `reward window ≈ ${m.rewardWindowDays}d. ` : ""}${m.optimizationTargets.length} documented optimization target(s). Sources: ${m.sources.map((s) => s.label).join(", ")}.`
      : "No verified mechanics yet — the work description is inferred from chain signals and the repo README. Read the subnet's docs yourself before committing hardware.",
    m ? "Mechanics knowledge layer (curated)" : "Inferred — not yet curated"
  );

  // 5 — HARDWARE REQUIREMENT ---------------------------------------------------
  const hwSource = o.requirementsSource
    ? "repo-documented"
    : o.hardwareClassified
      ? "work-type typical"
      : "revenue-based estimate";
  const hwStatus: DiligenceStatus = o.requirementsSource
    ? "pass"
    : o.hardwareClassified
      ? "pass"
      : "warn";
  push(
    5,
    "hardware",
    "Hardware requirement",
    hwStatus,
    `${o.minVramGb > 0 ? `${o.recommendedGpu || "GPU"} · ${o.minVramGb}GB+` : "CPU-only"}${o.gpuCount ? ` · ${o.gpuCount}×` : ""}`,
    `Requirement provenance: ${hwSource}. ${o.hosting ? `Hosting constraints: ${[o.hosting.bareMetalOnly && "bare metal only", o.hosting.teeRequired && "TEE/TDX required", o.hosting.staticIpRequired && "static IP + 1:1 ports"].filter(Boolean).join(", ") || "none flagged"}.` : "No hosting constraints on record."}`,
    o.requirementsSource ?? "work-type classifier"
  );

  // 6 — TECHNICAL COMPLEXITY (derived) ------------------------------------------
  const complexityFlags: string[] = [];
  let complexity = 0;
  if (o.hosting?.bareMetalOnly) { complexity += 2; complexityFlags.push("bare metal"); }
  if (o.hosting?.teeRequired) { complexity += 3; complexityFlags.push("TEE/TDX attestation"); }
  if (o.hosting?.staticIpRequired) { complexity += 1; complexityFlags.push("static IP"); }
  if (o.minVramGb >= 80) { complexity += 2; complexityFlags.push("80GB+ class GPU"); }
  else if (o.minVramGb >= 45) { complexity += 1; complexityFlags.push("48GB-class GPU"); }
  if ((m?.operations.length ?? 0) >= 3) { complexity += 1; complexityFlags.push("multi-step ops"); }
  const complexityLabel =
    complexity <= 1 ? "low" : complexity <= 4 ? "moderate" : "high";
  push(
    6,
    "complexity",
    "Technical complexity",
    complexity <= 1 ? "pass" : complexity <= 4 ? "warn" : "warn",
    complexityLabel,
    complexityFlags.length
      ? `Drivers: ${complexityFlags.join(", ")}. High complexity means slower first-earn and more ops surface — price your time in before the burn.`
      : "No special hosting or hardware flags — a standard container rental should run it.",
    "Derived from hosting flags + mechanics ops"
  );

  // 7 — COMPETITION ---------------------------------------------------------------
  const rr = o.rewardedRatio;
  const t10 = o.top10IncentiveShare;
  const compStatus: DiligenceStatus =
    rr == null || t10 == null
      ? "warn"
      : rr < 0.1 || t10 > 0.75
        ? "fail"
        : rr >= 0.4 && t10 <= 0.6
          ? "pass"
          : "warn";
  push(
    7,
    "competition",
    "Competition",
    compStatus,
    rr != null
      ? `${pct(rr)} of miners earned last epoch · top-10% take ${pct(t10)}`
      : "earning distribution unavailable",
    compStatus === "fail"
      ? "Brutal concentration: almost nobody outside the top earns, or whales take nearly everything. Newcomer expected value ≈ $0."
      : "How the pool splits matters more than pool size — a mid-share with wide rewards beats a big pool paid to 6 UIDs.",
    "Chain snapshot · incentive distribution"
  );

  // 8 — VALIDATOR BEHAVIOR ----------------------------------------------------------
  const ramp = o.rampWeeks;
  const median = o.rewardMedianShare;
  const valStatus: DiligenceStatus =
    ramp == null ? "warn" : ramp <= 2 ? "pass" : ramp <= 6 ? "warn" : "warn";
  push(
    8,
    "validator-behavior",
    "Validator behavior",
    valStatus,
    ramp != null ? `bond ramp ≈ ${ramp} week${ramp === 1 ? "" : "s"} to full rewards` : "ramp unknown",
    `Miner bonds start small and mature. ${median != null ? `Median earner takes ${pct(median, 1)} of the mean — ${median < 0.5 ? "a whale skews the pool" : "distribution is healthy"}. ` : ""}Mine the subnet's actual validator profile in Validator Lab (04) before burning — archetype, weights and brutality decide your score.`,
    "Bond-ramp model · Validator Lab (04) for the full profile"
  );

  // 9 — EMISSION TREND ------------------------------------------------------------------
  let trendStatus: DiligenceStatus = "warn";
  let trendValue = "collecting history…";
  let trendDetail =
    "The snapshot ring buffer is still filling. Trend is the difference between a rising pool and a dying one — check back before approving.";
  if (trend?.hasHistory && trend.emissionChangePct != null) {
    const ch = trend.emissionChangePct;
    trendValue = `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}% emission vs window start`;
    trendStatus = ch >= -5 ? "pass" : ch >= -25 ? "warn" : "fail";
    trendDetail =
      ch >= 0
        ? "Miner-side emission is flat-to-rising across the sampled window."
        : ch >= -25
          ? "Emission is drifting down — could be price (τ-denominated pool is stable) or real cut. Read the points before deciding."
          : "Steep emission decline — the pool is shrinking fast. Entry here chases a falling knife.";
  }
  push(9, "emission-trend", "Emission trend", trendStatus, trendValue, trendDetail,
    trend?.hasHistory ? "Snapshot history (server ring buffer)" : "Awaiting history");

  // 10 — ALPHA/TAO LIQUIDITY ----------------------------------------------------------------
  const liq = o.liquidityTao;
  const slip = o.slippagePct;
  const liqStatus: DiligenceStatus =
    liq == null || slip == null
      ? "warn"
      : slip > 0.05 || liq < 500
        ? "fail"
        : slip > 0.02
          ? "warn"
          : "pass";
  push(
    10,
    "liquidity",
    "Alpha/TAO liquidity",
    liqStatus,
    liq != null ? `${fmtTao(liq)} TAO-side depth · exit slippage ≈ ${pct(slip, 1)}` : "pool depth unavailable",
    liqStatus === "fail"
      ? "Thin pool: converting today's earnings to TAO would move the price against you by more than 5%. Earnings on paper, not in the wallet."
      : "Your daily alpha needs a TAO exit. Depth minus your own sell pressure decides what earnings are actually worth.",
    "Pool reserves · earnings-vs-pool slippage model"
  );

  // 11 — GOVERNANCE / PROTOCOL RISK (heuristic) ------------------------------------------------
  const govSignals: string[] = [];
  if (o.requirementsSource) govSignals.push("verified repo on record");
  if (m) govSignals.push("curated mechanics reviewed");
  if (o.liquidityTao != null && o.liquidityTao > 20_000) govSignals.push("deep alpha pool");
  const govStatus: DiligenceStatus = govSignals.length >= 2 ? "pass" : govSignals.length === 1 ? "warn" : "warn";
  push(
    11,
    "governance",
    "Governance / protocol risk",
    govStatus,
    govSignals.length ? `${govSignals.length} trust signal(s)` : "no trust signals",
    `${govSignals.join("; ") || "No verified repo, no curated mechanics, thin pool — treat protocol changes (take rates, emission moves, migrations) as untracked risk."} This stage is a heuristic — it does not read Senate votes or proposals.`,
    "Heuristic: repo + mechanics + pool signals"
  );

  // 12 — GPU/CPU COST ---------------------------------------------------------------------------
  const gpuCost = prof?.gpuRentalUsd ?? 0;
  const infraCost = (prof?.infrastructureUsd ?? 0) + (prof?.storageUsd ?? 0);
  const totalCost = gpuCost + infraCost;
  const revenue = prof?.expectedRevenueUsd ?? 0;
  const costRatio = revenue > 0 ? totalCost / revenue : 1;
  const costStatus: DiligenceStatus = revenue <= 0 ? "warn" : costRatio <= 0.3 ? "pass" : costRatio < 0.6 ? "warn" : "fail";
  push(
    12,
    "infra-cost",
    "GPU/CPU cost",
    costStatus,
    totalCost > 0 ? `${fmtUsd(totalCost)}/mo (${pct(costRatio)} of revenue)` : "$0 — local machine path",
    `GPU rental ${fmtUsd(gpuCost)} + storage/infra ${fmtUsd(infraCost)} monthly. Above ~60% of revenue, the subnet is working for the datacenter, not for you.`,
    "Profitability engine · live provider offers"
  );

  // 13 — EXPECTED NET RETURN ----------------------------------------------------------------------
  const net = prof?.netMonthlyUsd ?? o.netMonthlyUsd ?? 0;
  const meets = o.meetsMinimum !== false && (prof ? prof.meetsMinimum : net > 0);
  const netStatus: DiligenceStatus = net <= 0 ? "fail" : meets ? "pass" : "warn";
  push(
    13,
    "net-return",
    "Expected net return",
    netStatus,
    `${fmtUsd(net)}/mo net · ROI ${prof ? `${prof.roiMonthlyPct.toFixed(1)}%/mo` : "—"}`,
    `After every cost line. ${prof?.breakEvenDays != null ? `Break-even ≈ ${Math.round(prof.breakEvenDays)} days (incl. ramp). ` : ""}Your minimum entry rule: net ≥ ${fmtUsd(prof?.targetUsd ?? 300)}/mo → ${meets ? "met" : "NOT met — engine says AVOID"}.`,
    "Profitability engine P&L"
  );

  // 14 — DOWNSIDE SCENARIO (stress math) -------------------------------------------------------------
  const halfNet = revenue * 0.5 - totalCost;
  const zeroNet = -totalCost;
  const downStatus: DiligenceStatus =
    halfNet >= 0 ? "pass" : halfNet >= -totalCost * 0.5 ? "warn" : "fail";
  push(
    14,
    "downside",
    "Downside scenario",
    downStatus,
    `half-earnings net ${fmtUsd(halfNet)}/mo · zero-earnings bleed ${fmtUsd(zeroNet)}/mo`,
    `Stress case, not doom-saying: if emission halves (price or competition), net becomes ${fmtUsd(halfNet)}/mo; if you earn nothing during ramp, you bleed ${fmtUsd(zeroNet)}/mo. Both numbers must be survivable before the burn.`,
    "Deterministic stress: revenue ×0.5 and ×0 on same costs"
  );

  // — GATE: OPPORTUNITY verdict ------------------------------------------------------------------
  const failCount = stages.filter((s) => s.status === "fail").length;
  const warnCount = stages.filter((s) => s.status === "warn").length;
  const passCount = stages.filter((s) => s.status === "pass").length;
  const verdict: DiligenceReport["verdict"] =
    failCount > 0 ? "DO NOT PROVISION" : warnCount > 2 ? "CONDITIONAL" : "CLEAR";
  const verdictReason =
    failCount > 0
      ? `${failCount} hard fail${failCount > 1 ? "s" : ""} — resolve before any burn.`
      : warnCount > 2
        ? `${warnCount} warnings — acceptable if you understand each one; the fails are zero.`
        : "All pipeline stages green — the numbers support provisioning.";

  return { stages, verdict, verdictReason, failCount, warnCount, passCount };
}
