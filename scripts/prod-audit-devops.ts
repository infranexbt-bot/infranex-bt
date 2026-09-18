// DevOps engine audit: monitor, requirements resolution breadth across
// several subnets (GPU-documented must be refused for CPU path), agent route.
async function main() {
  const login = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const g = async (u: string, method = "GET", body?: any) => {
    const t0 = Date.now();
    const r = await fetch("http://localhost:3000" + u, {
      method,
      headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45000),
    });
    const txt = await r.text();
    return { status: r.status, ms: Date.now() - t0, body: txt };
  };

  console.log("=== devops/monitor ===");
  const mon = await g("/api/devops/monitor");
  console.log(mon.status, `${mon.ms}ms`, mon.body.slice(0, 600));

  console.log("\n=== requirements breadth: SN64 (Opportunity?), SN18, SN1 tauon ===");
  for (const n of [64, 18, 1]) {
    const r = await g(`/api/devops/subnet-requirements?netuid=${n}`);
    try {
      const j = JSON.parse(r.body);
      const p = j.profile ?? j;
      console.log(
        `sn${n}: ${r.status} ${r.ms}ms | name=${p.subnetName} | gpu=${p.recommendedGpu} | minVram=${p.minVramGb} | repo=${p.repoUrl} | sources=${JSON.stringify(p.sources)} | conf=${p.confidence}`
      );
    } catch { console.log(`sn${n}: ${r.status} ${r.ms}ms`, r.body.slice(0, 200)); }
  }

  console.log("\n=== devops/agent (what methods?) ===");
  const ag = await g("/api/devops/agent");
  console.log("GET:", ag.status, ag.body.slice(0, 200));
  const agp = await g("/api/devops/agent", "POST", {});
  console.log("POST empty:", agp.status, agp.body.slice(0, 200));

  console.log("\n=== cpu-provision refusal path (no keys, no host) ===");
  const cp = await g("/api/cpu-provision", "POST", { netuid: 61 });
  console.log(cp.status, cp.body.slice(0, 300));
}

main().catch((e) => console.log("ERR", e.message));
