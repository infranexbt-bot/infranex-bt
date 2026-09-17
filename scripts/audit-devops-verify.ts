// Verify honest failure content of step-run + fix flows on an unreachable host,
// then delete the host and check for orphaned HostInstall rows (DB hygiene).
const BASE = "http://localhost:3000";

async function jfetch(path: string, init: RequestInit = {}, cookie?: string) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
  });
  try {
    return { status: res.status, body: await res.json() };
  } catch {
    return { status: res.status, body: null };
  }
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

  // fresh throwaway host
  const created = await jfetch(
    "/api/devops/hosts",
    {
      method: "POST",
      body: JSON.stringify({
        name: "audit-host2",
        host: "127.0.0.1",
        port: 1,
        user: "root",
        authMethod: "password",
        secret: "audit-only-not-real",
      }),
    },
    cookie
  );
  const hostId = created.body.host.id;
  console.log("host created:", hostId);

  // stage sn1 install
  const stage = await jfetch(
    `/api/devops/hosts/${hostId}/install`,
    { method: "POST", body: JSON.stringify({ netuid: 1, walletName: "audit-w2", hotkeyName: "audit-h2" }) },
    cookie
  );
  console.log("stage status:", stage.status, "install id:", stage.body?.install?.id);

  // run s2 — inspect the FULL response body
  const run = await jfetch(
    `/api/devops/hosts/${hostId}/install/steps/s2`,
    { method: "POST", body: JSON.stringify({ action: "run" }) },
    cookie
  );
  console.log("\n--- run s2 response:", run.status);
  console.log(JSON.stringify(run.body, null, 1).slice(0, 900));

  // run fix step 5 — inspect the FULL response body
  const fix = await jfetch(
    `/api/devops/hosts/${hostId}/fix`,
    { method: "POST", body: JSON.stringify({ step: 5 }) },
    cookie
  );
  console.log("\n--- fix step5 response:", fix.status);
  console.log(JSON.stringify(fix.body, null, 1).slice(0, 700));

  // delete + orphan check
  const del = await jfetch(`/api/devops/hosts/${hostId}`, { method: "DELETE" }, cookie);
  console.log("\ndelete status:", del.status);

  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  const orphans = await p.hostInstall.findMany({ where: { hostId } });
  const orphanChecks = await p.hostCheck.findMany({ where: { hostId } });
  console.log(`after delete -> orphan HostInstall rows: ${orphans.length}, orphan HostCheck rows: ${orphanChecks.length}`);
  if (orphans.length) {
    console.log("orphan install:", orphans.map((o: any) => `${o.id} netuid=${o.netuid} status=${o.status}`));
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
