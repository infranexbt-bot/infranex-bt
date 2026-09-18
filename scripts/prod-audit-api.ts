// Production-readiness API audit — Part 1: authenticated GET sweep.
// Logs in, then hits every read endpoint, recording status/latency/size and
// a data-quality verdict (live data vs empty vs error).

const BASE = "http://localhost:3000";

interface Row {
  route: string;
  status: number;
  ms: number;
  bytes: number;
  verdict: string;
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const raw = res.headers.get("set-cookie") || "";
  if (!res.ok) throw new Error(`login failed ${res.status}: ${await res.text()}`);
  const token = raw.split(";")[0];
  console.log(`login: ${res.status} cookie=${token.slice(0, 30)}...`);
  return token;
}

function verdictOf(status: number, body: any, bytes: number): string {
  if (status >= 500) return "SERVER-ERROR";
  if (status >= 400) return "CLIENT-ERROR";
  const s = JSON.stringify(body);
  if (bytes < 30) return "EMPTY";
  // common empty shapes
  if (
    (Array.isArray(body) && body.length === 0) ||
    (body && typeof body === "object" && Array.isArray(body.items) && body.items.length === 0) ||
    (body && typeof body === "object" && Object.keys(body).length === 0)
  ) {
    // empty may be legit for queues, but flag for review
    return "EMPTY-BUT-OK?";
  }
  if (typeof s === "string" && /mock|placeholder|coming soon|not configured/i.test(s.slice(0, 2000))) {
    return "CONTAINS-MOCK-LANG";
  }
  return "OK";
}

const GETS: Array<[string, string]> = [
  ["/api/auth/session", "auth"],
  ["/api/network", "chain/network"],
  ["/api/subnets", "subnet list"],
  ["/api/subnets/odds-history", "odds history"],
  ["/api/subnet-overrides", "overrides"],
  ["/api/economics", "economics"],
  ["/api/profitability-config", "profitability"],
  ["/api/gpu-offers", "GPU offers (RunPod key needed)"],
  ["/api/cpu-offers", "CPU offers (needs CPU provider key)"],
  ["/api/providers/keys", "provider keys"],
  ["/api/devops/hosts", "devops hosts"],
  ["/api/devops/monitor", "devops monitor"],
  ["/api/devops/subnet-options", "devops subnet options"],
  ["/api/devops/subnet-requirements?netuid=61", "devops requirements SN61"],
  ["/api/devops/subnet-requirements?netuid=1", "devops requirements SN1"],
  ["/api/deployments", "deployments"],
  ["/api/daemon/commands", "daemon commands"],
  ["/api/daemon/telemetry", "daemon telemetry"],
  ["/api/wallets", "wallets"],
  ["/api/wallets/stake-portfolio", "stake portfolio"],
  ["/api/workers/status", "workers status"],
  ["/api/monitoring", "monitoring"],
  ["/api/alerts/channels", "alert channels"],
  ["/api/autopilot/rules", "autopilot rules"],
  ["/api/judge/profiles", "judge profiles"],
  ["/api/judge/runs", "judge runs"],
  ["/api/triggers", "triggers"],
  ["/api/trust", "trust"],
  ["/api/audit", "audit log"],
  ["/api/admin/users", "admin users"],
  ["/api/settings", "settings"],
];

async function main() {
  const cookie = await login();
  const rows: Row[] = [];
  for (const [route, label] of GETS) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}${route}`, {
        headers: { cookie },
        signal: AbortSignal.timeout(30000),
      });
      const text = await res.text();
      const ms = Date.now() - t0;
      let body: any = null;
      try { body = JSON.parse(text); } catch { /* non-json */ }
      rows.push({
        route,
        status: res.status,
        ms,
        bytes: text.length,
        verdict: verdictOf(res.status, body, text.length),
      });
    } catch (e: any) {
      rows.push({ route, status: 0, ms: Date.now() - t0, bytes: 0, verdict: `THREW: ${e.message?.slice(0, 60)}` });
    }
  }
  console.log("\nroute | status | ms | bytes | verdict");
  for (const r of rows) {
    console.log(`${r.route} | ${r.status} | ${r.ms} | ${r.bytes} | ${r.verdict}`);
  }
  const bad = rows.filter((r) => !r.verdict.startsWith("OK") && r.verdict !== "EMPTY-BUT-OK?");
  console.log(`\nTOTAL ${rows.length} | problems: ${bad.length}`);
  for (const b of bad) console.log(`  !! ${b.route} -> ${b.verdict} (${b.status})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
