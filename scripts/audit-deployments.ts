/**
 * audit-deployments.ts — Deployments page audit (Task: "audit deployments page").
 *
 * 1. Seeds a MOCK deployment through the engine (documented harness path) and
 *    watches the SERVER-SIDE deploy-ticker drive it requested → started
 *    (no script ticks — proves the auto-advance worker + engine + real-setup
 *    runner + mock transport all work live).
 * 2. Demonstrates the tick-route semantics on a controlled failed-install row:
 *    POST /api/deployments/[id]/tick must RETRY the failed phase
 *    (tickDeployment), not skip ahead (advanceDeployment).
 * 3. Exercises GET detail / registration wizard / revisions list via HTTP.
 * 4. Cleans up every row it created.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = "http://localhost:3000";

const SUBNET = { netuid: 4, name: "TaoStaking" } as const;
const OFFER = {
  id: "audit-mock-offer",
  provider: "RunPod" as const,
  providerKey: "runpod",
  model: "RTX 3090",
  vramGb: 24,
  region: "us-east",
  hourlyPrice: 0.22,
  available: true,
} as never;

let cookie = "";
async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...init?.headers },
  });
  const setc = res.headers.get("set-cookie");
  if (setc && !cookie) cookie = setc.split(";")[0];
  let j: unknown = null;
  try { j = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json: j as Record<string, unknown> };
}

async function login() {
  const r = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  if (r.status !== 200) throw new Error(`login failed: ${r.status} ${JSON.stringify(r.json)}`);
  console.log("login OK");
}

async function watchLifecycle(id: string, deadlineMs: number): Promise<string> {
  const deadline = Date.now() + deadlineMs;
  let last = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const row = await db.deployment.findUnique({ where: { id } });
    if (!row) return "deleted";
    const steps = JSON.parse(row.steps as string) as { name: string; status: string }[];
    const sig = `${row.status}|${steps.map((s) => s.status[0]).join("")}`;
    if (sig !== last) {
      last = sig;
      const t = Math.round((Date.now() - (deadline - deadlineMs)) / 1000);
      console.log(`  t+${t}s status=${row.status} install=${row.installStatus ?? "-"} steps: ${steps.map((s) => `${s.name}=${s.status}`).join(" ")}`);
    }
    if (row.status === "started") return "started";
    if (row.status === "failed") return "failed";
  }
  return "timeout";
}

async function main() {
  await login();
  const created: string[] = [];

  // ---- 0. honest empty-state already verified: GET /api/deployments == [] --

  // ---- 1. POST /api/deployments with no provider keys → honest 400 --------
  const post = await api("/api/deployments", {
    method: "POST",
    body: JSON.stringify({ netuid: 1, offerId: "nope", minerName: "audit-probe", mode: "runpod" }),
  });
  console.log(`\n[1] POST /api/deployments (no provider keys): ${post.status} — ${JSON.stringify(post.json)}`);
  console.log(`    => ${post.status === 400 ? "PASS (honest failure, no fabricated offer)" : "CHECK THIS"}`);

  // ---- 2. seed mock deployment, watch server ticker drive it --------------
  const { createDeployment } = await import("../src/lib/infranex/deployment/engine");
  const rec = await createDeployment({
    subnet: SUBNET as never,
    offer: OFFER,
    minerName: "dep-audit-01",
    mode: "mock",
    walletName: "audit-wallet",
    hotkey: "audit-hotkey",
  });
  created.push(rec.id);
  console.log(`\n[2] seeded mock deployment ${rec.id} (${rec.minerName}) status=${rec.status}`);
  console.log("    watching SERVER-SIDE deploy-ticker (no script ticks)…");
  const outcome = await watchLifecycle(rec.id, 120_000);
  console.log(`    => lifecycle outcome: ${outcome}`);
  const row = await db.deployment.findUnique({ where: { id: rec.id } });
  if (row && row.status === "failed") {
    const steps = JSON.parse(row.steps as string) as { name: string; status: string; output: string[] }[];
    console.log("    failure output:", steps.find((s) => s.status === "failed")?.output.join(" | "));
  }

  // ---- 3. HTTP surface on the live row ------------------------------------
  const det = await api(`/api/deployments/${rec.id}`);
  const d = det.json?.deployment as Record<string, unknown> | undefined;
  console.log(`\n[3] GET detail: ${det.status} status=${d?.status} progress=${d?.progress} config=${d?.config ? "present" : "null"}`);

  const reg = await api(`/api/deployments/${rec.id}/registration`);
  const w = reg.json?.wizard as Record<string, unknown> | undefined;
  console.log(`[4] GET registration: ${reg.status} state=${(reg.json?.registration as Record<string, unknown>)?.state} wizard(scp=${typeof w?.scpCommand}, restart=${typeof w?.restartCommand})`);

  const regBad = await api(`/api/deployments/${rec.id}/registration`, {
    method: "POST",
    body: JSON.stringify({ action: "attach-hotkey", hotkey: "not-ss58" }),
  });
  console.log(`[5] POST attach-hotkey invalid: ${regBad.status} ${JSON.stringify(regBad.json)} => ${regBad.status === 400 ? "PASS" : "CHECK"}`);

  const rev = await api(`/api/deployments/${rec.id}/revisions`);
  const revs = (rev.json?.revisions ?? rev.json?.items ?? []) as unknown[];
  console.log(`[6] GET revisions: ${rev.status} count=${Array.isArray(revs) ? revs.length : "?"} (r1 anchor expected ≥1)`);

  // ---- 4. controlled failed-install row → tick route semantics -----------
  console.log("\n[7] tick-route semantics on controlled failed setup phase:");
  const rec2 = await createDeployment({
    subnet: SUBNET as never,
    offer: OFFER,
    minerName: "dep-audit-retry",
    mode: "mock",
    walletName: "audit-wallet",
    hotkey: "audit-hotkey",
  });
  created.push(rec2.id);
  const failedSteps = [
    { name: "request", label: "Request", status: "done", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), output: [] },
    { name: "approve", label: "Approve", status: "done", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), output: [] },
    { name: "provision", label: "Provision GPU", status: "done", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), output: [] },
    { name: "setup", label: "Environment Setup", status: "failed", startedAt: new Date().toISOString(), completedAt: null, output: ["audit: simulated install failure"] },
    { name: "deploy", label: "Deploy Miner", status: "pending", startedAt: null, completedAt: null, output: [] },
    { name: "health", label: "Health Check", status: "pending", startedAt: null, completedAt: null, output: [] },
  ];
  // Real deployments always have a staged plan by setup time — clone the
  // lifecycle row's plan so retrySetup exercises its true path.
  const planRow = await db.deployment.findUnique({ where: { id: rec.id } });
  await db.deployment.update({
    where: { id: rec2.id },
    data: {
      status: "setup",
      installStatus: "failed",
      steps: JSON.stringify(failedSteps),
      installStepsJson: planRow?.installStepsJson ?? null,
      requirementsJsonSnapshot: planRow?.requirementsJsonSnapshot ?? null,
    },
  });
  // pause the auto-ticker race: tick IMMEDIATELY (ticker runs every 5s)
  const tickRes = await api(`/api/deployments/${rec2.id}/tick`, { method: "POST" });
  const td = tickRes.json?.deployment as Record<string, unknown> | undefined;
  console.log(`    POST /tick → ${tickRes.status} status=${td?.status} installStatus=${(td as { installStatus?: string })?.installStatus}`);
  await new Promise((r) => setTimeout(r, 2500));
  const after = await db.deployment.findUnique({ where: { id: rec2.id } });
  console.log(`    +2.5s      status=${after?.status} installStatus=${after?.installStatus ?? "-"}`);
  // Fixed route: tickDeployment retries → response STILL status=setup (retry
  // kicked, installStatus running). Buggy route: advanceDeployment jumped to
  // ready synchronously.
  if (td?.status === "setup") {
    console.log("    => PASS: failed phase is being RETRIED (state held at setup, retrySetup kicked)");
  } else if (td?.status === "ready" || td?.status === "deploying") {
    console.log("    => BUG: tick SKIPPED the failed install (advanceDeployment jumped ahead)");
  } else {
    console.log("    => observe (state above)");
  }

  // ---- 5. cleanup ----------------------------------------------------------
  for (const id of created) {
    try { await db.deployment.delete({ where: { id } }); } catch { /* gone */ }
  }
  const left = await db.deployment.count();
  console.log(`\n[cleanup] deleted ${created.length} audit rows — Deployment table now has ${left} rows`);
  if (outcome !== "started") process.exit(1);
}

main()
  .catch((e) => { console.error("AUDIT ERROR:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => db.$disconnect());
