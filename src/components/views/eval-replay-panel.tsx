"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Loader2, RefreshCw, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEvalReplay } from "@/hooks/use-eval-replay";
import { useRankSimulator } from "@/hooks/use-rank-simulator";
import { PROSPECT_PERCENTILES } from "@/lib/infranex/eval-harness";

// ---------------------------------------------------------------------------
// EVAL REPLAY — "where would MY model rank this epoch, and what would it
// earn?" Replays the LIVE per-UID incentive vector (the validator's score
// output, chain-measured): place yourself at a performance percentile and
// see exactly what the UID sitting at that rank earns today — or enter your
// hotkey and see your own standing and the gap to the last paid seat.
// ---------------------------------------------------------------------------

function usd(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function incPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

export function EvalReplayPanel() {
  const rank = useRankSimulator(null);
  const [netuid, setNetuid] = useState<number | null>(null);
  const [percentile, setPercentile] = useState<string>("top10");
  const [hotkeyInput, setHotkeyInput] = useState("");
  const [hotkey, setHotkey] = useState<string | null>(null);

  // Default subnet: the top EV pick for the rig from the rank simulator.
  useEffect(() => {
    if (netuid == null && rank.data?.ranked?.length) {
      setNetuid(rank.data.ranked[0].netuid);
    }
  }, [rank.data, netuid]);

  const replay = useEvalReplay({
    netuid,
    percentile: hotkey ? null : percentile,
    hotkey,
  });

  const d = replay.data;
  const subnets = rank.data?.ranked ?? [];
  const selected = subnets.find((s) => s.netuid === netuid);

  return (
    <section className="rounded-xl border border-border/70 bg-card/60 p-5">
      {/* --- Header --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400">
          <FlaskConical className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-display text-base font-bold tracking-tight">Eval replay — where would YOUR model rank?</h3>
          <p className="mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            live per-UID incentive vector · chain-measured, replay not guesswork
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            className="mono h-8 rounded-md border border-border/70 bg-background/60 px-2 text-[11px] text-foreground"
            value={netuid ?? ""}
            onChange={(e) => setNetuid(e.target.value ? Number(e.target.value) : null)}
            title="Subnet to replay — runnable picks from the rank simulator"
          >
            {subnets.map((s) => (
              <option key={s.netuid} value={s.netuid}>
                SN{s.netuid} {s.name}
              </option>
            ))}
          </select>
          {replay.isFetching && (
            <span className="mono inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              chain
            </span>
          )}
        </div>
      </div>

      {/* --- Controls --------------------------------------------------------- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Performance percentile">
          {PROSPECT_PERCENTILES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setPercentile(p.key);
                setHotkey(null);
              }}
              className={cn(
                "mono rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors",
                !hotkey && percentile === p.key
                  ? "border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-300"
                  : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground"
              )}
              title={`If your model performs at this percentile of the current cohort, this is the seat you get`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={hotkeyInput}
            onChange={(e) => setHotkeyInput(e.target.value)}
            placeholder="…or paste your hotkey (SS58)"
            className="mono h-8 w-[300px] rounded-md border border-border/70 bg-background/60 px-2 text-[11px] text-foreground placeholder:text-muted-foreground/60"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setHotkey(hotkeyInput.trim() || null)}
            disabled={hotkeyInput.trim().length < 10}
            className="mono h-8 rounded-md border border-fuchsia-500/60 bg-fuchsia-500/15 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-fuchsia-300 disabled:opacity-40"
            title="Replay the epoch from THIS hotkey's live UID standing"
          >
            My UID
          </button>
          {hotkey && (
            <button
              type="button"
              onClick={() => {
                setHotkey(null);
                setHotkeyInput("");
              }}
              className="mono h-8 rounded-md border border-border/70 bg-background/40 px-2 text-[10px] text-muted-foreground"
              title="Back to percentile mode"
            >
              clear
            </button>
          )}
          <button
            type="button"
            onClick={() => replay.refetch()}
            className="mono inline-flex h-8 items-center gap-1 rounded-md border border-border/70 bg-background/40 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            title="Re-read the chain vectors"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* --- Error --------------------------------------------------------- */}
      {replay.isError && (
        <p className="mono mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {replay.error instanceof Error ? replay.error.message : "replay failed"} — the chain read retries on
          refetch (button above).
        </p>
      )}

      {/* --- Result --------------------------------------------------------- */}
      {d && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            {/* Curve headline */}
            <p className="mono text-[11px] text-muted-foreground" title={`Live vector at block ${d.meta?.vectorBlock ?? "?"}`}>
              <span className="font-bold text-foreground">SN{d.netuid}</span>
              {selected ? ` ${selected.name}` : ""}
              {" · "}
              {d.curve.earningUids}/{d.curve.registeredUids} UIDs earned last epoch
              {" · "}paid-cohort floor {incPct(d.curve.earnerFloorIncentive)}
              {" · "}median earner {incPct(d.curve.medianEarnerIncentive)}
              {d.money.realizedPoolTaoPerDay != null
                ? ` · realized pool ${d.money.realizedPoolTaoPerDay.toFixed(1)} τ/d`
                : ""}
            </p>

            {/* Prospect result */}
            {d.prospect && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <p className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">your seat</p>
                  <p className="mono mt-1 text-lg font-bold tabular text-foreground">#{d.prospect.predictedRank}</p>
                  <p className="mono text-[10px] text-muted-foreground">
                    of {d.curve.registeredUids} · {d.prospect.label} placement
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <p className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">score to match</p>
                  <p className="mono mt-1 text-lg font-bold tabular text-foreground">{incPct(d.prospect.predictedIncentive)}</p>
                  <p className="mono text-[10px] text-muted-foreground">of validator weight</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <p className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">income at that seat</p>
                  <p className={cn("mono mt-1 text-lg font-bold tabular", d.prospect.meetsTarget ? "text-success" : "text-destructive")}>
                    {usd(d.prospect.usdPerMonth)}
                    <span className="text-[10px] font-medium text-muted-foreground">/mo</span>
                  </p>
                  <p className="mono text-[10px] text-muted-foreground">{usd(d.prospect.usdPerDay, 2)}/day</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <p className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">vs $300/mo target</p>
                  <p
                    className={cn(
                      "mono mt-1 text-[12px] font-bold uppercase tracking-[0.06em]",
                      d.prospect.meetsTarget == null ? "text-muted-foreground" : d.prospect.meetsTarget ? "text-success" : "text-destructive"
                    )}
                  >
                    {d.prospect.meetsTarget == null ? "—" : d.prospect.meetsTarget ? "clears it" : "misses it"}
                  </p>
                  <p className="mono text-[10px] text-muted-foreground">target {usd(d.money.targetUsdPerMonth)}/mo</p>
                </div>
              </div>
            )}

            {/* MY-UID result */}
            {d.myUid && (
              <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-4">
                {!d.myUid.registered ? (
                  <p className="mono text-[12px] text-warning">
                    hotkey not registered on SN{d.netuid} — register first, then replay to see your live standing.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <p className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">your UID / rank</p>
                        <p className="mono mt-1 text-lg font-bold tabular text-foreground">
                          #{d.myUid.uid} · rank {d.myUid.rank}
                        </p>
                      </div>
                      <div>
                        <p className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">your weight</p>
                        <p className="mono mt-1 text-lg font-bold tabular text-foreground">{incPct(d.myUid.incentive)}</p>
                      </div>
                      <div>
                        <p className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">your income</p>
                        <p className={cn("mono mt-1 text-lg font-bold tabular", d.myUid.meetsTarget ? "text-success" : "text-destructive")}>
                          {usd(d.myUid.usdPerMonth)}
                          <span className="text-[10px] font-medium text-muted-foreground">/mo</span>
                        </p>
                      </div>
                      <div>
                        <p className="mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">seat above you</p>
                        <p className="mono mt-1 text-[12px] font-bold tabular text-foreground">
                          {d.myUid.seatAbove ? `UID #${d.myUid.seatAbove.uid}` : "you lead"}
                        </p>
                        {d.myUid.seatAbove && (
                          <p className="mono text-[10px] text-muted-foreground">
                            holds {incPct(d.myUid.seatAbove.incentive)} — out-score it to overtake
                          </p>
                        )}
                      </div>
                    </div>
                    {d.myUid.gapToEarnerFloor && (
                      <p className="mono mt-3 text-[11px] text-warning" data-testid="uid-gap">
                        {d.myUid.gapToEarnerFloor.timesYouNeed != null
                          ? `you earn ${d.myUid.gapToEarnerFloor.timesYouNeed.toFixed(1)}× less than the LAST paid seat (rank #${d.myUid.gapToEarnerFloor.floorRank}, holds ${incPct(d.myUid.gapToEarnerFloor.floorIncentive)}) — you are on the board but out-scored.`
                          : `the last paid seat (rank #${d.myUid.gapToEarnerFloor.floorRank}) holds ${incPct(d.myUid.gapToEarnerFloor.floorIncentive)} — you hold zero; enter the paid cohort.`}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* THE BAR */}
            {d.bar && (
              <div
                className={cn(
                  "mt-3 flex items-start gap-2 rounded-lg border p-3",
                  d.bar.impossibleForEveryone
                    ? "border-destructive/50 bg-destructive/10"
                    : "border-success/40 bg-success/10"
                )}
              >
                <Target className={cn("mt-0.5 h-4 w-4 shrink-0", d.bar.impossibleForEveryone ? "text-destructive" : "text-success")} aria-hidden="true" />
                <p className="text-[11.5px] leading-relaxed text-foreground/90" data-testid="target-bar">{d.bar.note}</p>
              </div>
            )}

            {/* Top earners */}
            <div className="mt-3">
              <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                live reward vector — top earners (validator weight share)
              </p>
              <div className="mt-2 space-y-1">
                {d.curve.topEarners.map((r) => {
                  const max = d.curve.topEarners[0]?.incentive || 1;
                  return (
                    <div key={r.uid} className="flex items-center gap-2">
                      <span className="mono w-16 shrink-0 text-[10px] tabular text-muted-foreground">#{r.rank} UID{r.uid}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="h-full rounded-full bg-fuchsia-500/60"
                          style={{ width: `${Math.max(2, (r.incentive / max) * 100)}%` }}
                        />
                      </div>
                      <span className="mono w-14 shrink-0 text-right text-[10px] tabular text-muted-foreground">{incPct(r.incentive)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar explainer */}
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <p className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/80">What this is</p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              The validator publishes its scoring as the per-UID <span className="text-foreground">incentive vector</span> every
              epoch — the chain-measured ground truth of who got paid how much. This panel replays that vector:
              pick a percentile and you get the exact seat and income of the UID currently at that rank; paste a hotkey
              and you get your own live standing.
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              What it cannot do is grade YOUR model — nobody but the validator&apos;s own scorer can. The honest loop:
              place your model&apos;s self-measured quality at a percentile, deploy, then watch this panel (MY-UID) converge
              to that placement over a few epochs. Divergence = your self-assessment was wrong, and the vector says by how much.
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {!d && replay.isFetching && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="mono block h-16 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      )}
    </section>
  );
}
