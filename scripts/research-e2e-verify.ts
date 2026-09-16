/**
 * END-TO-END verification: replicate the EXACT client-side Opportunities
 * engine path (use-network.ts mergeOpportunities) for the key subnets —
 * /api/network snapshot + /api/subnet-overrides → classifySubnetHardware
 * (with scraped ground truth) → scoreMinersLedger → diag.
 * Run: bun scripts/research-e2e-verify.ts
 */

import { scoreMinersLedger, classifySubnetHardware, totalScore, computeEarnChance } from "../src/lib/infranex/miner-score";
import type { HostingRequirements } from "../src/lib/infranex/github-scraper";

const COOKIE = process.env.INFRANEX_COOKIE ?? "";

async function getJson(url: string) {
  const res = await fetch(url, { headers: COOKIE ? { cookie: COOKIE } : {}, cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const snap = await getJson("http://localhost:3000/api/network");
const overridesRaw = await getJson("http://localhost:3000/api/subnet-overrides");
const overridesList = (Array.isArray(overridesRaw) ? overridesRaw : (overridesRaw as { overrides?: unknown[] }).overrides ?? []) as Array<Record<string, unknown>>;
const overrides = new Map<number, Record<string, unknown>>();
for (const o of overridesList) {
  // mirror use-subnet-overrides.ts: parse hostingRequirements JSON → hosting
  const row = { ...o };
  if (row.hostingRequirements && typeof row.hostingRequirements === "string") {
    try {
      row.hosting = JSON.parse(row.hostingRequirements as string);
    } catch {
      row.hosting = null;
    }
  }
  overrides.set(o.netuid as number, row);
}
const usd = snap.taoPriceUsd as number;

for (const netuid of [64, 4, 28, 51, 58, 90, 33, 71]) {
  const live = (snap.subnets as Array<Record<string, unknown>>).find((s) => s.netuid === netuid);
  if (!live) continue;
  const ovr = overrides.get(netuid);
  const scraped =
    ovr && (ovr.recommendedGpu || ovr.hosting)
      ? {
          recommendedGpu: (ovr.recommendedGpu as string | null) ?? null,
          gpuCount: (ovr.gpuCount as number | null) ?? null,
          minVramGb: (ovr.minVramGb as number | null) ?? null,
          hosting: (ovr.hosting as HostingRequirements | null) ?? null,
          requirementsSource: (ovr.requirementsSource as string | null) ?? null,
        }
      : null;
  const name = (live.name as string) || `SN${netuid}`;
  const rewarded = Math.max((live.rewardedMiners as number) ?? 0, 0);
  const minerEm = (live.minerEmissionTaoPerDay as number) ?? 0;
  const perEarningDailyTao =
    rewarded > 0 && minerEm > 0
      ? minerEm / rewarded
      : minerEm > 0
        ? (minerEm / Math.max(live.minersCount as number, 1)) * 0.6
        : 0;
  const grossMonthlyUsd = Math.round(perEarningDailyTao * 30 * usd);
  const liveAgeBlocks =
    live.registeredAt != null && (snap.blockNumber as number) > (live.registeredAt as number)
      ? (snap.blockNumber as number) - (live.registeredAt as number)
      : null;

  const hardware = classifySubnetHardware(name, live.identityDescription as string | null, {
    fallbackMonthlyUsd: grossMonthlyUsd,
    scraped,
  });
  const { components, diag } = scoreMinersLedger({
    live: live as never,
    taoUsd: usd,
    hardware,
    liveAgeBlocks,
  });
  const score = totalScore(components);
  const earn = computeEarnChance({
    rewardedRatio: (live.rewardedMiners as number) / Math.max(live.minersCount as number, 1),
    freeSlots: Math.max((live.maxUids as number) - (live.minersCount as number), 0),
    top10IncentiveShare: (live.top10IncentiveShare as number) ?? 0,
    rampWeeks: diag.rampWeeks,
  });
  const h = diag.hosting;
  const hf = h ? [h.bareMetalOnly && "BARE", h.teeRequired && "TEE", h.staticIpRequired && "IP"].filter(Boolean).join("+") : "none";
  console.log(
    `#${String(netuid).padStart(3)} ${name.padEnd(14)} score=${score.toFixed(1)} gpu=${diag.recommendedGpu} (${diag.gpuCount ?? 1}x) cost=$${Math.round(diag.gpuCostMonthlyUsd).toLocaleString()}/mo net=$${Math.round(diag.netMonthlyUsd).toLocaleString()}/mo hosting=[${hf}] ramp=${diag.rampWeeks}wk odds=${earn.level}~${earn.pct}%`
  );
}
