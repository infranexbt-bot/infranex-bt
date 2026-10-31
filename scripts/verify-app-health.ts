const BASE = "http://localhost:3000";
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
});
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
console.log("login: OK");

const checks: Array<[string, () => Promise<string>]> = [
  ["/api/network", async () => {
    const d = await (await fetch(`${BASE}/api/network`, { headers: { cookie }, cache: "no-store" })).json() as any;
    return `${d.subnets?.length ?? d.totalSubnets ?? "?"} subnets · source=${d.source ?? "?"} · block=${d.blockNumber ?? "?"}`;
  }],
  ["/api/playbook", async () => {
    const d = await (await fetch(`${BASE}/api/playbook`, { headers: { cookie }, cache: "no-store" })).json() as any;
    const sn82 = d.entries.find((e: any) => e.netuid === 82);
    return `${d.meta.totalSubnets} entries · SN82=${sn82 ? sn82.name : "MISSING"}`;
  }],
  ["/api/subnet-overrides", async () => {
    const d = await (await fetch(`${BASE}/api/subnet-overrides`, { headers: { cookie }, cache: "no-store" })).json() as any;
    const n = d.overrides?.length ?? 0;
    const gpu = (d.overrides ?? []).filter((o: any) => o.recommendedGpu).length;
    return `${n} overrides · ${gpu} with GPU data`;
  }],
  ["/api/profitability-config", async () => "config loaded: " + (await fetch(`${BASE}/api/profitability-config`, { headers: { cookie }, cache: "no-store" })).status],
];

for (const [name, fn] of checks) {
  try { console.log(`PASS ${name} → ${await fn()}`); }
  catch (e) { console.log(`FAIL ${name} → ${e instanceof Error ? e.message : e}`); }
}
