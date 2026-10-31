// Full-field dump for SN51 — chain record + playbook entry, complete JSON.
const BASE = "http://localhost:3000";

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const get = async (p: string) =>
    (await fetch(`${BASE}${p}`, { headers: { cookie }, cache: "no-store" })).json();

  const snap = await get("/api/network");
  const sub = (snap as any).subnets?.find((s: any) => s.netuid === 51);
  console.log("=== FULL CHAIN RECORD SN51 ===");
  console.log(JSON.stringify(sub, null, 1));

  const pb = await get("/api/playbook");
  const entry = (pb as any).entries?.find((e: any) => e.netuid === 51)
    ?? (pb as any).playbook?.find((e: any) => e.netuid === 51)
    ?? (Array.isArray(pb) ? (pb as any[]).find((e: any) => e.netuid === 51) : null);
  console.log("\n=== FULL PLAYBOOK ENTRY SN51 ===");
  console.log(JSON.stringify(entry, null, 1).slice(0, 4000));
}

main().catch((e) => { console.error(e); process.exit(1); });
