// Verify the dashboard headline pick after the seat-realism gate —
// runs the project's REAL computeOpportunityScore on live chain data.
import { computeOpportunityScore } from "../src/lib/infranex/opportunity-score";

const BASE = "http://localhost:3000";
const users = require("../scripts/users.local.json");
const admin = users.find((u: any) => u.userId === "admin");

async function main() {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  if (!loginRes.ok) throw new Error(`login ${loginRes.status}`);
  const cookie = (loginRes.headers.get("set-cookie") ?? "").split(";")[0];
  const H = { cookie };

  const [snap, prof, ovr] = await Promise.all([
    fetch(`${BASE}/api/network`, { headers: H }).then((r) => r.json()),
    fetch(`${BASE}/api/profitability-config`, { headers: H }).then((r) => r.json()),
    fetch(`${BASE}/api/subnet-overrides`, { headers: H }).then((r) => r.json()),
  ]);
  const overrides = new Map<number, Record<string, unknown>>(
    (Array.isArray(ovr) ? ovr : ovr.overrides ?? []).map((o: any) => [o.netuid, o])
  );

  const score = computeOpportunityScore(snap, {
    capitalTao: 10,
    profConfig: prof,
    overrides,
  });

  console.log(`block ${snap.blockNumber} · TAO $${snap.taoPriceUsd}`);
  console.log(`RECOMMENDED : ${score.recommended.strategy} ${score.recommended.title} (α${score.recommended.netuid}) · ${score.recommended.roiMonthlyPct}%/mo · $${score.recommended.netMonthlyUsd}/mo`);
  console.log(`ALTERNATIVE : ${score.alternative.strategy} ${score.alternative.title} · ${score.alternative.roiMonthlyPct}%/mo`);
  console.log(`score ${score.score} · confidence ${score.confidence} · candidates ${score.miningCandidates}`);
  console.log(`runner-up mining: ${score.alternatives.mining.map((m) => `α${m.netuid} ${m.name} ${m.roiMonthlyPct}%/mo`).join(" | ")}`);
  console.log(`Epago in headline ranking: ${[score.recommended, ...score.alternatives.mining].some((m) => m.netuid === 36) ? "YES (BAD)" : "no (good)"}`);
  console.log("\nnotes:");
  for (const n of score.notes) console.log(` - ${n}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
