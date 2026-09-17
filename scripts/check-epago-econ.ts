/**
 * EPAGO-ECON — honest economics for SN36 (winner-take-all model-competition
 * subnet): what does the subnet actually pay, and to whom?
 * Run: bun scripts/check-epago-econ.ts
 */
const BASE = process.env.AUTH_TEST_BASE ?? "http://localhost:3000";
const USERS: Array<{ userId: string; code: string }> = JSON.parse(
  (await import("node:fs")).readFileSync(
    new URL("./users.local.json", import.meta.url),
    "utf8"
  )
);

const admin = USERS.find((u) => u.userId === "admin")!;
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: admin.userId, code: admin.code }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
const res = await fetch(`${BASE}/api/network`, { headers: { cookie } });
const snap = (await res.json()) as any;

const s = snap.subnets.find((x: any) => x.netuid === 36);
console.log("=== SN36 Epago — live chain snapshot ===");
for (const k of [
  "subnetName", "alphaPriceUsd", "alphaPriceChange24h", "movingPrice",
  "subnetTao", "emission", "emissionTaoday", "poolTao", "marketCapUsd",
  "activeMiners", "validatorCount", "totalStake", "units",
]) {
  if (s && k in s) console.log(`  ${k}:`, JSON.stringify(s[k]));
}
console.log("  taoPriceUsd:", snap.taoPriceUsd);
// Dump every numeric field so we see what's available:
if (s) {
  console.log("\n  -- all scalar fields --");
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
      console.log(`  ${k}: ${v}`);
    }
  }
}

// Neurons on SN36 — stake distribution (winner-take-all check):
const neurons = (snap.neurons ?? []).filter((n: any) => n.netuid === 36);
console.log(`\n=== neurons on SN36: ${neurons.length} ===`);
if (neurons.length > 0) {
  const n0 = neurons[0];
  console.log("  fields:", Object.keys(n0).join(", "));
  const withStake = neurons
    .map((n: any) => ({ uid: n.uid, hotkey: (n.hotkey ?? "").slice(0, 10), stake: n.stake ?? n.totalStake ?? 0, incentive: n.incentive ?? n.incentiveScore }))
    .sort((a: any, b: any) => b.stake - a.stake)
    .slice(0, 12);
  for (const n of withStake) console.log("  ", JSON.stringify(n));
}
