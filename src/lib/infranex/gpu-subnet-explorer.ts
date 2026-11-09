// GPU-SUBNET-EXPLORER — "click a GPU, see every subnet where it can mine."
//
// Drill-down companion to the GPU Buy Decision panel: the panel answers
// "which card should I buy?" per model; this explorer answers "which
// subnets does that card unlock?" — the full subnet list per GPU with the
// verbatim requirement line, TEE reachability, live emission pool and the
// per-earning-UID reality for each subnet.
//
// Vocabulary is intentionally identical to the buy-decision engine
// (GPU_BUY_CATALOG models ↔ gpu-research-seed tokens), so a subnet counted
// in a family here is the same subnet the panel counts. Banned mentions
// (SN44 names cards only to EXCLUDE them) and TEE gating follow the same
// rules. Pure and client-safe: the API route supplies DB rows.
//
//   1. MATCH    — seed audit rows whose `models` name the card (case-
//                 insensitive), minus that subnet's banned tokens.
//   2. REACH    — TEE-required subnets are unreachable for cards that
//                 cannot attest (tee === "no"); "server-edition-only"
//                 cards (RTX PRO 6000 SE) count as capable, note shown.
//   3. LIVE     — chain-measured miner-side emission, rewarded UIDs and
//                 realizability-weighted per-earning yield per subnet
//                 (same buildLive() pipeline as GPU Landscape).
//   4. SORT     — reachable subnets by per-earning USD/day desc, then
//                 TEE-blocked rows dimmed at the end of the list.

import { GPU_BUY_CATALOG, type TeeSupport } from "./gpu-buy-decision";
import { buildLive, type LandscapeLive } from "./gpu-landscape";
import { GPU_RESEARCH_META } from "./gpu-research-seed";

const norm = (s: string) => s.trim().toLowerCase();

// Verbatim copy of the buy-decision rule: SN44's requirement line NAMES
// these cards only to exclude them — they must not appear as usable there.
const BANNED_TOKENS: Record<number, string[]> = {
  44: ["RTX 5090", "B200", "H200", "H20", "MI300X"],
};

export interface ExplorerSeedRow {
  netuid: number;
  name: string;
  repo: string | null;
  status: string;
  cls: string;
  models: string[];
  headline: string;
  gpuCount: number | null;
  vramFloor: number | null;
  evidence: string | null;
}

export interface ExplorerLive {
  minerEmissionTaoPerDay?: number | null;
  minersCount?: number | null;
  rewardedMiners?: number | null;
  rewardRealizability?: number | null;
}

export interface ExplorerOpportunity {
  classification?: string | null;
  difficulty?: string | null;
  netMonthlyUsd?: number | null;
}

export interface ExplorerSubnet {
  netuid: number;
  name: string;
  repo: string | null;
  status: string;
  cls: string;
  /** Verbatim requirement line from the repo audit. */
  headline: string;
  gpuCount: number | null;
  vramFloor: number | null;
  /** True when this subnet demands TEE attestation. */
  teeRequired: boolean;
  /** False = TEE-gated away from this card (row is informational only). */
  reachable: boolean;
  evidence: string | null;
  minersCount: number | null;
  rewardedMiners: number | null;
  poolTaoPerDay: number | null;
  perEarningTaoPerDay: number | null;
  perEarningUsdPerDay: number | null;
  /** True when the per-earner figure used the ×0.6 fallback. */
  estimated: boolean;
  classification: string | null;
  difficulty: string | null;
  netMonthlyUsd: number | null;
}

export interface ExplorerFamily {
  model: string;
  label: string;
  cls: "datacenter" | "pro" | "consumer";
  vramGb: number;
  tee: TeeSupport;
  teeNote: string;
  retail: boolean;
  capexUsd: number | null;
  capexLowUsd: number | null;
  capexHighUsd: number | null;
  capexNote: string;
  powerW: number;
  rentHourlyUsd: number | null;
  /** Subnets naming the card (audit vocabulary, bans removed). */
  demandCount: number;
  /** Reachable after TEE gating — what the stats below cover. */
  reachableCount: number;
  teeBlockedCount: number;
  poolTaoPerDay: number | null;
  poolUsdPerDay: number | null;
  rewardedSlots: number;
  registeredMiners: number;
  rewardedRatioPct: number | null;
  perEarningTaoPerDay: number | null;
  perEarningUsdPerDay: number | null;
  subnets: ExplorerSubnet[];
}

export interface GpuSubnetExplorerResult {
  families: ExplorerFamily[];
  meta: {
    taoPriceUsd: number;
    blockNumber: number | null;
    snapshotAt: string | null;
    auditedAt: string;
    universe: number;
  };
}

export interface GpuSubnetExplorerInput {
  rows: ExplorerSeedRow[];
  liveByNetuid: Map<number, ExplorerLive>;
  oppByNetuid: Map<number, ExplorerOpportunity>;
  teeRequiredByNetuid: Map<number, boolean>;
  taoUsd: number;
}

export function computeGpuSubnetExplorer(
  input: GpuSubnetExplorerInput
): GpuSubnetExplorerResult {
  const { rows, liveByNetuid, oppByNetuid, teeRequiredByNetuid, taoUsd } = input;

  const families: ExplorerFamily[] = [];
  for (const spec of GPU_BUY_CATALOG) {
    const token = norm(spec.model);

    // 1. MATCH — audit rows naming the card, minus that subnet's banned
    //    tokens (same rule as the buy-decision engine).
    const demand = rows.filter((r) => {
      const banned = BANNED_TOKENS[r.netuid];
      const usable = banned
        ? r.models.filter((m) => !banned.some((b) => norm(b) === norm(m)))
        : r.models;
      return usable.some((m) => norm(m) === token);
    });

    // 2. REACH — TEE-required subnets need Confidential Computing.
    const teeCapable = spec.tee !== "no";
    const reachable: ExplorerSeedRow[] = [];
    const teeBlocked: ExplorerSeedRow[] = [];
    for (const r of demand) {
      if (!teeCapable && teeRequiredByNetuid.get(r.netuid) === true) teeBlocked.push(r);
      else reachable.push(r);
    }

    // 3. BUILD the subnet detail rows with live metrics.
    const buildDetail = (r: ExplorerSeedRow, isReachable: boolean): ExplorerSubnet => {
      const live = liveByNetuid.get(r.netuid);
      const L: LandscapeLive = live
        ? buildLive(
            {
              minersCount: live.minersCount,
              rewardedMiners: live.rewardedMiners,
              minerEmissionTaoPerDay: live.minerEmissionTaoPerDay,
              rewardRealizability: live.rewardRealizability,
            },
            taoUsd
          )
        : {
            minersCount: null,
            rewardedMiners: null,
            minerEmissionTaoPerDay: null,
            perEarningUsdPerDay: null,
            estimated: false,
          };
      const opp = oppByNetuid.get(r.netuid);
      const perEarningTaoPerDay =
        L.perEarningUsdPerDay != null && taoUsd > 0 ? L.perEarningUsdPerDay / taoUsd : null;
      return {
        netuid: r.netuid,
        name: r.name,
        repo: r.repo,
        status: r.status,
        cls: r.cls,
        headline: r.headline,
        gpuCount: r.gpuCount,
        vramFloor: r.vramFloor,
        teeRequired: teeRequiredByNetuid.get(r.netuid) === true,
        reachable: isReachable,
        evidence: r.evidence,
        minersCount: L.minersCount,
        rewardedMiners: L.rewardedMiners,
        poolTaoPerDay: L.minerEmissionTaoPerDay,
        perEarningTaoPerDay,
        perEarningUsdPerDay: L.perEarningUsdPerDay,
        estimated: L.estimated,
        classification: opp?.classification ?? null,
        difficulty: opp?.difficulty ?? null,
        netMonthlyUsd: opp?.netMonthlyUsd ?? null,
      };
    };

    const reachableDetails = reachable
      .map((r) => buildDetail(r, true))
      .sort(
        (a, b) =>
          (b.perEarningUsdPerDay ?? -1) - (a.perEarningUsdPerDay ?? -1) || a.netuid - b.netuid
      );
    const blockedDetails = teeBlocked
      .map((r) => buildDetail(r, false))
      .sort(
        (a, b) =>
          (b.perEarningUsdPerDay ?? -1) - (a.perEarningUsdPerDay ?? -1) || a.netuid - b.netuid
      );

    // 4. FAMILY stats over reachable subnets only — identical aggregation
    //    to the buy-decision panel (realizability-weighted pool) so the
    //    two never disagree, and the per-earner lines up with the
    //    per-subnet values shown underneath.
    let pool = 0;
    let realizablePool = 0;
    let poolSeen = false;
    let rewardedSlots = 0;
    let registered = 0;
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
    const perEarningTaoPerDay = poolSeen && rewardedSlots > 0 ? realizablePool / rewardedSlots : null;

    families.push({
      model: spec.model,
      label: spec.label,
      cls: spec.cls,
      vramGb: spec.vramGb,
      tee: spec.tee,
      teeNote: spec.teeNote,
      retail: spec.retail,
      capexUsd: spec.capexUsd,
      capexLowUsd: spec.capexLowUsd,
      capexHighUsd: spec.capexHighUsd,
      capexNote: spec.capexNote,
      powerW: spec.powerW,
      rentHourlyUsd: spec.rentHourlyUsd,
      demandCount: demand.length,
      reachableCount: reachable.length,
      teeBlockedCount: teeBlocked.length,
      poolTaoPerDay: poolSeen ? pool : null,
      poolUsdPerDay: poolSeen && taoUsd > 0 ? pool * taoUsd : null,
      rewardedSlots,
      registeredMiners: registered,
      rewardedRatioPct: registered > 0 ? (rewardedSlots / registered) * 100 : null,
      perEarningTaoPerDay,
      perEarningUsdPerDay:
        perEarningTaoPerDay != null && taoUsd > 0 ? perEarningTaoPerDay * taoUsd : null,
      subnets: [...reachableDetails, ...blockedDetails],
    });
  }

  // Families with the biggest reachable pool first; non-retail SKUs stay
  // visible (they matter to renters) but the sort is purely by pool.
  families.sort((a, b) => (b.poolTaoPerDay ?? -1) - (a.poolTaoPerDay ?? -1));

  return {
    families,
    meta: {
      taoPriceUsd: taoUsd,
      blockNumber: null,
      snapshotAt: null,
      auditedAt: GPU_RESEARCH_META.auditedAt,
      universe: rows.length,
    },
  };
}
