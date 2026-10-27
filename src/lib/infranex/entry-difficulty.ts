import type { LiveOpportunity } from "./live-merge";

// ---------------------------------------------------------------------------
// ENTRY-DIFFICULTY-1 — "is a NEW miner realistically able to compete here?"
//
// Classifies every subnet into EASY / MODERATE / DIFFICULT / UNKNOWN and
// explains EVERY classification with the measurements behind it.
//
// THE ONE ANTI-PATTERN THIS MODULE EXISTS TO KILL: "fewer miners = easier".
// A quiet subnet can be quiet BECAUSE nobody earns there. The classifier
// therefore never treats miner count as a positive signal — it ranks by
// whether comparable NEW seats actually earn:
//
//   PRIMARY   month-1 earn chance (earnChance — newcomer odds, measured)
//   PRIMARY   rewardedRatio — share of registered seats that earned last
//             epoch (chain reward vector, not a model)
//   CONCENTRATION top-10 incentive share — winner-take-all flow squeezes
//             a new seat toward zero regardless of how many miners run
//   ENTRY     free registration slots — a full ring queues newcomers
//   RAMP      bond/EMA maturity weeks — how long before validators score
//             the new UID at full weight
//   HARDWARE  repo-documented config: bare-metal/TEE gates, ≥4-GPU server
//             builds, static-IP + 1:1 ports — deployment difficulty
//   OPS BURDEN documented operational duties in the official mechanics
//
// UNKNOWN is honest: with no reward vector AND no entry-odds measurement
// there is no evidence either way, and the spec forbids inventing one.
// ---------------------------------------------------------------------------

export type EntryDifficulty = "EASY" | "MODERATE" | "DIFFICULT" | "UNKNOWN";

export interface EntryDifficultyVerdict {
  id: string;
  netuid: number;
  difficulty: EntryDifficulty;
  /** 0–100 ease score for "easiest mining" sorting. null for UNKNOWN —
   *  an unmeasured row must not fake a rank position. */
  easeScore: number | null;
  /** Every reason, most decisive first. */
  reasons: string[];
  /** One sentence a miner can act on. */
  oneLine: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const DIFFICULTY_META: Record<
  EntryDifficulty,
  { label: string; className: string; detail: string }
> = {
  EASY: {
    label: "Easy",
    className: "text-success border-success/40 bg-success/10",
    detail: "New seats measurably earn: healthy share of miners rewarded, open entry, container-friendly hardware, short ramp.",
  },
  MODERATE: {
    label: "Moderate",
    className: "text-primary border-primary/40 bg-primary/10",
    detail: "A competitive but reachable lane — some patience or hardware care needed; not a jackpot seat.",
  },
  DIFFICULT: {
    label: "Difficult",
    className: "text-warning border-warning/40 bg-warning/10",
    detail: "Concentrated rewards, full ring, long ramp, or server-class/TEE hardware — expect a fight or a build.",
  },
  UNKNOWN: {
    label: "Unknown",
    className: "text-muted-foreground border-border/60 bg-card/60",
    detail: "No reward vector and no entry-odds measurement — the engine refuses to guess. Treat every figure as provisional.",
  },
};

export function computeEntryDifficulty(o: LiveOpportunity): EntryDifficultyVerdict {
  const reasons: string[] = [];
  const chance = o.earnChance;
  const ratio = o.rewardedRatio;
  const top10 = o.top10IncentiveShare;
  const free = o.freeSlots;
  const ramp = o.rampWeeks;
  const hosting = o.hosting;

  // --- UNKNOWN: no measured evidence either way ---------------------------
  if (ratio == null && !chance && ramp == null) {
    return {
      id: o.id,
      netuid: o.netuid,
      difficulty: "UNKNOWN",
      easeScore: null,
      reasons: [
        "No reward vector, no entry-odds measurement and no ramp estimate — there is no evidence a newcomer earns here.",
        "Registering blind costs the burn + first-months run-rate; wait for a measurement or treat it as research.",
      ],
      oneLine: "Unknown — no measured evidence that a new miner can earn here yet.",
    };
  }

  // --- Hardware / ops difficulty (independent evidence lines) -------------
  const bareMetal = Boolean(hosting?.bareMetalOnly);
  const tee = Boolean(hosting?.teeRequired);
  const gpus = o.gpuCount ?? 1;
  if (tee) reasons.push("Repo documents a TEE/TDX requirement — needs confidential-compute hardware, not a standard rental.");
  else if (bareMetal) reasons.push("Repo requires bare metal / VM — container clouds are out; plan a dedicated build.");
  if (gpus >= 4) reasons.push(`Documented ${gpus}×-GPU configuration — a server build, not a single rig.`);
  else if (gpus >= 2) reasons.push(`Documented ${gpus}×-GPU configuration — budget a multi-GPU build.`);
  if (hosting?.staticIpRequired) reasons.push("Static IP + 1:1 ports required — narrows provider choice and adds ops work.");
  const ops = o.mechanics?.operations?.length ?? 0;
  if (ops >= 3) reasons.push(`${ops} documented operational duties — a hands-on subnet (monitoring, updates, key management).`);
  if ((o.minVramGb ?? 0) >= 80) reasons.push(`Needs ≥ ${o.minVramGb} GB VRAM — datacenter-class cards only.`);

  // --- Earning difficulty (the primary evidence) --------------------------
  let ease = 50;
  if (chance) {
    reasons.push(chance.note);
    ease = chance.pct; // the newcomer's own measured odds anchor the score
  }
  if (ratio != null) {
    const pctEarned = Math.round(ratio * 100);
    reasons.push(`${pctEarned}% of registered miners earned last epoch (chain reward vector).`);
    if (chance) ease = ease * 0.6 + clamp(((ratio - 0.03) / (0.65 - 0.03)) * 100, 0, 100) * 0.4;
    else ease = clamp(((ratio - 0.03) / (0.65 - 0.03)) * 100, 0, 100);
  }
  if (top10 != null) {
    reasons.push(`Top decile of UIDs holds ${(top10 * 100).toFixed(0)}% of incentive flow.`);
    if (top10 >= 0.98) {
      ease *= 0.55;
      reasons.push("Winner-take-all concentration — the remaining 90% of seats split almost nothing.");
    } else if (top10 >= 0.9) {
      ease *= 0.85;
    }
  }
  const med = o.rewardMedianShare;
  if (med != null && med < 0.3) {
    reasons.push(`Median earning miner takes only ${(med * 100).toFixed(1)}% of the flow — even earners earn thin.`);
    ease *= 0.85;
  }
  if (free != null) {
    if (free > 0) {
      reasons.push(`${free} free slot${free === 1 ? "" : "s"} open — a newcomer can register now.`);
      ease = Math.min(100, ease * 1.1);
    } else {
      reasons.push("No free slots — entry buys a queue position behind existing miners.");
      ease *= 0.9;
    }
  }
  if (ramp != null) {
    if (ramp <= 4) reasons.push(`Short ramp (≈${Math.round(ramp)} wk) — validators score a new UID quickly.`);
    else {
      reasons.push(`≈${Math.round(ramp)}-week bond/EMA ramp before full validator weight.`);
      ease *= ramp >= 8 ? 0.8 : 0.9;
    }
  }
  if (o.liveMiners != null) {
    reasons.push(`≈${o.liveMiners} miners registered (context only — count alone never implies easy or hard).`);
  }

  // --- Classification bands ------------------------------------------------
  // CALIBRATED to the app's own seat model (assessSeatChance) and the live
  // chain distributions: top-DECILE incentive share ≥ 0.85 is the Bittensor
  // norm (most UIDs earn nothing), so it is NOT a concentration verdict —
  // only ≥ 0.98 (the remaining 90% split ~nothing) is. The honest prior is
  // that most subnets ARE hard for a newcomer; EASY requires measured
  // evidence (≥50% month-1 odds, or a broad reward share on open entry).
  const hardwareHard = tee || bareMetal || gpus >= 4;
  const winnerTakeAll = top10 != null && top10 >= 0.98;
  let difficulty: EntryDifficulty;
  if (hardwareHard || winnerTakeAll || (chance != null && chance.pct < 20)) {
    difficulty = "DIFFICULT";
  } else if (
    (chance != null && chance.pct >= 50 && !hardwareHard) ||
    (ratio != null && ratio >= 0.5 && (free == null || free > 0) && !bareMetal && !tee && gpus <= 1 && (ramp == null || ramp <= 4))
  ) {
    difficulty = "EASY";
  } else {
    difficulty = "MODERATE";
  }

  const oneLine =
    difficulty === "EASY"
      ? "New seats measurably earn here — the easiest tier of the ranking."
      : difficulty === "DIFFICULT"
        ? "Hard entry: concentrated rewards, a full ring, long ramp, or server/TEE hardware."
        : "Competitive but reachable — read the reasons before committing the burn.";

  return {
    id: o.id,
    netuid: o.netuid,
    difficulty,
    easeScore: Math.round(clamp(ease, 0, 100)),
    reasons,
    oneLine,
  };
}

/** One pass over all rows, keyed by row id (same convention as the maps). */
export function computeEntryDifficultyMap(
  rows: LiveOpportunity[]
): Map<string, EntryDifficultyVerdict> {
  const m = new Map<string, EntryDifficultyVerdict>();
  for (const r of rows) {
    if (!r?.id) continue;
    try {
      m.set(r.id, computeEntryDifficulty(r));
    } catch {
      // An unclassifiable row stays unclassified — never breaks the table.
    }
  }
  return m;
}
