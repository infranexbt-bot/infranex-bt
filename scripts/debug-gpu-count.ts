// Debug: inspect SN82/SN64/SN28 raw fields that drive hardware gating.
const BASE = "http://127.0.0.1:3000";
async function main() {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  const ck = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const api = async (p: string) => (await fetch(BASE + p, { headers: { cookie: ck } })).json();
  const snap = await api("/api/network");
  const profConfig = await api("/api/profitability-config");
  const ovrJson = await api("/api/subnet-overrides");
  const overrides = new Map(Object.entries(ovrJson?.overrides ?? {}).map(([k, v]) => [Number(k), v as Record<string, unknown>]));
  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(snap, profConfig, overrides) as any[];
  for (const nuid of [82, 64, 28, 92]) {
    const o = rows.find((r) => r.netuid === nuid);
    if (!o) continue;
    console.log(`SN${nuid} ${o.subnetName}: gpuCount=${o.gpuCount} minVram=${o.minVramGb} gpu="${o.recommendedGpu}" hosting=${JSON.stringify(o.hosting)} src=${o.requirementsSource ? "set" : "null"} mech=${o.mechanics ? "set" : "null"} net=$${Math.round(o.netMonthlyUsd ?? 0)}`);
  }
  // distribution of gpuCount across all rows
  const dist: Record<string, number> = {};
  for (const r of rows) dist[String(r.gpuCount ?? "null")] = (dist[String(r.gpuCount ?? "null")] ?? 0) + 1;
  console.log("gpuCount distribution:", dist);
}
main().catch((e) => { console.error(e); process.exit(1); });
