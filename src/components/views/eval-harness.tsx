"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  FlaskConical,
  Gauge,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEvalReplay } from "@/hooks/use-eval-replay";
import { useRankSimulator } from "@/hooks/use-rank-simulator";
import { PROSPECT_PERCENTILES } from "@/lib/infranex/eval-harness";

// ---------------------------------------------------------------------------
// EVAL HARNESS — score replay: "where would MY model rank this epoch, and
// what would it earn?" We replay the chain's live per-UID incentive vector —
// measured, not modeled: every dollar shown is what the UID at that rank
// actually earns. Prospect mode = place yourself at a percentile; MY-UID
// mode = paste your hotkey for live rank + gap telemetry.
// ---------------------------------------------------------------------------

function usd(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function pct(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function Stat({
  label,
  value,
  tip,
}: {
  label: string;
  value: string;
  tip?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2" title={tip}>
      <p className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mono mt-0.5 text-[13px] font-bold tabular text-foreground">{value}</p>
    </div>
  );
}

export function EvalHarness() {
  const rankSim = useRankSimulator();
  const subnets = rankSim.data?.ranked ?? [];
  const [netuid, setNetuid] = useState<number | null>(null);
  const [percentile, setPercentile] = useState<string>("top10");
  const [hotkeyInput, setHotkeyInput] = useState("");
  const [hotkey, setHotkey] = useState<string | null>(null);

  // Default subnet: the best-ranked runnable one (first row of the rank sim).
  const effectiveNetuid = netuid ?? subnets[0]?.netuid ?? null;

  const { data, error, isFetching, refetch } = useEvalReplay({
    netuid: effectiveNetuid,
    percentile: hotkey ? null : percentile,
    hotkey,
  });

  const maxShare = useMemo(() => {
    const tops = data?.curve.topEarners ?? [];
    return tops.length > 0 ? Math.max(...tops.map((t) => t.incentive), 1e-9) : 1;
  }, [data]);

  const activePercentile = PROSPECT_PERCENTILES.find((p) => p.key === percentile);

  return (
    <section className="rounded-xl border border-border/70 bg-card/60 p-5">
      {/* --- Header --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
          <FlaskConical className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-display text-base font-bold tracking-tight">
            Eval harness — would YOUR model earn this epoch?
          </h3>
          <p className="mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            score replay · live per-UID incentive vector · block {data?.meta?.vectorBlock ?? "…"} · measured, not
            modeled
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            className="mono h-8 rounded-md border border-border/70 bg-background/60 px-2 text-[11px] text-foreground"
            value={effectiveNetuid ?? ""}
            onChange={(e) => setNetuid(Number(e.target.value))}
            title="Subnet to replay"
          >
            {subnets.map((s) => (
              <option key={s.netuid} value={s.netuid}>
                SN{s.netuid} · {s.name}
              </option>
            ))}
          </select>
          <select
            className="mono h-8 rounded-md border border-border/70 bg-background/60 px-2 text-[11px] text-foreground"
            value={percentile}
            onChange={(e) => setPercentile(e.target.value)}
            title="Where you honestly believe you would land among this cohort"
          >
            {PROSPECT_PERCENTILES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          {isFetching && (
            <span className="mono inline-flex items-center gap-1.5 rounded-md border border-success/50 bg-success/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-success">
              <Gauge className="h-3 w-3 animate-pulse" aria-hidden="true" />
              chain read
            </span>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            className="mono h-8 rounded-md border border-border/70 bg-background/40 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            title="Re-read the chain vectors now"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="mono mt-3 text-[11px] text-destructive">
          replay unavailable — {error instanceof Error ? error.message : "unknown error"} · hit Refresh to retry the
          chain read
        </p>
      )}

      {/* --- Observed curve stats -------------------------------------------- */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Registered"
          value={data ? String(data.curve.registeredUids) : "—"}
          tip="UIDs on this subnet's metagraph right now (chain read)."
        />
        <Stat
          label="Earning"
          value={data ? String(data.curve.earningUids) : "—"}
          tip="UIDs with incentive > 0 this epoch — the paid cohort."
        />
        <Stat
          label="Rewarded"
          value={data ? pct(data.curve.rewardedRatio) : "—"}
          tip="Share of seats that earned — the spread of the game."
        />
        <Stat
          label="Top-10% take"
          value={data ? pct(data.curve.top10IncentiveShare) : "—"}
          tip="Incentive share swallowed by the top-10% of UIDs — whale concentration."
        />
        <Stat
          label="Earner floor"
          value={data ? pct(data.curve.earnerFloorIncentive, 2) : "—"}
          tip="Incentive of the LAST earning seat — the minimum score that still gets paid."
        />
        <Stat
          label="Top-decile mean"
          value={data ? pct(data.curve.topDecileMeanIncentive, 2) : "—"}
          tip="Mean incentive across the top-10% cohort — the goal line."
        />
      </div>

      {/* --- Top earners bars -------------------------------------------------- */}
      {data && data.curve.topEarners.length > 0 && (
        <div className="mt-4 rounded-lg border border-border/70 bg-background/40 p-3">
          <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Top earners this epoch (UID · incentive share)
          </p>
          <div className="mt-2 space-y-1">
            {data.curve.topEarners.map((t) => (
              <div key={t.uid} className="flex items-center gap-2">
                <span className="mono w-16 shrink-0 text-right text-[10.5px] text-muted-foreground">
                  #{t.rank} · UID {t.uid}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted/40">
                  <div
                    className="h-full rounded-sm bg-primary/60"
                    style={{ width: `${Math.max(2, (t.incentive / maxShare) * 100)}%` }}
                  />
                </div>
                <span className="mono w-14 shrink-0 text-[10.5px] tabular text-foreground">
                  {pct(t.incentive, 2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- THE BAR ----------------------------------------------------------- */}
      {data?.bar && (
        <div
          className={cn(
            "mt-4 rounded-lg border p-3",
            data.bar.impossibleForEveryone
              ? "border-destructive/50 bg-destructive/10"
              : "border-warning/40 bg-warning/10",
          )}
        >
          <p className="mono flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground">
            {data.bar.impossibleForEveryone ? (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
            ) : (
              <Crosshair className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            )}
            The bar — what your score must beat
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">{data.bar.note}</p>
          {data.bar.rankNeeded != null && (
            <p className="mono mt-1 text-[11px] text-muted-foreground">
              target {usd(data.money.targetUsdPerMonth)}/mo → {data.bar.targetTaoPerDay?.toFixed(3)} τ/d →
              incentive ≥ {pct(data.bar.incentiveNeeded, 2)} of the realized pool = rank #{data.bar.rankNeeded} on
              today&apos;s curve
            </p>
          )}
        </div>
      )}

      {/* --- Prospect + MY-UID cards ------------------------------------------- */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {/* Prospect */}
        <div className="rounded-lg border border-border/70 bg-background/40 p-3">
          <p className="mono flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            Prospect replay · {data?.prospect?.label ?? activePercentile?.label}
          </p>
          {data?.prospect ? (
            <>
              <p className="mono mt-2 text-[26px] font-bold leading-none tabular text-foreground">
                {usd(data.prospect.usdPerMonth, 0)}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">/mo at this placement</span>
              </p>
              <p className="mono mt-2 text-[11px] text-muted-foreground">
                rank #{data.prospect.predictedRank} of {data.curve.registeredUids} · incentive{" "}
                {pct(data.prospect.predictedIncentive, 2)} · {data.prospect.tauPerDay?.toFixed(4) ?? "—"} τ/d
              </p>
              <p className="mt-1.5">
                {data.prospect.meetsTarget == null ? (
                  <span className="mono text-[10.5px] text-muted-foreground">
                    target check unavailable (pool or price missing)
                  </span>
                ) : data.prospect.meetsTarget ? (
                  <span className="mono inline-flex items-center gap-1 rounded-md border border-success/50 bg-success/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-success">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> clears your target
                  </span>
                ) : (
                  <span className="mono inline-flex items-center gap-1 rounded-md border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-warning">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" /> below target — climb the curve
                  </span>
                )}
              </p>
            </>
          ) : (
            <p className="mono mt-2 text-[11px] text-muted-foreground">
              {hotkey ? "hotkey mode — prospect card hidden" : "loading replay…"}
            </p>
          )}
        </div>

        {/* MY-UID */}
        <div className="rounded-lg border border-border/70 bg-background/40 p-3">
          <p className="mono flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            My UID — live telemetry
          </p>
          {hotkey ? (
            data?.myUid ? (
              data.myUid.registered ? (
                <>
                  <p className="mono mt-2 text-[26px] font-bold leading-none tabular text-foreground">
                    {usd(data.myUid.usdPerMonth, 0)}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      /mo now · rank #{data.myUid.rank}
                    </span>
                  </p>
                  <p className="mono mt-2 text-[11px] text-muted-foreground">
                    UID {data.myUid.uid} · incentive {pct(data.myUid.incentive, 3)}
                    {data.myUid.stalenessBlocks != null
                      ? ` · last update ${data.myUid.stalenessBlocks.toLocaleString()} blocks ago`
                      : ""}
                  </p>
                  {data.myUid.gapToEarnerFloor && (
                    <p className="mono mt-1.5 text-[11px] text-warning">
                      {data.myUid.gapToEarnerFloor.timesYouNeed != null
                        ? `${data.myUid.gapToEarnerFloor.timesYouNeed.toFixed(1)}× more score needed to reach the last paid seat (rank #${data.myUid.gapToEarnerFloor.floorRank})`
                        : "no incentive weight yet — you need to ENTER the paid cohort, not multiply your score"}
                    </p>
                  )}
                  {data.myUid.seatAbove && (
                    <p className="mono mt-1 text-[11px] text-muted-foreground">
                      next overtake: seat #{data.myUid.seatAbove.rank} (UID {data.myUid.seatAbove.uid},{" "}
                      {pct(data.myUid.seatAbove.incentive, 3)})
                    </p>
                  )}
                </>
              ) : (
                <p className="mono mt-2 text-[11px] text-warning">
                  hotkey not registered on SN{data.netuid} — register (burn ≈ pool entry) or pick the subnet you
                  actually mine.
                </p>
              )
            ) : (
              <p className="mono mt-2 text-[11px] text-muted-foreground">reading your UID off the chain…</p>
            )
          ) : (
            <>
              <div className="mt-2 flex gap-2">
                <input
                  className="mono h-8 flex-1 rounded-md border border-border/70 bg-background/60 px-2 text-[10.5px] text-foreground placeholder:text-muted-foreground/60"
                  placeholder="paste miner hotkey (ss58) — optional"
                  value={hotkeyInput}
                  onChange={(e) => setHotkeyInput(e.target.value)}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="mono h-8 shrink-0 rounded-md border border-primary/50 bg-primary/10 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-primary hover:bg-primary/20"
                  onClick={() => setHotkey(hotkeyInput.trim() || null)}
                >
                  Track
                </button>
              </div>
              <p className="mono mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                registered miner? paste your hotkey for live rank, staleness and the exact gap to the last paid
                seat. Until then the prospect card is your honest estimate.
              </p>
            </>
          )}
        </div>
      </div>

      {/* --- Footnote ------------------------------------------------------------ */}
      <div className="editorial-rule my-4" />
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground/90">This is a replay, not a simulation.</span> No one —
        including the platform — can run a subnet&apos;s validator scoring locally; the validator&apos;s model is
        private. What the chain publishes every epoch is the incentive vector it actually paid, and that vector is
        the ground truth replayed here: place yourself at a percentile and you see exactly what the UID at that
        rank earns today. The honest workflow: pick a percentile you can defend, rent the rig, run the miner, then
        paste your hotkey — the prospect card turns into live telemetry and every epoch either confirms or corrects
        your self-placement.
      </p>
    </section>
  );
}
