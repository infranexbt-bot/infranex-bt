// Probe live-data content quality: offers honest-state, SN61 requirements
// (should be resolved live from the subnet's real GitHub), then force a
// full sync and check what changed.

const BASE = "http://localhost:3000";

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const g = async (u: string, method = "GET") => {
    const t0 = Date.now();
    const r = await fetch(BASE + u, { method, headers: { cookie }, signal: AbortSignal.timeout(60000) });
    return { status: r.status, body: await r.text(), ms: Date.now() - t0 };
  };

  console.log("=== gpu-offers (no RunPod key) ===");
  const gpu = await g("/api/gpu-offers");
  console.log(gpu.status, `${gpu.ms}ms`, gpu.body.slice(0, 400));

  console.log("\n=== cpu-offers (no CPU provider key) ===");
  const cpu = await g("/api/cpu-offers");
  console.log(cpu.status, `${cpu.ms}ms`, cpu.body.slice(0, 400));

  console.log("\n=== subnet-requirements SN61 (RedTeam, live GitHub resolution) ===");
  const req61 = await g("/api/devops/subnet-requirements?netuid=61");
  console.log(req61.status, `${req61.ms}ms`);
  try {
    const j = JSON.parse(req61.body);
    console.log(JSON.stringify(j, null, 1).slice(0, 2200));
  } catch { console.log(req61.body.slice(0, 1000)); }

  console.log("\n=== subnet-requirements SN61 second call (should be cached/faster) ===");
  const req61b = await g("/api/devops/subnet-requirements?netuid=61");
  console.log(req61b.status, `${req61b.ms}ms`);

  console.log("\n=== POST subnets/sync-all (full live chain + metadata refresh) ===");
  const sync = await g("/api/subnets/sync-all?force=true", "POST");
  console.log(sync.status, `${sync.ms}ms`, sync.body.slice(0, 500));

  console.log("\n=== network after sync (spot-check freshness fields) ===");
  const net = await g("/api/network");
  console.log(net.status, `${net.ms}ms`, `bytes=${net.body.length}`);
  try {
    const j = JSON.parse(net.body);
    const keys = Object.keys(j);
    console.log("top-level keys:", keys.slice(0, 15).join(", "));
    const subs = j.subnets || j.rows || j.data;
    if (Array.isArray(subs)) {
      console.log("subnet count:", subs.length);
      console.log("sample subnet[0]:", JSON.stringify(subs[0]).slice(0, 500));
      const sn61 = subs.find((s: any) => s.netuid === 61 || s.id === 61);
      if (sn61) console.log("SN61:", JSON.stringify(sn61).slice(0, 500));
    }
  } catch (e: any) { console.log("parse fail", e.message); }
}

main().catch((e) => { console.error(e); process.exit(1); });
