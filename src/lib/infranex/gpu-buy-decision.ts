// GPU-BUY-DECISION-1 — "Which GPU should I actually buy and mine?"
//
// Answers the operator's capital-allocation question with the platform's
// OWN data instead of marketing pool-size charts:
//
//   1. BUCKET   — every audited subnet is mapped to the GPU models it names
//                 (gpu-research-seed tokens — the exact vocabulary of the
//                 "Model demand" bars on this page).
//   2. POOL     — chain-measured miner-side emission per bucket (live).
//   3. REALITY  — pool ≠ earnings. The panel shows the per-earning-UID yield
//                 (realizability-weighted emission ÷ rewarded UIDs) and the
//                 bucket's rewarded ratio, because a big pool split across
//                 thousands of UIDs is worth less than a small pool with few
//                 winners.
//   4. ENTRANT  — the best single-GPU-reachable subnet in the bucket under
//                 the platform's own OpportunitySnapshot economics. The
//                 settings row runs hardwareMode="owned", so netMonthlyUsd
//                 already nets electricity (+150 W host, +15% cooling),
//                 maintenance, storage and opex — i.e. what a BUYER keeps.
//   5. CAPEX    — street hardware price (verified 2026-11-09), power draw,
//                 the Vast.ai rent alternative and TEE gating (Hopper-class
//                 Confidential Computing subnets refuse A100 / consumer).
//   6. VERDICT  — BUY / RENT-FIRST / MARGINAL / AVOID against the operator's
//                 TAO-per-month goal line, with the reasons spelled out.
//
// Pure and client-safe: the API route supplies DB rows; this module never
// imports the DB.

// ---------------------------------------------------------------------------
// Hardware catalog — street prices verified 2026-11-09 (sources in capexNote).
// capexUsd = the number payback math uses; low/high = the observed range.
// rentHourlyUsd = Vast.ai 30-day median where a public number exists.
// ---------------------------------------------------------------------------

export type TeeSupport = "yes" | "server-edition-only" | "no";

export interface GpuHardwareSpec {
  /** Canonical seed token this row answers for (case-insensitive match). */
  model: string;
  label: string;
  cls: "datacenter" | "pro" | "consumer";
  vramGb: number;
  powerW: number;
  capexUsd: number | null;
  capexLowUsd: number | null;
  capexHighUsd: number | null;
  capexNote: string;
  tee: TeeSupport;
  teeNote: string;
  rentHourlyUsd: number | null;
  rentNote: string | null;
  /** false = node/rack-only SKU — not a card an individual can buy. */
  retail: boolean;
}

export const CAPEX_AS_OF = "2026-11-09";

export const GPU_BUY_CATALOG: GpuHardwareSpec[] = [
  {
    model: "RTX Pro 6000",
    label: "RTX PRO 6000 Blackwell · 96 GB",
    cls: "pro",
    vramGb: 96,
    powerW: 600,
    capexUsd: 15500,
    capexLowUsd: 15495,
    capexHighUsd: 18900,
    capexNote:
      "Workstation Edition $15,495 street (Nov 2026, was $8.5k at launch); Server Edition $18,899 — only the SE validates TEE subnets today",
    tee: "server-edition-only",
    teeNote:
      "Confidential Computing is validated on the Blackwell Server Edition; Workstation/Max-Q editions are on NVIDIA's future roadmap (SuperProtocol, Nebius 2026)",
    rentHourlyUsd: null,
    rentNote: "no stable Vast.ai median — check live listings",
    retail: true,
  },
  {
    model: "RTX 5090",
    label: "GeForce RTX 5090 · 32 GB",
    cls: "consumer",
    vramGb: 32,
    powerW: 575,
    capexUsd: 5500,
    capexLowUsd: 4500,
    capexHighUsd: 6000,
    capexNote:
      "$5,999 used eBay (Nov 2026, bestvaluegpu tracker); MSRP $1,999 but street supply is scarce and trending to $5k+",
    tee: "no",
    teeNote: "GeForce cards have no Confidential Computing — TEE subnets are out of reach",
    rentHourlyUsd: null,
    rentNote: "no stable Vast.ai median — check live listings",
    retail: true,
  },
  {
    model: "RTX 4090",
    label: "GeForce RTX 4090 · 24 GB",
    cls: "consumer",
    vramGb: 24,
    powerW: 450,
    capexUsd: 2600,
    capexLowUsd: 1800,
    capexHighUsd: 3000,
    capexNote:
      "$2,298–2,999 used eBay (Nov 2026, bestvaluegpu/swap.gg trackers); open-box deals near $1,800",
    tee: "no",
    teeNote: "GeForce cards have no Confidential Computing — TEE subnets are out of reach",
    rentHourlyUsd: 0.47,
    rentNote: "Vast.ai 30-day median (listings $0.15–0.65/hr)",
    retail: true,
  },
  {
    model: "RTX 3090",
    label: "GeForce RTX 3090 · 24 GB",
    cls: "consumer",
    vramGb: 24,
    powerW: 350,
    capexUsd: 1200,
    capexLowUsd: 850,
    capexHighUsd: 1650,
    capexNote:
      "$1,199 used eBay (Nov 2026, bestvaluegpu tracker); solid units under $1k",
    tee: "no",
    teeNote: "GeForce cards have no Confidential Computing — TEE subnets are out of reach",
    rentHourlyUsd: 0.15,
    rentNote: "Vast.ai from $0.13/hr — cheapest capacity on the market",
    retail: true,
  },
  {
    model: "A6000",
    label: "RTX A6000 (Ada) · 48 GB",
    cls: "pro",
    vramGb: 48,
    powerW: 300,
    capexUsd: 3800,
    capexLowUsd: 2600,
    capexHighUsd: 4600,
    capexNote:
      "$2,600–3,800 used (Alibaba guide), refurb server-pulls ~$3,900, eBay $4.5k (Nov 2026)",
    tee: "no",
    teeNote: "Ampere/Ada workstation cards have no Confidential Computing",
    rentHourlyUsd: 0.35,
    rentNote: "Vast.ai ~$0.35/hr",
    retail: true,
  },
  {
    model: "A100",
    label: "A100 80 GB (PCIe, used)",
    cls: "datacenter",
    vramGb: 80,
    powerW: 300,
    capexUsd: 11000,
    capexLowUsd: 7000,
    capexHighUsd: 15000,
    capexNote:
      "eBay used $7,000–14,400 (Nov 2026); cheapest clean PCIe 80 GB ~$12.6k; listed medians vary wildly — inspect before wiring money",
    tee: "no",
    teeNote:
      "Ampere has NO Confidential Computing — Hopper+ TEE subnets (Targon-class) are structurally out of reach",
    rentHourlyUsd: 0.33,
    rentNote: "Vast.ai A100 PCIe 80 GB 30-day median",
    retail: true,
  },
  {
    model: "H100",
    label: "H100 80 GB (PCIe)",
    cls: "datacenter",
    vramGb: 80,
    powerW: 350,
    capexUsd: 30000,
    capexLowUsd: 25000,
    capexHighUsd: 40000,
    capexNote:
      "$25k–40k depending on PCIe/SXM and vendor (GMI/Enzu 2026 guides); 8-GPU HGX nodes $150k+ used",
    tee: "yes",
    teeNote:
      "Hopper introduced Confidential Computing — every TEE-gated subnet accepts H100",
    rentHourlyUsd: 2.5,
    rentNote: "market $2.50–3.49/hr (GMI reserved → Jarvislabs on-demand)",
    retail: true,
  },
  {
    model: "H200",
    label: "H200 141 GB (SXM/NVL)",
    cls: "datacenter",
    vramGb: 141,
    powerW: 700,
    capexUsd: 38000,
    capexLowUsd: 32000,
    capexHighUsd: 47000,
    capexNote:
      "$32k–47k per GPU (Thundercompute/Akash 2026); NVL listed at $39,995; 8-GPU node ≈ $300k",
    tee: "yes",
    teeNote: "Hopper-class Confidential Computing supported",
    rentHourlyUsd: 3.85,
    rentNote: "$3.85–10.85/hr across 12 clouds (Thundercompute Nov 2026)",
    retail: true,
  },
  {
    model: "B200",
    label: "B200 180 GB (SXM)",
    cls: "datacenter",
    vramGb: 180,
    powerW: 1000,
    capexUsd: null,
    capexLowUsd: null,
    capexHighUsd: null,
    capexNote:
      "HGX B200 nodes sell as 8-GPU servers (well into six figures) — no single-card street retail",
    tee: "yes",
    teeNote: "Blackwell Confidential Computing supported",
    rentHourlyUsd: null,
    rentNote: "cloud-only — rent from hyperscalers",
    retail: false,
  },
  {
    model: "B300",
    label: "B300 (Blackwell Ultra)",
    cls: "datacenter",
    vramGb: 288,
    powerW: 1400,
    capexUsd: null,
    capexLowUsd: null,
    capexHighUsd: null,
    capexNote: "HGX/rack SKU — not sold as a single card",
    tee: "yes",
    teeNote: "Blackwell Confidential Computing supported",
    rentHourlyUsd: null,
    rentNote: "cloud-only — rent from hyperscalers",
    retail: false,
  },
  {
    model: "GH200",
    label: "GH200 Grace-Hopper",
    cls: "datacenter",
    vramGb: 96,
    powerW: 1000,
    capexUsd: null,
    capexLowUsd: null,
    capexHighUsd: null,
    capexNote: "integrated superchip — dev-kit only, no mining retail",
    tee: "yes",
    teeNote: "Hopper-class Confidential Computing supported",
    rentHourlyUsd: null,
    rentNote: "cloud-only",
    retail: false,
  },
];

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

export interface BuyDecisionLive {
  minerEmissionTaoPerDay?: number | null;
  minersCount?: number | null;
  rewardedMiners?: number | null;
  rewardRealizability?: number | null;
}

export interface BuyDecisionOpportunity {
  netMonthlyUsd?: number | null;
  netTaoPerMonth?: number | null;
  gpuCostMonthlyUsd?: number | null;
  classification?: string | null;
  difficulty?: string | null;
}

export interface BuyDecisionSeedRow {
  netuid: number;
  name: string;
  models: string[];
  gpuCount: number | null;
  /** Audit class — used to compute the CPU-only anchor row. */
  cls?: string;
}

// Verbatim from the audit (gpu-landscape OVERRIDES): SN44's requirement line
// NAMES these cards only to EXCLUDE them ("5090 / B200 / H200 / H20 / MI300X
// explicitly excluded — a 4090-class card is the realistic entry"). The
// token detector counts every mention, so the buy decision must drop them
// or it would advertise cards the subnet bans.
const BANNED_TOKENS: Record<number, string[]> = {
  44: ["RTX 5090", "B200", "H200", "H20", "MI300X"],
};

export interface BuyDecisionInput {
  rows: BuyDecisionSeedRow[];
  liveByNetuid: Map<number, BuyDecisionLive>;
  oppByNetuid: Map<number, BuyDecisionOpportunity>;
  teeRequiredByNetuid: Map<number, boolean>;
  taoUsd: number;
  /** Operator goal line in TAO/month (the stricter of settings × stated floor). */
  goalTaoPerMonth: number;
  electricityUsdPerKwh: number;
}

export type BuyVerdict = "BUY" | "RENT-FIRST" | "MARGINAL" | "AVOID";

export interface BuyDecisionBestSubnet {
  netuid: number;
  name: string;
  netMonthlyUsd: number | null;
  netTaoPerMonth: number | null;
  classification: string | null;
  difficulty: string | null;
  gpuCount: number | null;
  reference: "single-gpu" | "multi-gpu";
}

export interface BuyDecisionRow {
  model: string;
  label: string;
  cls: "datacenter" | "pro" | "consumer";
  vramGb: number;
  powerW: number;
  /** Subnets naming this card in the audit (before TEE gating). */
  demandSubnets: number[];
  /** Reachable after dropping TEE-gated subnets this card cannot serve. */
  reachableSubnets: number[];
  teeBlockedSubnets: number[];
  poolTaoPerDay: number | null;
  poolUsdPerDay: number | null;
  realizablePoolTaoPerDay: number | null;
  rewardedSlots: number;
  registeredMiners: number;
  rewardedRatioPct: number | null;
  perEarningTaoPerDay: number | null;
  perEarningUsdPerDay: number | null;
  bestSubnet: BuyDecisionBestSubnet | null;
  /** Best reachable subnet net/mo on the settings' owned basis (USD). */
  entrantMonthlyUsd: number | null;
  entrantMonthlyTao: number | null;
  capexUsd: number | null;
  capexLowUsd: number | null;
  capexHighUsd: number | null;
  capexNote: string;
  /** This card's electricity alone, 24/7 for a month (info line). */
  powerMonthlyUsd: number;
  rentHourlyUsd: number | null;
  rentMonthlyUsd: number | null;
  rentNote: string | null;
  paybackMonths: number | null;
  goalTaoPerMonth: number;
  goalMonthlyUsd: number;
  verdict: BuyVerdict;
  reasons: string[];
}

export interface BuyDecisionCpuAnchor {
  netuid: number;
  name: string;
  netMonthlyUsd: number | null;
  netTaoPerMonth: number | null;
  classification: string | null;
  difficulty: string | null;
}

export interface BuyDecisionResult {
  rows: BuyDecisionRow[];
  meta: {
    taoUsd: number;
    goalTaoPerMonth: number;
    goalMonthlyUsd: number;
    electricityUsdPerKwh: number;
    capexAsOf: string;
    blockNumber: number | null;
    snapshotAt: string | null;
    priceSources: string;
    poolNote: string;
    /** Best gate-passing CPU-only subnet — the no-new-hardware baseline. */
    cpuBest: BuyDecisionCpuAnchor | null;
    /** Best gate-passing GPU entrant across all retail rows. */
    gpuBestNetuid: number | null;
    /** Subnets classified AVOID in today's snapshot (of classified rows). */
    avoidCount: number;
    classifiedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

const PRICE_SOURCES =
  "bestvaluegpu.com price trackers (3090/4090/5090, Nov 8 2026) · eBay used listings (A100/A6000) · Alibaba used-A6000 guide · PNY/vendor listings (RTX PRO 6000 WS/SE) · GMI/Enzu/Thundercompute H100/H200 2026 guides · Vast.ai 30-day medians";

const POOL_NOTE =
  "Pool = sum of chain-measured miner-side emissions across the subnets naming the card. A subnet can name several cards (counted in each bucket). Pool is opportunity, NOT your income — the per-earning-UID column and rewarded share tell the real story.";

export function computeBuyDecision(input: BuyDecisionInput): BuyDecisionResult {
  const { rows, liveByNetuid, oppByNetuid, teeRequiredByNetuid, taoUsd } = input;
  const goalMonthlyUsd = input.goalTaoPerMonth * taoUsd;

  const specRows = GPU_BUY_CATALOG.map((spec) => {
    const token = norm(spec.model);
    const usableModels = (r: BuyDecisionSeedRow): string[] => {
      const banned = BANNED_TOKENS[r.netuid];
      return banned ? r.models.filter((m) => !banned.some((b) => norm(b) === norm(m))) : r.models;
    };
    const demand = rows.filter((r) => usableModels(r).some((m) => norm(m) === token));

    // TEE gating: a TEE-required subnet is unreachable for cards that cannot
    // attest (A100 = Ampere, GeForce/consumer, Ada workstation).
    const teeCapable = spec.tee !== "no";
    const teeBlocked: number[] = [];
    const reachable: typeof demand = [];
    for (const r of demand) {
      if (!teeCapable && teeRequiredByNetuid.get(r.netuid) === true) teeBlocked.push(r.netuid);
      else reachable.push(r);
    }

    // Live pool + reality metrics over REACHABLE subnets only.
    let pool = 0;
    let realizablePool = 0;
    let rewardedSlots = 0;
    let registered = 0;
    let poolSeen = false;
    for (const r of reachable) {
      const live = liveByNetuid.get(r.netuid);
      if (!live) continue;
      const em = live.minerEmissionTaoPerDay;
      if (em != null && em > 0) {
        poolSeen = true;
        pool += em;
        const rz =
          live.rewardRealizability != null && live.rewardRealizability > 0
            ? Math.min(live.rewardRealizability, 1)
            : 1;
        realizablePool += em * rz;
      }
      if (live.rewardedMiners != null && live.rewardedMiners > 0) rewardedSlots += live.rewardedMiners;
      if (live.minersCount != null && live.minersCount > 0) registered += live.minersCount;
    }
    const blockedPool = teeBlocked.reduce((acc, uid) => {
      const em = liveByNetuid.get(uid)?.minerEmissionTaoPerDay;
      return acc + (em != null && em > 0 ? em : 0);
    }, 0);

    const perEarningTaoPerDay = poolSeen && rewardedSlots > 0 ? realizablePool / rewardedSlots : null;
    const rewardedRatioPct = registered > 0 ? (rewardedSlots / registered) * 100 : null;

    // Best entrant: the platform's own OpportunitySnapshot classification is
    // the operator gate — AVOID rows (concentration lottery, thin data, net
    // below floor) must never headline a BUY story, however big their
    // headline number looks. Prefer single-GPU-reachable subnets (reference
    // build gpuCount ≤ 1); a node-class reference is only used when nothing
    // else exists, and the row says so.
    const candidates = reachable
      .map((r) => ({ row: r, opp: oppByNetuid.get(r.netuid) }))
      .filter((c): c is { row: BuyDecisionSeedRow; opp: BuyDecisionOpportunity } => !!c.opp);
    const usable = candidates.filter((c) => (c.opp.classification ?? "") !== "AVOID");
    const excludedAvoid = candidates
      .filter((c) => (c.opp.classification ?? "") === "AVOID" && c.opp.netMonthlyUsd != null)
      .sort((a, b) => (b.opp.netMonthlyUsd ?? 0) - (a.opp.netMonthlyUsd ?? 0));
    const pickBest = (pool2: typeof candidates) => {
      let best: { row: BuyDecisionSeedRow; opp: BuyDecisionOpportunity } | null = null;
      for (const c of pool2) {
        const v = c.opp.netMonthlyUsd;
        if (v == null) continue;
        if (!best || (best.opp.netMonthlyUsd ?? -Infinity) < v) best = c;
      }
      return best;
    };
    const single = usable.filter((c) => c.row.gpuCount == null || c.row.gpuCount <= 1);
    const bestSingle = pickBest(single);
    const bestAny = bestSingle ?? pickBest(usable);

    const bestSubnet: BuyDecisionBestSubnet | null = bestAny
      ? {
          netuid: bestAny.row.netuid,
          name: bestAny.row.name,
          netMonthlyUsd: bestAny.opp.netMonthlyUsd ?? null,
          netTaoPerMonth: bestAny.opp.netTaoPerMonth ?? null,
          classification: bestAny.opp.classification ?? null,
          difficulty: bestAny.opp.difficulty ?? null,
          gpuCount: bestAny.row.gpuCount,
          reference: bestSingle ? "single-gpu" : "multi-gpu",
        }
      : null;

    const entrantMonthlyUsd = bestSubnet?.netMonthlyUsd ?? null;
    const entrantMonthlyTao =
      entrantMonthlyUsd != null && taoUsd > 0 ? entrantMonthlyUsd / taoUsd : null;

    const powerMonthlyUsd = (spec.powerW * 730 * input.electricityUsdPerKwh) / 1000;
    const rentMonthlyUsd = spec.rentHourlyUsd != null ? spec.rentHourlyUsd * 730 : null;
    const paybackMonths =
      spec.capexUsd != null && entrantMonthlyUsd != null && entrantMonthlyUsd > 0
        ? spec.capexUsd / entrantMonthlyUsd
        : null;

    // --- Verdict ------------------------------------------------------------
    const reasons: string[] = [];
    let verdict: BuyVerdict;

    if (!spec.retail) {
      verdict = "AVOID";
      reasons.push("Not a retail card — sold as HGX nodes/racks; rent cloud capacity instead of buying.");
      if (bestSubnet?.netMonthlyUsd != null)
        reasons.push(
          `Best ${bestSubnet.reference === "multi-gpu" ? "node-class " : ""}subnet here nets $${Math.round(bestSubnet.netMonthlyUsd).toLocaleString()}/mo — that is a datacenter-operator game.`
        );
    } else if (entrantMonthlyUsd == null) {
      verdict = "AVOID";
      if (candidates.length === 0) {
        reasons.push(
          "No subnet this card can reach carries a live opportunity snapshot yet — nothing measurable to buy into."
        );
      } else if (usable.length === 0) {
        const headline = excludedAvoid[0];
        reasons.push(
          `Every reachable subnet with a snapshot is platform-classified AVOID today${headline ? ` — the biggest headline (SN${headline.row.netuid} ${headline.row.name}, $${Math.round(headline.opp.netMonthlyUsd ?? 0).toLocaleString()}/mo) is a gate-rejected lottery, not an entry plan` : ""}.`
        );
      } else {
        reasons.push(
          "No reachable subnet currently shows a measurable net-positive entry plan."
        );
      }
    } else if (entrantMonthlyUsd <= 0) {
      verdict = "AVOID";
      reasons.push(
        `Best reachable subnet (SN${bestSubnet?.netuid}) nets $${Math.round(entrantMonthlyUsd).toLocaleString()}/mo on the owned basis — buying hardware to lose money monthly is not a strategy.`
      );
    } else {
      const pb = paybackMonths ?? Infinity;
      const clearsGoal = entrantMonthlyUsd >= goalMonthlyUsd;
      if (clearsGoal && paybackMonths != null && paybackMonths <= 12) {
        verdict = "BUY";
        reasons.push(
          `Clears the ${input.goalTaoPerMonth}-TAO goal line and pays the card back in ~${paybackMonths.toFixed(1)} months.`
        );
      } else if (clearsGoal) {
        verdict = "RENT-FIRST";
        reasons.push(
          `Profit clears the goal, but payback is ~${pb > 900 ? "∞" : pb.toFixed(0)} months at $${Math.round(spec.capexUsd ?? 0).toLocaleString()} — rent the card on Vast.ai first and validate the UID before wiring capex.`
        );
      } else if (
        entrantMonthlyUsd >= goalMonthlyUsd * 0.6 &&
        paybackMonths != null &&
        paybackMonths <= 12
      ) {
        verdict = "RENT-FIRST";
        reasons.push(
          `Borderline: $${Math.round(entrantMonthlyUsd).toLocaleString()}/mo is ${(entrantMonthlyUsd / goalMonthlyUsd * 100).toFixed(0)}% of the goal with a ~${paybackMonths.toFixed(1)}-month payback — worth validating rented before buying.`
        );
      } else {
        verdict = "MARGINAL";
        reasons.push(
          `Best reachable subnet nets $${Math.round(entrantMonthlyUsd).toLocaleString()}/mo — under ${(entrantMonthlyUsd / goalMonthlyUsd * 100).toFixed(0)}% of the ${input.goalTaoPerMonth}-TAO goal; the card would idle its capital.`
        );
      }
    }

    // The lottery trap, named: if an AVOID-classified subnet out-earns the
    // honest entrant, say so explicitly — that headline number is exactly
    // what pulls buyers into winner-take-all subnets.
    const topExcluded = excludedAvoid[0];
    if (
      topExcluded &&
      entrantMonthlyUsd != null &&
      (topExcluded.opp.netMonthlyUsd ?? 0) > entrantMonthlyUsd
    ) {
      reasons.push(
        `Headline trap: SN${topExcluded.row.netuid} ${topExcluded.row.name} headlines $${Math.round(topExcluded.opp.netMonthlyUsd ?? 0).toLocaleString()}/mo but is platform-classified AVOID (concentration/risk gate) — excluded from the entry plan.`
      );
    }
    // --- Evidence-based reasons (max 3 extra) --------------------------------
    if (teeBlocked.length > 0) {
      reasons.push(
        `No TEE: SN${teeBlocked.join(", SN")} require Confidential Computing and are unreachable (${blockedPool.toFixed(1)} TAO/day of pool locked out).`
      );
    }
    if (spec.tee === "server-edition-only") {
      reasons.push(
        "TEE subnets need the Server Edition ($18,899), not the Workstation card — price both before deciding."
      );
    }
    if (rewardedRatioPct != null && rewardedRatioPct < 10 && registered > 0) {
      reasons.push(
        `Lottery bucket: only ${rewardedRatioPct.toFixed(1)}% of ${registered.toLocaleString()} registered miners in these subnets earn anything.`
      );
    }
    if (rewardedRatioPct != null && rewardedRatioPct >= 60 && registered > 0) {
      reasons.push(
        `Friendly odds: ${rewardedRatioPct.toFixed(1)}% of registered miners are rewarded here.`
      );
    }
    if (bestSubnet?.reference === "multi-gpu") {
      reasons.push(
        `Every high-value subnet here wants a node build (reference ${bestSubnet.gpuCount ?? "?"}× GPUs) — a single card is the exception, not the rule.`
      );
    }
    if (rentMonthlyUsd != null && entrantMonthlyUsd != null && entrantMonthlyUsd > 0 && rentMonthlyUsd < entrantMonthlyUsd) {
      reasons.push(
        `Rent arbitrage: 24/7 Vast.ai rent is ~$${Math.round(rentMonthlyUsd).toLocaleString()}/mo vs $${Math.round(entrantMonthlyUsd).toLocaleString()}/mo net — renting leaves the capex risk with someone else.`
      );
    }

    return {
      model: spec.model,
      label: spec.label,
      cls: spec.cls,
      vramGb: spec.vramGb,
      powerW: spec.powerW,
      demandSubnets: demand.map((r) => r.netuid),
      reachableSubnets: reachable.map((r) => r.netuid),
      teeBlockedSubnets: teeBlocked,
      poolTaoPerDay: poolSeen ? pool : null,
      poolUsdPerDay: poolSeen ? pool * taoUsd : null,
      realizablePoolTaoPerDay: poolSeen ? realizablePool : null,
      rewardedSlots,
      registeredMiners: registered,
      rewardedRatioPct,
      perEarningTaoPerDay,
      perEarningUsdPerDay: perEarningTaoPerDay != null ? perEarningTaoPerDay * taoUsd : null,
      bestSubnet,
      entrantMonthlyUsd,
      entrantMonthlyTao,
      capexUsd: spec.capexUsd,
      capexLowUsd: spec.capexLowUsd,
      capexHighUsd: spec.capexHighUsd,
      capexNote: spec.capexNote,
      powerMonthlyUsd,
      rentHourlyUsd: spec.rentHourlyUsd,
      rentMonthlyUsd,
      rentNote: spec.rentNote,
      paybackMonths,
      goalTaoPerMonth: input.goalTaoPerMonth,
      goalMonthlyUsd,
      verdict,
      reasons: reasons.slice(0, 5),
    } satisfies BuyDecisionRow;
  });

  const verdictRank: Record<BuyVerdict, number> = { BUY: 0, "RENT-FIRST": 1, MARGINAL: 2, AVOID: 3 };
  const sorted = [...specRows].sort(
    (a, b) =>
      verdictRank[a.verdict] - verdictRank[b.verdict] ||
      (b.entrantMonthlyUsd ?? -1) - (a.entrantMonthlyUsd ?? -1) ||
      (b.poolTaoPerDay ?? -1) - (a.poolTaoPerDay ?? -1)
  );

  // CPU-only anchor: the best gate-passing no-GPU subnet — the honest
  // "buy nothing" baseline every GPU row is judged against.
  let cpuBest: BuyDecisionCpuAnchor | null = null;
  for (const r of rows) {
    if (r.cls !== "cpu-only" && r.cls !== "quantum") continue;
    if (BANNED_TOKENS[r.netuid]) continue;
    const opp = oppByNetuid.get(r.netuid);
    if (!opp || opp.netMonthlyUsd == null) continue;
    if ((opp.classification ?? "") === "AVOID") continue;
    if (!cpuBest || (opp.netMonthlyUsd ?? 0) > (cpuBest.netMonthlyUsd ?? 0)) {
      cpuBest = {
        netuid: r.netuid,
        name: r.name,
        netMonthlyUsd: opp.netMonthlyUsd ?? null,
        netTaoPerMonth: opp.netTaoPerMonth ?? null,
        classification: opp.classification ?? null,
        difficulty: opp.difficulty ?? null,
      };
    }
  }

  let gpuBestNetuid: number | null = null;
  let gpuBestNet = -Infinity;
  for (const r of sorted) {
    if (r.entrantMonthlyUsd != null && r.entrantMonthlyUsd > gpuBestNet) {
      gpuBestNet = r.entrantMonthlyUsd;
      gpuBestNetuid = r.bestSubnet?.netuid ?? null;
    }
  }

  let avoidCount = 0;
  let classifiedCount = 0;
  for (const opp of oppByNetuid.values()) {
    if (opp.classification == null) continue;
    classifiedCount++;
    if (opp.classification === "AVOID") avoidCount++;
  }

  return {
    rows: sorted,
    meta: {
      taoUsd,
      goalTaoPerMonth: input.goalTaoPerMonth,
      goalMonthlyUsd,
      electricityUsdPerKwh: input.electricityUsdPerKwh,
      capexAsOf: CAPEX_AS_OF,
      blockNumber: null,
      snapshotAt: null,
      priceSources: PRICE_SOURCES,
      poolNote: POOL_NOTE,
      cpuBest,
      gpuBestNetuid,
      avoidCount,
      classifiedCount,
    },
  };
}
