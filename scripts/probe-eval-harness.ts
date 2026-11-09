// Sanity: eval-harness on live SN83 + SN3 vectors
import { getUidState } from "/home/z/my-project/src/lib/infranex/metagraph";
import { replayEval } from "/home/z/my-project/src/lib/infranex/eval-harness";

const TAO = 300; // rough $/TAO for sanity math only
for (const [netuid, pool, realizability, miners, rewarded, top10] of [
  [83, 480, 0.8, 256, 241, 0.25],
  [3, 62.6, 0.9, 256, 7, 1.0],
] as const) {
  const st = await getUidState(netuid);
  if (!st.vectors) { console.log(`SN${netuid}: no vectors`); continue; }
  const r = replayEval(netuid, {
    incentive: st.vectors.incentive,
    poolTaoPerDay: pool,
    rewardRealizability: realizability,
    taoUsd: TAO,
    targetUsdPerMonth: 300,
    minersCount: miners,
    rewardedMiners: rewarded,
    top10IncentiveShare: top10,
  }, { prospect: "top10" });
  console.log(`\nSN${netuid}: earners ${r.curve.earningUids}/${r.curve.registeredUids} tier=${r.curve.seatTier}`);
  console.log(`  prospect top10% → rank #${r.prospect?.predictedRank} inc=${r.prospect?.predictedIncentive.toFixed(4)} $/d=${r.prospect?.usdPerDay?.toFixed(2)} $/mo=${r.prospect?.usdPerMonth?.toFixed(0)} meetsTarget=${r.prospect?.meetsTarget}`);
  console.log(`  bar: ${r.bar?.note.slice(0, 140)}`);
}
process.exit(0);
