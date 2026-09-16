// ---------------------------------------------------------------------------
// Registration odds — answers the newcomer's actual question:
// "if I register TODAY, what are my chances of getting TAO?"
//
// The seat-safety pillar answers "can you get in and keep the seat"; this
// module layers the odds ON TOP of the seat:
//   1. Entry — free slots vs burn-entry (from the live row).
//   2. First-month earn chance — the modeled % from computeEarnChance.
//   3. Bond ramp — weeks until a performing newcomer reaches full weight.
//   4. Winner stability — is the subnet's paid-seat count frozen at the
//      same few UIDs (newcomer odds stay ~nil) or widening (odds improve)?
// Winner stability reads ChainSnapshot history: rewardedMiners per scan is
// a faithful proxy for "how many seats are actually paid" without needing
// per-UID vectors persisted.
// ---------------------------------------------------------------------------

export interface OddsHistorySample {
  /** ISO timestamp of the chain scan. */
  t: string;
  /** Seats that earned ANY reward at that scan (last completed epoch). */
  rewarded: number;
  /** Registered miners at that scan. */
  miners: number;
}

export type WinnerTrendLabel =
  | "thin-history"
  | "frozen"
  | "widening"
  | "shrinking"
  | "recovered";

export interface WinnerTrend {
  label: WinnerTrendLabel;
  rewardedNow: number | null;
  rewardedThen: number | null;
  /** rewardedNow - rewardedThen across the window. */
  delta: number | null;
  /** How many distinct paid-seat counts appear in the window. */
  distinctRewarded: number;
  samples: number;
  /** Hours covered by the samples. */
  spanHours: number | null;
}

const THIN_MIN_SAMPLES = 3;
const THIN_MIN_SPAN_HOURS = 0.5;

export function describeWinnerTrend(samples: OddsHistorySample[]): WinnerTrend {
  const clean = samples.filter((s) => Number.isFinite(s.rewarded));
  if (clean.length === 0) {
    return {
      label: "thin-history",
      rewardedNow: null,
      rewardedThen: null,
      delta: null,
      distinctRewarded: 0,
      samples: 0,
      spanHours: null,
    };
  }
  const chronological = [...clean].sort((a, b) => a.t.localeCompare(b.t));
  const then = chronological[0];
  const now = chronological[chronological.length - 1];
  const spanHours =
    (new Date(now.t).getTime() - new Date(then.t).getTime()) / 3_600_000;
  const distinct = new Set(chronological.map((s) => s.rewarded)).size;
  const delta = now.rewarded - then.rewarded;

  let label: WinnerTrendLabel;
  if (chronological.length < THIN_MIN_SAMPLES || spanHours < THIN_MIN_SPAN_HOURS) {
    label = "thin-history";
  } else if (distinct === 1) {
    label = "frozen";
  } else if (delta > 0) {
    label = "widening";
  } else if (delta < 0) {
    label = "shrinking";
  } else {
    // delta === 0 but the count blipped mid-window before returning.
    label = "recovered";
  }

  return {
    label,
    rewardedNow: now.rewarded,
    rewardedThen: then.rewarded,
    delta,
    distinctRewarded: distinct,
    samples: chronological.length,
    spanHours: Math.round(spanHours * 10) / 10,
  };
}

/** One-line, plain-language read of the winner-stability trend. */
export function winnerTrendSentence(trend: WinnerTrend): string {
  const span =
    trend.spanHours != null
      ? trend.spanHours >= 1
        ? `~${trend.spanHours.toFixed(1)}h`
        : `~${Math.round(trend.spanHours * 60)}min`
      : null;
  const window = span ? ` over ${span}` : "";
  switch (trend.label) {
    case "frozen":
      return `Paid seats frozen at ${trend.rewardedNow} across ${trend.samples} scans${window} — the same winners likely keep everything until that changes.`;
    case "widening":
      return `Paid seats widening: ${trend.rewardedThen} → ${trend.rewardedNow} across ${trend.samples} scans${window} — odds improving for newcomers.`;
    case "shrinking":
      return `Paid seats shrinking: ${trend.rewardedThen} → ${trend.rewardedNow} across ${trend.samples} scans${window} — rewards are concentrating further.`;
    case "recovered":
      return `Paid seats blipped mid-window but returned to ${trend.rewardedNow} (${trend.distinctRewarded} distinct counts${window}).`;
    case "thin-history":
      return trend.samples > 0
        ? `Only ${trend.samples} scan${trend.samples === 1 ? "" : "s"} of history — the winner-stability trend needs more time to mean anything.`
        : "No scan history yet — the winner-stability trend appears as snapshots accumulate.";
  }
}

/** Tailwind classes for the trend chip — bad for a newcomer = red. */
export function winnerTrendChipClass(label: WinnerTrendLabel): string {
  switch (label) {
    case "widening":
      return "text-success";
    case "frozen":
    case "shrinking":
      return "text-destructive";
    case "recovered":
      return "text-warning";
    default:
      return "text-muted-foreground";
  }
}

/** Short chip label for the trend. */
export function winnerTrendChipLabel(trend: WinnerTrend): string {
  switch (trend.label) {
    case "frozen":
      return `Winners frozen · ${trend.rewardedNow} seats`;
    case "widening":
      return `Winners widening · ${trend.rewardedThen}→${trend.rewardedNow}`;
    case "shrinking":
      return `Winners shrinking · ${trend.rewardedThen}→${trend.rewardedNow}`;
    case "recovered":
      return `Winners stable @${trend.rewardedNow}`;
    default:
      return "Trend: thin history";
  }
}

/** Extra-compact label for per-row chips (tables/cards) — the full
 *  "Winners …" phrasing lives in winnerTrendChipLabel; here the tooltip
 *  carries the sentence, so the chip itself stays tight. */
export function winnerTrendShortLabel(trend: WinnerTrend): string {
  switch (trend.label) {
    case "frozen":
      return `frozen @${trend.rewardedNow}`;
    case "widening":
      return `widening ${trend.rewardedThen}→${trend.rewardedNow}`;
    case "shrinking":
      return `shrinking ${trend.rewardedThen}→${trend.rewardedNow}`;
    case "recovered":
      return `stable @${trend.rewardedNow}`;
    default:
      return "thin history";
  }
}
