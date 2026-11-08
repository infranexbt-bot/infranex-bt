/* Sanity test for the opportunity engine verdict matrix. */
import {
  computeOpportunityVerdict,
  rankOpportunityVerdicts,
} from "../src/lib/infranex/opportunity-engine";
import { computeEntryScore } from "../src/lib/infranex/entry-score";

function mk(over: Partial<Parameters<typeof computeEntryScore>[0]> = {}) {
  return {
    netuid: 1,
    minersCount: 256,
    rewardedMiners: 200,
    top10IncentiveShare: 0.3,
    incentiveMedianShare: 0.9,
    minerEmissionTaoPerDay: 100,
    maxUids: 256,
    immunityBlocks: 4096,
    burnCostTao: 0.3,
    ...over,
  };
}
const scale = { lo: 0.1, hi: 50 };
const show = (label: string, entryScore: number | null, tier: string | null, expect: string) => {
  const sub = mk(
    entryScore == null
      ? { minersCount: null, rewardedMiners: null, top10IncentiveShare: null, incentiveMedianShare: null }
      : {
          // tune breadth/top10 to land near the requested score
          rewardedMiners: Math.round(256 * Math.min(1, entryScore / 100)),
          top10IncentiveShare: entryScore >= 80 ? 0.2 : 0.45,
        },
  );
  const es = computeEntryScore(sub, scale);
  const v = computeOpportunityVerdict(es, tier as never);
  console.log(
    `${label}: entry=${es.score}(${es.grade}) tier=${tier ?? "null"} → opp=${v.score} ${v.verdict} [${v.reasons[0] ?? ""}] ${v.verdict === expect ? "OK" : `EXPECTED ${expect} <<<<`}`,
  );
};

show("A + open field   ", 88, "OPEN_FIELD", "RUN");
show("B + fightable    ", 70, "FIGHTABLE", "RUN");
show("C + open field   ", 55, "OPEN_FIELD", "RUN");
show("C + fightable    ", 55, "FIGHTABLE", "RUN");
show("C + knife fight  ", 55, "KNIFE_FIGHT", "WATCH");
show("A + knife fight  ", 88, "KNIFE_FIGHT", "RUN");
show("A + dont_enter   ", 88, "DONT_ENTER", "AVOID");
show("D + open field   ", 40, "OPEN_FIELD", "AVOID");
show("F + open field   ", 20, "OPEN_FIELD", "AVOID");
show("? + open field   ", null, "OPEN_FIELD", "WATCH");
show("? + no data      ", null, null, "WATCH");

// ranking check: RUN first sorted by score desc, then WATCH, then AVOID
const mkVerdict = (netuid: number, score: number | null, verdict: string, odds: number | null) =>
  computeOpportunityVerdict(
    {
      ...(computeEntryScore(mk({ netuid }), scale)),
      netuid,
      score,
      grade: score != null ? (score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D") : "?",
      newcomerOddsPct: odds,
      reasons: [],
    },
    "OPEN_FIELD",
  );
const ranked = rankOpportunityVerdicts([
  mkVerdict(3, 55, "WATCH", 30),
  mkVerdict(1, 88, "RUN", 60),
  mkVerdict(2, 92, "RUN", 70),
  mkVerdict(4, 20, "AVOID", 5),
  mkVerdict(5, null, "WATCH", null),
]);
console.log(
  "ranked:",
  ranked.map((v) => `SN${v.netuid}:${v.verdict}${v.score ?? "?"}`).join(" > "),
);
