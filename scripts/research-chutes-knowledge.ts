/**
 * research-chutes-knowledge.ts — Task: chutes-knowledge-1
 *
 * Question: did our web app know the official Chutes miner-software mechanics?
 *   (a) incentives = total compute time (+ first-inference bounties on code/apps)
 *   (b) incentive calc = 7-DAY SUM of compute → new miner ramp
 *   (c) published optimization targets: GPU capacity, cold-start speed,
 *       uptime, compute utilization, cost efficiency
 *   (d) GPU variety guidance: A10/A5000/T4 → multi-H100
 *
 * Method: run netuid 64 through the EXACT same Miner's Ledger engine the UI
 * uses (mergeOpportunities path in use-network.ts), then print what the
 * engine infers vs. what the official docs say.
 */

const API = process.env.INFRANEX_API ?? "http://localhost:3000/api/network";
const COOKIE = process.env.INFRANEX_COOKIE ?? "";

async function main() {
  const res = await fetch(API, {
    cache: "no-store",
    headers: COOKIE ? { cookie: COOKIE } : {},
  });
  if (!res.ok) {
    console.error(`[x] /api/network -> ${res.status}`);
    process.exit(1);
  }
  const snap = (await res.json()) as {
    taoPriceUsd: number;
    blockNumber: number;
    subnets: Array<Record<string, unknown>>;
  };

  const live = snap.subnets.find((s) => s.netuid === 64) as
    | (Record<string, unknown> & { name?: string })
    | undefined;
  if (!live) {
    console.error("[x] SN64 not present in live snapshot");
    process.exit(1);
  }

  console.log("=== SN64 (Chutes) — raw chain metrics the app ingests ===");
  for (const k of [
    "name",
    "minersCount",
    "validatorsCount",
    "maxUids",
    "rewardedMiners",
    "minerEmissionTaoPerDay",
    "top10IncentiveShare",
    "incentiveMedianShare",
    "burnCostTao",
    "immunityBlocks",
    "movingPrice",
    "alphaPriceChange24h",
    "subnetTao",
    "emissionEnabled",
    "identityGithub",
    "identityDescription",
  ]) {
    console.log(`  ${k.padEnd(24)} = ${JSON.stringify(live[k])}`);
  }

  // --- Run the same engine as the UI (use-network.ts mergeOpportunities) ---
  const { scoreMinersLedger, classifySubnetHardware, totalScore, computeEarnChance } =
    await import("../src/lib/infranex/miner-score");

  const usd = snap.taoPriceUsd || 0;
  const name = (live.name as string) ?? "Subnet 64";
  const hardware = classifySubnetHardware(
    name,
    live.identityDescription as string | null,
    {}
  );
  const liveAgeBlocks =
    live.registeredAt != null && snap.blockNumber > (live.registeredAt as number)
      ? snap.blockNumber - (live.registeredAt as number)
      : null;

  const { components, diag } = scoreMinersLedger({
    live: live as never,
    taoUsd: usd,
    hardware,
    liveAgeBlocks,
  });

  const registered = Math.max((live.minersCount as number) ?? 1, 1);
  const rewardedRatio =
    (live.rewardedMiners as number | null) != null && (live.rewardedMiners as number) > 0
      ? Math.min(1, (live.rewardedMiners as number) / registered)
      : null;
  const maxUids = (live.maxUids as number) ?? 0;
  const freeSlots = maxUids > 0 ? Math.max(0, maxUids - registered) : null;

  const earnChance = computeEarnChance({
    rewardedRatio,
    freeSlots,
    top10IncentiveShare: (live.top10IncentiveShare as number | null) ?? null,
    rampWeeks: diag.rampWeeks,
  });

  console.log("\n=== Miner's Ledger v2 — what the app infers TODAY ===");
  console.log(`  total score            = ${totalScore(components)}`);
  console.log(`  pillars                = ${JSON.stringify(components)}`);
  console.log(`  expected daily (TAO)   = ${diag.expectedDailyTao} (newcomer-adjusted)`);
  console.log(`  per-earning (TAO/day)  = ${diag.perEarningDailyTao}`);
  console.log(`  rampWeeks              = ${diag.rampWeeks} weeks to full bonds`);
  console.log(`  gpu tier (classified)  = ${diag.gpuLabel} / recommended ${diag.recommendedGpu} / min VRAM ${diag.minVramGb}GB`);
  console.log(`  gpu cost (rent)        = $${diag.gpuCostMonthlyUsd}/mo`);
  console.log(`  net monthly            = $${diag.netMonthlyUsd}`);
  console.log(`  earn chance month-1    = ${earnChance.level.toUpperCase()} ~${earnChance.pct}% | ${earnChance.note}`);

  // --- Gap audit: mechanics the engine has NO input for ---------------------
  console.log("\n=== Gap audit vs. official Chutes miner-software docs ===");
  const checks: Array<[string, string]> = [
    ["(a) reward = total compute TIME (not bond EMA only)", "engine models bond-EMA ramp + rewardedRatio — has no 'compute-seconds' input at all"],
    ["(a2) first-inference bounties on code/apps", "no concept of bounties anywhere in miner-score.ts"],
    ["(b) 7-day SUM window for incentive calc", "rampWeeks is a static heuristic: 3 + (1-rewardedRatio)*6 + conc +2 + full 2 — never saw the 7d window"],
    ["(c1) GPU capacity optimization", "only as hardware cost fit — not as an earning lever"],
    ["(c2) cold-start speed", "zero references to cold-start in scoring (chain.ts cold start = OUR app's boot, unrelated)"],
    ["(c3) uptime as earning factor", "assumed 'continuous good uptime' in earnChance prose — never scored"],
    ["(c4) compute utilization", "not modeled"],
    ["(c5) cost efficiency", "partially: cost stack in Net ROI, but not as a reward-side lever"],
    ["(d) GPU variety A10/A5000/T4 → multi-H100", "engine classifies ONE gpu tier per subnet — cannot express 'variety helps'"],
  ];
  for (const [m, verdict] of checks) {
    console.log(`  ${m}\n      -> ${verdict}`);
  }

  console.log("\n=== Why (root cause) ===");
  console.log(`  Engine inputs = chain metrics ONLY (metagraph vecs, emissions, pool, burn, immunity)`);
  console.log(`  + hardware classifier regex on name/description (VRAM/GPU tier)`);
  console.log(`  + GitHub scraper extracts ONLY: min VRAM, recommended GPU model, description`);
  console.log(`  -> reward MECHANICS live in the subnet's miner docs (off-chain), which nothing ingests`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
