// Verify SN105 tile after fix: read admin code from the 0600 credential
// mirror (scripts/users.local.json), login, hit opportunities API.
import { readFileSync } from "node:fs";

async function main() {
  const users = JSON.parse(readFileSync("/home/z/my-project/scripts/users.local.json", "utf8"));
  const admin = users.find((u: any) => u.role === "admin" && u.code);
  if (!admin) throw new Error("no admin code in mirror");
  const base = "http://localhost:3000";

  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  console.log("login status:", login.status);
  const cookie = (login.headers.getSetCookie?.() ?? [])
    .map((c: string) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("no session cookie");

  const res = await fetch(`${base}/api/network`, { headers: { cookie } });
  console.log("network status:", res.status);
  const data = await res.json();
  console.log("top-level keys:", Object.keys(data).join(", "));

  // Same merge the Dashboard runs client-side:
  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(data);
  const sn105 = rows.find((r: any) => r.netuid === 105);
  if (!sn105) { console.log("SN105 row not found; keys:", Object.keys(data)); return; }
  console.log("SN105 =", JSON.stringify({
    name: sn105.subnetName,
    category: sn105.category,
    workType: sn105.workType,
    recommendedGpu: sn105.recommendedGpu,
    minVramGb: sn105.minVramGb,
    requirementsSource: sn105.requirementsSource,
    hardwareClassified: sn105.hardwareClassified,
    netMonthlyUsd: sn105.netMonthlyUsd,
    gpuCostMonthlyUsd: sn105.gpuCostMonthlyUsd,
    verdict: sn105.verdict,
  }, null, 2));

  // sanity: a true GPU subnet must stay GPU
  const sn64 = rows.find((r: any) => r.netuid === 64);
  if (sn64) console.log("SN64 control =", JSON.stringify({
    name: sn64.subnetName, recommendedGpu: sn64.recommendedGpu, minVramGb: sn64.minVramGb,
  }));
}
main().catch((e) => { console.error(e); process.exit(1); });
