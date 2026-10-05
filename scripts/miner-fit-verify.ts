// MINER-FIT engine sanity: run 3 profiles against live data.
import { readFileSync } from "node:fs";

async function main() {
  const users = JSON.parse(readFileSync("/home/z/my-project/scripts/users.local.json", "utf8"));
  const admin = users.find((u: any) => u.role === "admin" && u.code);
  const base = "http://localhost:3000";
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
  const res = await fetch(`${base}/api/network`, { headers: { cookie } });
  const snap = await res.json();
  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const { computeMinerFit } = await import("../src/lib/infranex/miner-fit");
  const rows = mergeOpportunities(snap);

  const profiles: [string, any][] = [
    ["NON-TECH (user now)", { techLevel: "none", budget: "lt100", hardware: "none", hoursPerWeek: "0" }],
    ["BASIC + 4090", { techLevel: "basic", budget: "500", hardware: "gpu-24gb", hoursPerWeek: "2-4" }],
    ["CODER + CPU VPS", { techLevel: "coder", budget: "500", hardware: "cpu-vps", hoursPerWeek: "10" }],
  ];

  for (const [label, profile] of profiles) {
    const rep = computeMinerFit(rows, profile, snap.taoPriceUsd);
    console.log(`\n===== ${label} =====`);
    console.log(`scanned=${rep.scanned} fits=${rep.fits.length} stretch=${rep.stretch.length} excluded=${rep.excludedCount}`);
    for (const f of rep.fits) {
      console.log(`  FIT    SN${f.netuid} ${f.subnetName}: fit ${f.fitScore} | net $${Math.round(f.monthlyNetUsd ?? 0)}/mo | entry ${f.entryChancePct ?? "—"}%`);
    }
    for (const s of rep.stretch) {
      console.log(`  STRCH  SN${s.netuid} ${s.subnetName}: fit ${s.fitScore} | blocker: ${s.blockers[0] ?? "?"}`);
    }
    console.log(`  ${rep.stakingNote}`);
  }

  // sanity: every fit must have 0 blockers; excluded have >=1; scores in range
  let bad = 0;
  for (const [label, profile] of profiles) {
    const rep = computeMinerFit(rows, profile, snap.taoPriceUsd);
    for (const r of [...rep.fits, ...rep.stretch, ...rep.excludedSamples]) {
      if (r.fitScore < 0 || r.fitScore > 99) bad++;
      if (r.verdict === "fit" && r.blockers.length > 0) bad++;
      if (r.verdict === "excluded" && r.blockers.length === 0) bad++;
    }
  }
  console.log(`\nsanity violations: ${bad}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
