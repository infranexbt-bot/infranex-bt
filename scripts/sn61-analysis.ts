// SN61 RedTeam deep-dive: login → /api/network → mergeOpportunities → full row dump.
// Shows what our app knows: price, earnings, demand, seats, dilution, verdict.
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
  const data = await res.json();
  console.log("network:", res.status, "| taoUsd:", data.taoPriceUsd, "| block:", data.blockNumber);

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(data);
  const r = rows.find((x: any) => x.netuid === 61);
  if (!r) { console.log("SN61 not found!"); return; }

  // Dump everything we have on SN61
  console.log("\n===== SN61 FULL ROW =====");
  const skip = new Set(["demandParts", "factors"]);
  for (const [k, v] of Object.entries(r)) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v)) { console.log(`${k}: [${v.length} items]`); continue; }
    if (typeof v === "object") { console.log(`${k}: ${JSON.stringify(v)}`); continue; }
    console.log(`${k}: ${v}`);
  }

  console.log("\n===== SCORE FACTORS =====");
  for (const f of (r as any).factors ?? []) {
    console.log(`  ${f.key ?? f.label}: score=${f.score ?? "?"} — ${f.detail ?? ""}`);
  }

  console.log("\n===== DEMAND PARTS =====");
  for (const p of (r as any).demandParts ?? []) {
    console.log(`  ${p.label} [w${Math.round(p.weight * 100)}%]: ${p.score ?? "—"} — ${p.detail}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
