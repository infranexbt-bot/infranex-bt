#!/usr/bin/env python3
"""MERGE-TAO-ENGINE v2 — idempotent repair + finish of tao-engine-view.tsx.

State after partial edits: duplicated imports, RecommendResponse already has
topValidators, MarketRouteCard function already deleted, root still renders
<MarketRouteCard />, local MarketResponse/ACTION_STYLE still present.

Steps (all idempotent):
  1. dedupe the import block
  2. ensure RecommendResponse.topValidators (skip if present)
  3. replace local MarketResponse + ACTION_STYLE with new components
     (VERDICT_STYLE/GRADE_STYLE/ScoreBadge/TopValidatorsCard/MarketSection)
  4. root: <MarketRouteCard /> → <TopValidatorsCard/> + <MarketSection/>
"""
import re, sys

P = "/home/z/my-project/src/components/views/tao-engine-view.tsx"
src = open(P, encoding="utf-8").read()

# 1 — dedupe imports: collapse repeated validator-score / buy-hold-track lines.
seen_vs = seen_bh = False
out_lines = []
for line in src.split("\n"):
    if 'import type { ScoredValidatorRow }' in line:
        if seen_vs:
            continue
        seen_vs = True
    if 'import { BuyHoldTrack, type MarketResponse }' in line:
        if seen_bh:
            continue
        seen_bh = True
    out_lines.append(line)
src = "\n".join(out_lines)
if not (seen_vs and seen_bh):
    print("FAIL: expected import lines missing")
    sys.exit(1)

# 2 — ensure topValidators field
if "topValidators: ScoredValidatorRow[];" not in src:
    old = ("  beatingRoot: SubnetStakeOpportunity[];\n  belowRoot: SubnetStakeOpportunity[];\n"
           "  plan: ThreeRoutePlan;")
    if old not in src:
        print("FAIL: RecommendResponse anchor not found")
        sys.exit(1)
    src = src.replace(old,
        "  beatingRoot: SubnetStakeOpportunity[];\n  belowRoot: SubnetStakeOpportunity[];\n"
        "  /** FLAT scored cross-subnet validator ranking \u2014 the headline list. */\n"
        "  topValidators: ScoredValidatorRow[];\n  plan: ThreeRoutePlan;", 1)

# 3 — replace local MarketResponse + ACTION_STYLE block with new components
m = re.search(r"interface MarketResponse \{.*?\n\}\n\nconst ACTION_STYLE:.*?\n\};\n", src, re.DOTALL)
if m:
    NEW_COMPONENTS = '''const VERDICT_STYLE: Record<string, string> = {
  STRONG: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  VIABLE: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  SPECULATIVE: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  AVOID: "bg-red-500/10 text-red-600 border-red-500/30",
};
const GRADE_STYLE: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40",
  B: "bg-lime-500/15 text-lime-700 border-lime-500/40",
  C: "bg-amber-500/15 text-amber-600 border-amber-500/40",
  D: "bg-red-500/15 text-red-600 border-red-500/40",
};
const scoreBarCls = (grade: string) =>
  grade === "A" ? "bg-emerald-500" : grade === "B" ? "bg-lime-500" : grade === "C" ? "bg-amber-500" : "bg-red-500";

function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", scoreBarCls(grade))} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold tabular", GRADE_STYLE[grade] ?? GRADE_STYLE.D)}>
        {score.toFixed(0)}
      </span>
      <span className="text-[10px] font-semibold text-muted-foreground">{grade}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BEST VALIDATORS TO STAKE — the flat scored ranking (opportunity-engine
// pattern): verdict tier \u2192 Validator Stake Score \u2192 sustainable APY. This is
// the headline answer to "which validators should I stake for good returns?"
// ---------------------------------------------------------------------------
function TopValidatorsCard({ data }: { data: RecommendResponse }) {
  const rows = data.topValidators.filter((r) => r.verdict !== "AVOID").slice(0, 8);
  const avoidCount = data.topValidators.filter((r) => r.verdict === "AVOID").length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Best validators to stake \u2014 scored 0\u2013100
        </CardTitle>
        <CardDescription>
          Validator Stake Score = yield edge vs root (30%) \u00b7 reward quality (20%) \u00b7 exit liquidity (15%) \u00b7
          take (10%) \u00b7 decentralization (10%) \u00b7 price stability (10%) \u00b7 dilution (5%). Missing data scores a
          neutral 35 and is flagged; verdict AVOID caps the score at 25. Same auditable inputs as the APY math.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nothing scores above AVOID right now \u2014 root staking is the honest pick.
          </div>
        )}
        {rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Subnet \u00b7 Validator</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead className="text-right">Take</TableHead>
                <TableHead className="text-right">Sustainable APY (band)</TableHead>
                <TableHead className="text-right">TAO/mo</TableHead>
                <TableHead className="text-right">Exit slip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.netuid}-${r.validatorUid}`}>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">\u03b1{r.netuid} \u00b7 {r.subnetName}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      uid{r.validatorUid} \u00b7 {r.validatorHotkey.slice(0, 10)}\u2026 \u00b7 lane {r.captureSharePct.toFixed(1)}%
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><ScoreBadge score={r.score.score} grade={r.score.grade} /></TableCell>
                  <TableCell>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", VERDICT_STYLE[r.verdict])}>
                      {r.verdict}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular">{pct(r.takePct, 1)}</TableCell>
                  <TableCell className="text-right">
                    <div className="font-semibold tabular">{pct(r.sustainableApyPct)}</div>
                    <div className="text-[11px] text-muted-foreground tabular">
                      {pct(r.apyLowPct, 1)} \u2026 {pct(r.apyHighPct, 1)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular">{r.taoPerMonth.toFixed(3)}</TableCell>
                  <TableCell className="text-right tabular">{r.exitSlippagePct != null ? pct(r.exitSlippagePct, 2) : "\u2014"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {avoidCount > 0 && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {avoidCount} researched pick{avoidCount === 1 ? "" : "s"} scored AVOID (root-losing or \u03b1 crashing) and
            {avoidCount === 1 ? " is" : " are"} hidden from this list \u2014 score capped at 25 there.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// MARKET SECTION \u2014 Track 2 (BUY/HOLD: signal, entries, DCA ladder, sizing).
// Shared card extracted from the Investor Playbook (merged into this view).
// ---------------------------------------------------------------------------
function MarketSection() {
  const { data, isLoading, isError, error } = useQuery<MarketResponse>({
    queryKey: ["tao-engine-market"],
    queryFn: async () => {
      const res = await fetch("/api/tao-engine/market");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<MarketResponse>;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  return (
    <div>
      {isLoading && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">Reading the tape\u2026</CardContent>
        </Card>
      )}
      {isError && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-red-500">
            Market signal unavailable: {error instanceof Error ? error.message : "unknown"}
          </CardContent>
        </Card>
      )}
      {data && <BuyHoldTrack market={data} />}
    </div>
  );
}
'''
    src = src[:m.start()] + NEW_COMPONENTS + src[m.end():]
elif "function TopValidatorsCard" not in src:
    print("FAIL: MarketResponse block gone but components missing")
    sys.exit(1)

# 4 — root render swap (idempotent)
old_root = "      {/* Market route \u2014 buy / hold / sell */}\n      <MarketRouteCard />"
new_root = ("      {/* Best validators \u2014 scored headline */}\n      {data && <TopValidatorsCard data={data} />}\n\n"
            "      {/* Market route \u2014 buy / hold / sell (Track 2, merged playbook) */}\n      <MarketSection />")
if old_root in src:
    src = src.replace(old_root, new_root, 1)
elif "TopValidatorsCard data={data}" in src:
    pass  # already swapped
else:
    print("FAIL: MarketRouteCard usage anchor not found")
    sys.exit(1)

if "MarketRouteCard" in src:
    print("FAIL: stale MarketRouteCard references remain")
    sys.exit(1)

open(P, "w", encoding="utf-8").write(src)
print("PATCH OK")
