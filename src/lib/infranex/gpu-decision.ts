// GPU-DECISION — the buy-vs-rent decision engine.
//
// Answers one question with money attached: "which GPU should I BUY to mine
// Bittensor — H100, RTX PRO 6000, A100, or something else?"
//
// The cardinal mistake this panel exists to prevent: reading a subnet's
// emission POOL as if it were personal income. H100-named subnets carry the
// biggest pools (≈550 TAO/day live) but the pool is split across a handful of
// rewarded UIDs behind an 8-GPU TEE node — pool ≠ earnings. The engine is
// therefore built on a NEW-ENTRANT expected-value model, computed per
// (card, subnet) from chain-measured facts only:
//
//   P(earning at all)   ≈ rewardedMiners / minersCount  × skillBoost
//   payout if you earn  ≈ pool × realizability ÷ (rewardedMiners + 1)
//                          × medianFactor
//   EV                  = P × payout
//
//   * skillBoost (default 1.0) — you vs the average miner. >1 only with
//     evidence you beat the field; the median registered miner on a
//     1.6%-rewarded subnet earns ZERO, so pool/registered is a lottery
//     ticket, not income.
//   * medianFactor (default 0.35) — reward vectors are top-heavy; the mean
//     over earning UIDs sits ~3× above the median earner. As a fresh UID
//     you land near the median, not in the top decile.
//   * your UID dilutes the earning pool by one → ÷ (rewarded + 1).
//
// Hardware economics per (card, subnet): capex = street price × resolved
// GPU count (a "2× 4090 OR 1× L40S" menu must not bill the 4090 buyer one
// card), power = TDP × 720 h × $/kWh, rent = Vast median × 720 h. Verdicts:
// STRONG BUY / BUY / RENT, DON'T BUY / MARGINAL / AVOID / NO PATH.
//
// Client-safe (pure) — the API route supplies DB rows + live chain metrics;
// the view re-runs the math under user sliders.

import type { SpecialGroup, GpuClass } from "./gpu-landscape";
import { OVERRIDES } from "./gpu-landscape";

// ---------------------------------------------------------------------------
// Card catalog — street prices as of 2026-11 (see priceNote per card).
// tee: "yes" (confidential-compute certified) | "no" | "unverified".
// ---------------------------------------------------------------------------
export type TeeSupport = "yes" | "no" | "unverified";
export type CardClass = GpuClass; // "consumer" | "pro" | "datacenter"

export interface DecisionCard {
  token: string;
  label: string;
  vramGb: number;
  cls: CardClass;
  tee: TeeSupport;
  tdpW: number;
  priceUsedUsd: number;
  priceNewUsd: number;
  vastUsdHr: number;
  priceNote: string;
}

export const PRICE_AS_OF = "2026-11";

export const DECISION_CARDS: DecisionCard[] = [
  { token: "H100", label: "H100 80GB", vramGb: 80, cls: "datacenter", tee: "yes", tdpW: 700, priceUsedUsd: 18000, priceNewUsd: 28000, vastUsdHr: 2.5, priceNote: "2026 guides: used $15–28K, new $25–40K (Jarvislabs / mercatus-ai); rent ≈ market median" },
  { token: "H200", label: "H200 141GB", vramGb: 141, cls: "datacenter", tee: "yes", tdpW: 700, priceUsedUsd: 28000, priceNewUsd: 34000, vastUsdHr: 5.7, priceNote: "$30–34K US (Mar 2026), Nov 2026 listings $32–47K; rent = Oct 2026 median" },
  { token: "B200", label: "B200 192GB", vramGb: 192, cls: "datacenter", tee: "yes", tdpW: 1000, priceUsedUsd: 48000, priceNewUsd: 48000, vastUsdHr: 8.19, priceNote: "≈$390K/8-GPU Exxact node (Oct 2026); rent = Oct 2026 median" },
  { token: "A100", label: "A100 80GB", vramGb: 80, cls: "datacenter", tee: "no", tdpW: 400, priceUsedUsd: 6500, priceNewUsd: 11000, vastUsdHr: 0.9, priceNote: "used $4–9.5K (Mar/Sep 2026); no TEE → TEE-gated subnets locked out" },
  { token: "RTX Pro 6000", label: "RTX PRO 6000 Blackwell 96GB", vramGb: 96, cls: "pro", tee: "unverified", tdpW: 600, priceUsedUsd: 12000, priceNewUsd: 16000, vastUsdHr: 1.55, priceNote: "$16K new Nov 2026 — up 87% since launch (Thunder Compute); Vast median $1.47–1.63/hr" },
  { token: "RTX 6000 Ada", label: "RTX 6000 Ada 48GB", vramGb: 48, cls: "pro", tee: "no", tdpW: 300, priceUsedUsd: 5500, priceNewUsd: 6800, vastUsdHr: 0.95, priceNote: "street estimate — verify before purchase" },
  { token: "L40S", label: "L40S 48GB", vramGb: 48, cls: "pro", tee: "no", tdpW: 350, priceUsedUsd: 6500, priceNewUsd: 8000, vastUsdHr: 0.95, priceNote: "street estimate — verify before purchase" },
  { token: "RTX A6000", label: "RTX A6000 48GB (Ampere)", vramGb: 48, cls: "pro", tee: "no", tdpW: 300, priceUsedUsd: 3200, priceNewUsd: 4600, vastUsdHr: 0.75, priceNote: "street estimate — verify before purchase" },
  { token: "RTX 5090", label: "RTX 5090 32GB", vramGb: 32, cls: "consumer", tee: "no", tdpW: 575, priceUsedUsd: 6200, priceNewUsd: 6900, vastUsdHr: 1.2, priceNote: "eBay used $5,999–6,700 Nov 2026 — ~3× launch MSRP bubble (bestvaluegpu)" },
  { token: "RTX 4090", label: "RTX 4090 24GB", vramGb: 24, cls: "consumer", tee: "no", tdpW: 450, priceUsedUsd: 1800, priceNewUsd: 2300, vastUsdHr: 0.5, priceNote: "street estimate; Vast rent $0.36–0.60/hr" },
  { token: "RTX 3090", label: "RTX 3090 24GB", vramGb: 24, cls: "consumer", tee: "no", tdpW: 350, priceUsedUsd: 700, priceNewUsd: 950, vastUsdHr: 0.32, priceNote: "street estimate" },
  { token: "L4", label: "L4 24GB", vramGb: 24, cls: "pro", tee: "no", tdpW: 72, priceUsedUsd: 2800, priceNewUsd: 3600, vastUsdHr: 0.45, priceNote: "street estimate" },
  { token: "A10", label: "A10 24GB", vramGb: 24, cls: "datacenter", tee: "no", tdpW: 150, priceUsedUsd: 1800, priceNewUsd: 2800, vastUsdHr: 0.45, priceNote: "street estimate" },
  { token: "GTX 1660", label: "GTX 1660 6GB", vramGb: 6, cls: "consumer", tee: "no", tdpW: 120, priceUsedUsd: 120, priceNewUsd: 200, vastUsdHr: 0.1, priceNote: "street estimate" },
];

// ---------------------------------------------------------------------------
// Requirement parsing — token recognition + menu-aware per-model GPU counts.
// Parentheses carry qualifiers: "(recommended: A100 80GB)", "(fallback RTX
// 5090 / RTX PRO 6000)", "(1–4)" count ranges. A card named only inside a
// parenthetical is a soft option — eligible, but flagged.
// ---------------------------------------------------------------------------

const TOKEN_PATTERNS: Array<[string, RegExp]> = [
  ["H800/A800", /\b(?:H800|A800)\b/i],
  ["H200", /\bH\s*200\b/i],
  ["H100", /\bH\s*100\b/i],
  ["B300", /\bB\s*300\b/i],
  ["B200", /\bB\s*200\b/i],
  ["GH200", /\bGH\s*200\b/i],
  ["MI325X", /\bMI\s*325X\b/i],
  ["MI300X", /\bMI\s*300X\b/i],
  ["H20", /\bH\s*20\b/i],
  ["RTX Pro 6000", /\bRTX\s*(?:PRO|Pro)?\s*6000\b(?!\s*Ada)/i],
  ["RTX 6000 Ada", /\b(?:RTX\s*)?6000\s*Ada\b/i],
  ["RTX A6000", /\b(?:RTX\s*)?A\s*6000\b/i],
  ["A100", /\bA\s*100\b/i],
  ["A40", /\bA\s*40\b/i],
  ["L40S", /\bL40S\b/i],
  ["L40", /\bL40\b(?!S)/i],
  ["L4", /\bL4\b(?!0)/i],
  ["A10", /\bA10\b/i],
  ["RTX 5090", /\b(?:RTX\s*)?5090\b/i],
  ["RTX 4090", /\b(?:RTX\s*)?4090\b/i],
  ["RTX 4070", /\b(?:RTX\s*)?4070\b/i],
  ["RTX 3090 Ti", /\b3090\s*Ti\b/i],
  ["RTX 3090", /\b(?:RTX\s*)?3090\b/i],
  ["RTX 3080", /\b(?:RTX\s*)?3080\b/i],
  ["GTX 1660 Super", /\b1660\s*Super\b/i],
  ["GTX 1660 Ti", /\b1660\s*Ti\b/i],
  ["GTX 1660", /\b(?:GTX\s*)?1660\b/i],
  ["GTX 1650", /\b(?:GTX\s*)?1650\b/i],
  ["GTX 1080 Ti", /\b1080\s*Ti\b/i],
  ["GTX 1080", /\b1080\b/i],
];

/** Requirement token → card tokens that satisfy it (China variants map to
 *  their international class). */
const FAMILY_EQ: Record<string, string[]> = {
  "H800/A800": ["H100", "A100"],
};

const VRAM_FLOOR_RE = /(?:>=?\s*|≥\s*|at least\s*|>\s*)(\d{1,3})\s*GB/i;
const CPU_ONLY_RE = /cpu-only|no\s*gpu|\bqpu\b|quantum/i;
const BAN_RE = /excluded|banned|not\s*(?:allowed|supported|accepted)/i;
const PAREN_RE = /\(([^)]*)\)/g;
const CLAUSE_SPLIT_RE = /,|;|\bor\b/i;
const MULT_RE = /(\d{1,2})\s*[x×]\s*(?:NVIDIA\s*)?\w/i;
const RANGE_RE = /^\s*(\d{1,2})\s*[–-]\s*(\d{1,2})\s*$/;

export interface ParsedRequirement {
  /** tokens named OUTSIDE parentheses — hard requirements/menus. */
  hardTokens: string[];
  /** tokens named only INSIDE parentheses (recommended/fallback). */
  softTokens: string[];
  /** token → explicit "N×" multiplier or "(m–n)" range max. */
  counts: Record<string, number>;
  floorGb: number | null;
  cpuOnly: boolean;
  banned: boolean;
}

export function parseRequirement(gpuText: string, scrapedFloor: number | null): ParsedRequirement {
  const text = (gpuText || "").trim();
  const parens: string[] = [];
  let main = text.replace(PAREN_RE, (_m, inner: string) => {
    parens.push(inner);
    return " ";
  });

  const tokensIn = (s: string): string[] =>
    TOKEN_PATTERNS.filter(([, re]) => re.test(s)).map(([t]) => t);

  const hardTokens: string[] = [];
  const softTokens: string[] = [];
  const counts: Record<string, number> = {};

  // Main text: clause-aware so "2× RTX 4090/5090, or 1× L40S" bills the
  // 4090 buyer two cards and the L40S buyer one.
  const mainClauses = main.split(CLAUSE_SPLIT_RE);
  for (const clause of mainClauses) {
    for (const [token] of TOKEN_PATTERNS) {
      const re = TOKEN_PATTERNS.find(([t]) => t === token)![1];
      if (!re.test(clause)) continue;
      if (!hardTokens.includes(token)) hardTokens.push(token);
      if (counts[token] === undefined) {
        const m = MULT_RE.exec(clause);
        if (m) counts[token] = parseInt(m[1], 10);
      }
    }
  }
  // "(1–2)" / "(1–4)" count ranges attach to the most recent main token.
  let lastToken: string | null = null;
  for (const part of text.split(/\(|\)/)) {
    const toks = tokensIn(part);
    if (toks.length > 0) {
      lastToken = toks[toks.length - 1];
      continue;
    }
    const r = RANGE_RE.exec(part);
    if (r && lastToken && counts[lastToken] === undefined)
      counts[lastToken] = Math.max(parseInt(r[1], 10), parseInt(r[2], 10));
  }
  for (const p of parens) {
    for (const token of tokensIn(p)) {
      if (!hardTokens.includes(token) && !softTokens.includes(token)) softTokens.push(token);
    }
  }

  const floorMatch =
    VRAM_FLOOR_RE.exec(main) ?? VRAM_FLOOR_RE.exec(text);
  const floorGb = floorMatch ? parseInt(floorMatch[1], 10) : scrapedFloor ?? null;

  return {
    hardTokens,
    softTokens,
    counts,
    floorGb,
    cpuOnly: CPU_ONLY_RE.test(text),
    banned: BAN_RE.test(text),
  };
}

export type MineReason =
  | "named" | "floor" | "cpu-only" | "quantum" | "banned"
  | "tee" | "vram" | "unverified" | "unspecified";

export interface MineVerdict {
  ok: boolean;
  reason: MineReason;
  /** resolved per-model GPU count for THIS card (menu-aware). */
  count: number;
  nodeScale: boolean;
  /** true when the card is named only in a parenthetical (recommended /
   *  fallback wording) — eligible, but verify with the subnet team. */
  soft: boolean;
}

// SN44's explicit exclusion list (from the landscape audit note).
const SN44_BANNED = new Set(["RTX 5090", "B200", "H200", "H20", "MI300X"]);

export function canMine(
  card: DecisionCard,
  netuid: number,
  gpuText: string,
  scrapedFloor: number | null,
  scrapedCount: number | null,
  teeRequired: boolean
): MineVerdict {
  const scrapedN = Math.max(1, scrapedCount ?? 1);
  const base = { count: scrapedN, nodeScale: scrapedN > 1, soft: false };

  if (CPU_ONLY_RE.test(gpuText)) return { ...base, ok: false, reason: "cpu-only" };
  if (!gpuText) {
    if (scrapedFloor == null) return { ...base, ok: false, reason: "unverified" };
    if (scrapedFloor === 0) return { ...base, ok: false, reason: "cpu-only" };
  }
  if (BAN_RE.test(gpuText)) return { ...base, ok: false, reason: "banned" };
  if (teeRequired && card.tee !== "yes") return { ...base, ok: false, reason: "tee" };
  // SN44's explicit exclusion list applies to SN44 only — not network-wide.
  if (netuid === 44 && SN44_BANNED.has(card.token)) return { ...base, ok: false, reason: "banned" };

  const req = parseRequirement(gpuText, scrapedFloor);
  if (req.cpuOnly) return { ...base, ok: false, reason: "cpu-only" };

  // Named-model path — hard tokens first, then parenthetical soft tokens.
  const namedCheck = (tokens: string[], soft: boolean): MineVerdict | null => {
    for (const rt of tokens) {
      const fam = FAMILY_EQ[rt] ?? [rt];
      if (!fam.includes(card.token)) continue;
      const count = Math.max(1, req.counts[rt] ?? scrapedN);
      if (req.floorGb != null && card.vramGb < req.floorGb)
        return { ...base, ok: false, reason: "vram", count, soft };
      return { ok: true, reason: "named", count, nodeScale: count > 1, soft };
    }
    return null;
  };
  const hardHit = namedCheck(req.hardTokens, false);
  if (hardHit) return hardHit;
  const softHit = namedCheck(req.softTokens, true);
  if (softHit) return softHit;
  if (req.hardTokens.length > 0 || req.softTokens.length > 0) {
    // The requirement names models, but none match this card.
    // EXCEPTION: a soft-named card with no hard tokens at all already
    // returned above; here hard tokens exist and exclude this card.
    if (req.hardTokens.length > 0) return { ...base, ok: false, reason: "named" };
  }

  // Floor path: no model named — VRAM floor + class rank.
  if (req.floorGb != null && req.floorGb > 0) {
    const need: CardClass = req.floorGb > 96 ? "datacenter" : req.floorGb > 32 ? "pro" : "consumer";
    const rank: Record<CardClass, number> = { consumer: 0, pro: 1, datacenter: 2 };
    if (card.vramGb >= req.floorGb && rank[card.cls] >= rank[need])
      return { ok: true, reason: "floor", count: scrapedN, nodeScale: scrapedN > 1, soft: false };
    return { ...base, ok: false, reason: "floor" };
  }

  return { ...base, ok: false, reason: "unspecified" };
}

// ---------------------------------------------------------------------------
// Payload assembly — raw facts only; the view applies slider economics.
// ---------------------------------------------------------------------------

export interface DecisionSubnet {
  netuid: number;
  name: string;
  reqText: string;
  count: number;
  nodeScale: boolean;
  soft: boolean;
  matchReason: MineReason;
  /** whole-subnet miner-side pool, TAO/day (chain-measured). */
  poolTaoPerDay: number | null;
  minersCount: number | null;
  rewardedMiners: number | null;
  rewardedRatio: number | null;
  realizability: number;
  /** mean TAO/day over today's EARNING UIDs — display only, never the EV. */
  meanEarnerTaoPerDay: number | null;
  classification: string | null;
  difficulty: string | null;
  dataConfidence: number | null;
  requirementsSource: string | null;
}

export interface DecisionCardRow extends DecisionCard {
  subnets: DecisionSubnet[];
  teeLockedOut: number;
}

export interface DecisionMeta {
  blockNumber: number | null;
  taoPriceUsd: number;
  snapshotAt: string | null;
  electricityUsdPerKwh: number;
  targetTaoPerMonth: number;
  rigGpuVramGb: number;
  rigTeeCapable: boolean;
  priceAsOf: string;
  opportunityDay: string | null;
}

export interface DecisionPayload {
  meta: DecisionMeta;
  cards: DecisionCardRow[];
}

interface LiveSubnet {
  minersCount?: number | null;
  rewardedMiners?: number | null;
  minerEmissionTaoPerDay?: number | null;
  rewardRealizability?: number | null;
}

export interface OppFacts {
  classification: string | null;
  difficulty: string | null;
  dataConfidence: number | null;
}

export function buildDecisionPayload(
  rows: Array<{
    netuid: number;
    name: string | null;
    recommendedGpu: string | null;
    minVramGb: number | null;
    gpuCount: number | null;
    hostingRequirements: string | null;
    requirementsSource: string | null;
  }>,
  liveByNetuid: Map<number, LiveSubnet>,
  oppByNetuid: Map<number, OppFacts>,
  meta: DecisionMeta
): DecisionPayload {
  const cards: DecisionCardRow[] = DECISION_CARDS.map((card) => ({
    ...card,
    subnets: [],
    teeLockedOut: 0,
  }));

  for (const r of rows) {
    const gpu = (r.recommendedGpu ?? "").trim();
    let teeRequired = false;
    if (r.hostingRequirements) {
      try {
        const h = JSON.parse(r.hostingRequirements) as Record<string, unknown>;
        teeRequired = h.teeRequired === true;
      } catch { /* malformed hosting JSON — treat as clean */ }
    }
    // Landscape override special groups gate everything except fallbacks
    // (banned / quantum / cpu-only / unverified / unspecified → no card path).
    const override = OVERRIDES[r.netuid];
    if (override?.special && override.special !== "fallback") continue;

    for (const card of cards) {
      const v = canMine(card, r.netuid, gpu, r.minVramGb, r.gpuCount, teeRequired);
      if (!v.ok) {
        if (v.reason === "tee") card.teeLockedOut += 1;
        continue;
      }
      if (override?.special === "fallback" && v.reason !== "named") continue;
      const s = liveByNetuid.get(r.netuid) ?? {};
      const pool = s.minerEmissionTaoPerDay ?? null;
      const rew = s.rewardedMiners ?? null;
      const reg = s.minersCount ?? null;
      const rz = s.rewardRealizability != null && s.rewardRealizability > 0
        ? Math.min(s.rewardRealizability, 1)
        : 1;
      const meanEarner = pool != null && pool > 0 && rew != null && rew > 0
        ? (pool * rz) / rew
        : null;
      const opp = oppByNetuid.get(r.netuid);
      card.subnets.push({
        netuid: r.netuid,
        name: r.name ?? `SN${r.netuid}`,
        reqText: gpu || "(no requirement scraped)",
        count: v.count,
        nodeScale: v.nodeScale,
        soft: v.soft,
        matchReason: v.reason,
        poolTaoPerDay: pool,
        minersCount: reg,
        rewardedMiners: rew,
        rewardedRatio: reg != null && reg > 0 && rew != null ? rew / reg : null,
        realizability: rz,
        meanEarnerTaoPerDay: meanEarner,
        classification: opp?.classification ?? null,
        difficulty: opp?.difficulty ?? null,
        dataConfidence: opp?.dataConfidence ?? null,
        requirementsSource: r.requirementsSource ?? null,
      });
    }
  }

  // Rank subnets inside each card by pool size (facts-first); the view ranks
  // by economics once the user's sliders are applied.
  for (const card of cards) {
    card.subnets.sort((a, b) =>
      (b.poolTaoPerDay ?? -1) - (a.poolTaoPerDay ?? -1) || a.netuid - b.netuid);
  }
  return { meta, cards };
}
