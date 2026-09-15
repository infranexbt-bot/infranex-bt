// TRUST-LOOP — projected vs actual. Unit checks (verdict bands, calibration
// blend) + authenticated e2e against the running dev server with seeded
// deployments/earnings (cleaned up afterwards).
// Run: bun scripts/test-trust-loop.ts   (dev server on :3000 required for e2e)
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3000";
let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${cond ? "" : `: ${detail}`}`);
  if (!cond) failures++;
}

// ---------------------------------------------------------------------------
// Unit 1 — evaluateTrust bands
// ---------------------------------------------------------------------------
import { evaluateTrust, TRUST_BANDS } from "../src/lib/infranex/trust";

// projected 6 TAO/mo = 0.2/day. pace = earned/days × 30.
const ev1 = evaluateTrust({ projectedMonthlyTao: 6, earnedTaoTotal: 1.8, activeDays: 10 });
check("on-track at 90% pace", ev1.verdict === "on-track" && ev1.ratio === 0.9, JSON.stringify(ev1));

const ev2 = evaluateTrust({ projectedMonthlyTao: 6, earnedTaoTotal: 1.4, activeDays: 10 });
check("lagging at ~70% pace", ev2.verdict === "lagging" && Math.abs((ev2.ratio ?? 0) - 0.7) < 0.001, JSON.stringify(ev2));

const ev3 = evaluateTrust({ projectedMonthlyTao: 6, earnedTaoTotal: 1.0, activeDays: 10 });
check("off-track at 50% pace", ev3.verdict === "off-track" && ev3.ratio === 0.5, JSON.stringify(ev3));

const ev4 = evaluateTrust({ projectedMonthlyTao: 6, earnedTaoTotal: 0.1, activeDays: 2 });
check("warming-up before 3 earning days", ev4.verdict === "warming-up" && ev4.ratio === null, JSON.stringify(ev4));

const ev5 = evaluateTrust({ projectedMonthlyTao: 6, earnedTaoTotal: 0, activeDays: 0 });
check("no-data when nothing booked", ev5.verdict === "no-data" && ev5.ratio === null, JSON.stringify(ev5));

const ev6 = evaluateTrust({ projectedMonthlyTao: null, earnedTaoTotal: 3, activeDays: 20 });
check("no-baseline for pre-trust rows", ev6.verdict === "no-baseline" && ev6.note.includes("before projection capture"), JSON.stringify(ev6));

const ev7 = evaluateTrust({ projectedMonthlyTao: 0, earnedTaoTotal: 2, activeDays: 5 });
check("zero projection + earnings → no-baseline (emission note)", ev7.verdict === "no-baseline" && ev7.note.includes("No chain-measured"), JSON.stringify(ev7));

const ev8 = evaluateTrust({ projectedMonthlyTao: 6, earnedTaoTotal: 1.7, activeDays: 10 });
check("boundary 85% → on-track", ev8.verdict === "on-track", `ratio ${ev8.ratio}`);

const ev9 = evaluateTrust({ projectedMonthlyTao: 6, earnedTaoTotal: 1.2, activeDays: 10 });
check("boundary 60% → lagging", ev9.verdict === "lagging", `ratio ${ev9.ratio}`);

check("bands sanity", TRUST_BANDS.ON_TRACK === 0.85 && TRUST_BANDS.LAGGING === 0.6 && TRUST_BANDS.WARMUP_DAYS === 3);

// ---------------------------------------------------------------------------
// Unit 2 — calibration blend in the Opportunity Score
// ---------------------------------------------------------------------------
import { computeOpportunityScore } from "../src/lib/infranex/opportunity-score";
import type { LiveNetworkSnapshot, LiveSubnetMetrics } from "../src/lib/infranex/chain";

function subnet(partial: Partial<LiveSubnetMetrics> & { netuid: number }): LiveSubnetMetrics {
  return {
    name: `Subnet ${partial.netuid}`,
    minersCount: 100,
    validatorsCount: 12,
    subnetTao: 100_000,
    alphaIn: 50_000,
    alphaOut: 0,
    tempo: 360,
    emissionEnabled: true,
    movingPrice: 0.1,
    emission: null,
    emissionTaoPerDay: null,
    minerEmissionTaoPerDay: null,
    rewardedMiners: null,
    top10IncentiveShare: null,
    incentiveMedianShare: null,
    burnCostTao: null,
    immunityBlocks: null,
    alphaPriceChange24h: null,
    maxUids: 256,
    owner: null,
    registeredAt: null,
    identityGithub: null,
    identityDescription: null,
    ...partial,
  } as LiveSubnetMetrics;
}

const snap: LiveNetworkSnapshot = {
  blockNumber: 5_000_000,
  totalSubnets: 3,
  specVersion: 1500,
  fetchedAt: new Date().toISOString(),
  taoPriceUsd: 225,
  taoMarketCapUsd: 4_400_000_000,
  taoChange24h: -1.2,
  source: "live",
  subnets: [
    subnet({ netuid: 0, name: "Root", subnetTao: 21_000_000, emissionTaoPerDay: 0 }),
    subnet({
      netuid: 8,
      name: "Frontier LLM inference subnet",
      identityDescription: "Frontier LLM inference and serving",
      minersCount: 500,
      rewardedMiners: 400,
      minerEmissionTaoPerDay: 720,
      subnetTao: 800_000,
      alphaPriceChange24h: 2.1,
      burnCostTao: 0.8,
    }),
    subnet({ netuid: 1, name: "Apex staking pool", emissionTaoPerDay: 1200, subnetTao: 500_000, alphaPriceChange24h: -2.0 }),
  ],
  neurons: [],
};

const base = computeOpportunityScore(snap, { capitalTao: 10 });
const calibrated = computeOpportunityScore(snap, {
  capitalTao: 10,
  calibration: { minerDays: 30, accuracyRatio: 0.5 },
});
check("calibration note present", calibrated.notes.some((n) => n.includes("observed projection accuracy")), calibrated.notes.join(" | "));
check("calibration moves confidence 70/30", calibrated.confidence === Math.round(base.confidence * 0.7 + 50 * 0.3) / 100, `${base.confidence} → ${calibrated.confidence}`);
check("thin calibration sample ignored (<7 days)", computeOpportunityScore(snap, { capitalTao: 10, calibration: { minerDays: 3, accuracyRatio: 0.1 } }).confidence === base.confidence);
check("clamped accuracy ≤1", (() => {
  const c = computeOpportunityScore(snap, { capitalTao: 10, calibration: { minerDays: 30, accuracyRatio: 5 } });
  return c.confidence <= Math.round(base.confidence * 0.7 + 100 * 0.3) / 100 + 0.001;
})());

// ---------------------------------------------------------------------------
// E2E — authenticated, seeded deployments against the running server
// ---------------------------------------------------------------------------
import { db } from "../src/lib/db";
import { utcDay } from "../src/lib/infranex/economics";
import { computeDeploymentProjection } from "../src/lib/infranex/trust";

const USERS: Array<{ userId: string; code: string }> = JSON.parse(
  fs.readFileSync(path.join(path.dirname(process.argv[1] ?? ""), "users.local.json"), "utf8")
);
async function login(userId: string, code: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, code }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const c = cookies.find((x) => x.startsWith("infranex_session="));
  return c ? c.split(";")[0] : "";
}
const creds = USERS.find((u) => u.userId === "ops01") ?? USERS[0];
const cookie = await login(creds.userId, creds.code);
check("e2e login", Boolean(cookie));
if (cookie) {
  // --- live projection (chain reachable?) ---
  try {
    const proj = await computeDeploymentProjection(8);
    if (proj) {
      check("live projection for SN8 is live-chain", proj.source === "live-chain");
      check("projection monthly TAO > 0", proj.projectedMonthlyTao > 0, String(proj.projectedMonthlyTao));
      check("projection gross USD consistent", proj.projectedGrossMonthlyUsd > 0);
    } else {
      console.log("SKIP — chain unreachable or SN8 has no emission (projection null)");
    }
  } catch (e) {
    console.log("SKIP — live projection threw:", e instanceof Error ? e.message : e);
  }

  // --- seeded fleet ---
  const dayN = (k: number) => utcDay(new Date(Date.now() - k * 86_400_000));
  const mkDep = async (name: string, projected: number | null) =>
    db.deployment.create({
      data: {
        minerName: name,
        netuid: 8,
        subnetName: "Frontier LLM inference subnet",
        gpuModel: "RTX 4090",
        provider: "runpod",
        status: "started",
        mode: "runpod",
        hourlyCost: 0.4,
        monthlyCost: 292,
        estimatedRevenue: projected ? Math.round(projected / 30 * 225) : 0,
        config: "{}",
        hotkey: "5TRUSTTEST0000000000000000000000000000000000000000000000000000000000000000000000",
        projectedMonthlyTao: projected,
        projectedGrossMonthlyUsd: projected ? projected * 225 : null,
        projectedNetMonthlyUsd: null,
        projectionSource: projected ? "live-chain" : null,
        projectionRampWeeks: projected ? 2 : null,
        projectedAt: projected ? new Date() : null,
      },
    });

  // A: 10 days × 0.18 = 1.8 → pace 5.4 vs 6.0 → 90% on-track (calibratable)
  // B: 5 days × 0.10 = 0.5 → pace 3.0 vs 6.0 → 50% off-track (not calibratable)
  // C: 1 day × 0.05 → warming-up
  // D: no projection, no earnings → no-data
  const depA = await mkDep("TRUST-TEST-A", 6);
  const depB = await mkDep("TRUST-TEST-B", 6);
  const depC = await mkDep("TRUST-TEST-C", 6);
  const depD = await mkDep("TRUST-TEST-D", null);
  const mkEarn = (depId: string, day: string, tao: number) =>
    db.earningsDaily.create({
      data: {
        deploymentId: depId,
        hotkey: "5TRUSTTEST",
        netuid: 8,
        day,
        earnedTao: tao,
        earnedUsd: tao * 225,
        taoPriceUsd: 225,
        lastEmissionTao: tao,
        samples: 4,
      },
    });

  try {
    for (let k = 9; k >= 0; k--) await mkEarn(depA.id, dayN(k), 0.18);
    for (let k = 4; k >= 0; k--) await mkEarn(depB.id, dayN(k), 0.1);
    await mkEarn(depC.id, dayN(0), 0.05);
    await db.spendLedger.create({
      data: { deploymentId: depA.id, day: dayN(0), provider: "runpod", gpuModel: "RTX 4090", hoursRun: 24, costUsd: 12 },
    });

    const res = await fetch(`${BASE}/api/trust`, { headers: { cookie } });
    check("GET /api/trust 200", res.status === 200, String(res.status));
    const report = (await res.json()) as {
      rows: Array<{
        deploymentId: string; verdict: string; ratio: number | null;
        projectedMonthlyTao: number | null; actualMonthlyTao: number | null;
        activeDays: number; spendUsdTotal: number; note: string;
      }>;
      portfolio: Record<string, number | Record<string, number>>;
      calibration: { minerDays: number; accuracyRatio: number | null; note: string };
    };

    const rowA = report.rows.find((r) => r.deploymentId === depA.id);
    const rowB = report.rows.find((r) => r.deploymentId === depB.id);
    const rowC = report.rows.find((r) => r.deploymentId === depC.id);
    const rowD = report.rows.find((r) => r.deploymentId === depD.id);

    check("A on-track @90%", rowA?.verdict === "on-track" && rowA.ratio === 0.9, JSON.stringify(rowA));
    check("A activeDays = 10", rowA?.activeDays === 10, String(rowA?.activeDays));
    check("B off-track @50%", rowB?.verdict === "off-track", JSON.stringify(rowB));
    check("C warming-up", rowC?.verdict === "warming-up", JSON.stringify(rowC));
    check("D no-data (no projection, no earnings)", rowD?.verdict === "no-data", JSON.stringify(rowD));
    check("calibration uses only ≥7-day miners", report.calibration.minerDays === 10 && Math.abs((report.calibration.accuracyRatio ?? 0) - 0.9) < 0.001, JSON.stringify(report.calibration));
    const counts = report.portfolio.counts as Record<string, number>;
    check("portfolio counts include verdicts", counts["on-track"] >= 1 && counts["off-track"] >= 1 && counts["warming-up"] >= 1, JSON.stringify(counts));
    check("A spend rolled up", rowA?.spendUsdTotal === 12, String(rowA?.spendUsdTotal));
  } finally {
    // cleanup — tests must leave no trace
    for (const d of [depA, depB, depC, depD]) {
      await db.earningsDaily.deleteMany({ where: { deploymentId: d.id } });
      await db.spendLedger.deleteMany({ where: { deploymentId: d.id } });
      await db.deployment.delete({ where: { id: d.id } }).catch(() => null);
    }
    console.log("cleanup — seeded trust rows removed");
  }
}

console.log(failures === 0 ? "\nALL TRUST-LOOP CHECKS PASS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
