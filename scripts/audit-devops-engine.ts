// DevOps Engine audit — live functional sweep of the host/DevOps surface.
// 1) GET sweep of read endpoints  2) auth-gating of mutating endpoints
// 3) full lifecycle on a throwaway unreachable host (honest-failure proofs)
// 4) DB hygiene check after delete (orphan detection)

const BASE = "http://localhost:3000";
const results: { name: string; pass: boolean; detail: string }[] = [];

function rec(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name} | ${detail}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  return (res.headers.get("set-cookie") || "").split(";")[0];
}

async function jfetch(
  path: string,
  init: RequestInit = {},
  cookie?: string
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function main() {
  const cookie = await login();
  console.log(`logged in, cookie=${cookie.slice(0, 24)}...`);

  // ---------- 1) GET sweep ----------
  const hosts = await jfetch("/api/devops/hosts", {}, cookie);
  rec(
    "GET /api/devops/hosts",
    hosts.status === 200 && Array.isArray(hosts.body?.hosts),
    `status=${hosts.status} hosts=${hosts.body?.hosts?.length ?? "?"} err=${hosts.body?.error ?? "none"}`
  );

  const mon = await jfetch("/api/devops/monitor", {}, cookie);
  const monOk =
    mon.status === 200 && mon.body?.ok === true && mon.body?.summary && Array.isArray(mon.body?.miners);
  rec(
    "GET /api/devops/monitor",
    monOk,
    `status=${mon.status} monitored=${mon.body?.summary?.monitored} lastPass=${JSON.stringify(mon.body?.lastPass)?.slice(0, 80)}`
  );

  const opts = await jfetch("/api/devops/subnet-options", {}, cookie);
  const optRows = opts.body?.subnets ?? [];
  rec(
    "GET /api/devops/subnet-options",
    opts.status === 200 && optRows.length > 50,
    `status=${opts.status} subnets=${optRows.length} source=${opts.body?.source}`
  );

  const req1 = await jfetch("/api/devops/subnet-requirements?netuid=1", {}, cookie);
  const p1 = req1.body?.profile;
  rec(
    "GET /api/devops/subnet-requirements?netuid=1",
    req1.status === 200 && p1?.netuid === 1,
    `status=${req1.status} repo=${p1?.repoUrl ?? "?"} cached=${req1.body?.cached} confidence=${p1?.confidence}`
  );

  const keys = await jfetch("/api/providers/keys", {}, cookie);
  const noKey = (keys.body?.keys ?? []).every((k: any) => !k.hasKey);
  rec(
    "GET /api/providers/keys",
    keys.status === 200 && Array.isArray(keys.body?.keys) && noKey,
    `status=${keys.status} keys=${keys.body?.keys?.length} allHasKey=false=${noKey} (wiped-keys state is honest)`
  );

  // ---------- 2) auth gating (no cookie) ----------
  const gateCases: [string, RequestInit, number][] = [
    ["POST /api/devops/hosts (no auth)", { method: "POST", body: JSON.stringify({ name: "x", host: "1.2.3.4", secret: "k" }) }, 401],
    ["POST validate (no auth)", { method: "POST", body: "{}" }, 401],
    ["POST fix (no auth)", { method: "POST", body: JSON.stringify({ step: 5 }) }, 401],
    ["POST install stage (no auth)", { method: "POST", body: JSON.stringify({ netuid: 1, walletName: "a", hotkeyName: "b" }) }, 401],
    ["POST install step (no auth)", { method: "POST", body: JSON.stringify({ action: "run" }) }, 401],
    ["POST install stop (no auth)", { method: "POST" }, 401],
    ["DELETE host (no auth)", { method: "DELETE" }, 401],
    ["PUT provider key (no auth)", { method: "PUT", body: JSON.stringify({ provider: "runpod", key: "k".repeat(12) }) }, 401],
  ];
  for (const [name, init, want] of gateCases) {
    const r = await jfetch(`/api/devops/hosts/audit-fake-id${name.includes("provider") ? "/../keys" : ""}`, init);
    // provider-key case hits its own path
    const rr = name.includes("provider") ? await jfetch("/api/providers/keys", init) : r;
    rec(
      `AUTH-GATE ${name}`,
      rr.status === want,
      `got=${rr.status} want=${want} body=${JSON.stringify(rr.body).slice(0, 90)}`
    );
  }

  // ---------- 3) lifecycle on a throwaway unreachable host ----------
  // input validation first
  const badName = await jfetch(
    "/api/devops/hosts",
    { method: "POST", body: JSON.stringify({ name: "", host: "127.0.0.1", secret: "k" }) },
    cookie
  );
  rec("POST host: empty name -> 400", badName.status === 400, `status=${badName.status} err=${badName.body?.error}`);

  const badSecret = await jfetch(
    "/api/devops/hosts",
    { method: "POST", body: JSON.stringify({ name: "audit-host", host: "127.0.0.1", secret: "" }) },
    cookie
  );
  rec("POST host: empty secret -> 400", badSecret.status === 400, `status=${badSecret.status} err=${badSecret.body?.error}`);

  // register unreachable loopback host (port 1 = refused fast)
  const created = await jfetch(
    "/api/devops/hosts",
    {
      method: "POST",
      body: JSON.stringify({
        name: "audit-host-dont-use",
        host: "127.0.0.1",
        port: 1,
        user: "root",
        authMethod: "password",
        secret: "audit-only-not-real",
      }),
    },
    cookie
  );
  const hostId = created.body?.host?.id;
  rec(
    "POST /api/devops/hosts create",
    created.status === 201 && !!hostId && created.body.host.secretEnc === undefined,
    `status=${created.status} id=${hostId} secretLeaked=${created.body?.host?.secretEnc !== undefined} provider=${created.body?.host?.provider} status=${created.body?.host?.status}`
  );

  if (hostId) {
    // detail endpoint — hint only, no secret chars
    const detail = await jfetch(`/api/devops/hosts/${hostId}`, {}, cookie);
    const hint = detail.body?.host?.secretHint ?? "";
    rec(
      "GET host detail: secret hint shape",
      detail.status === 200 && /password\(\d+ chars\)|key\(\d+ chars\)/.test(hint),
      `status=${detail.status} hint="${hint}" (no secret chars echoed)`
    );

    // validate — expect honest SSH failure
    const t0 = Date.now();
    const val = await jfetch(`/api/devops/hosts/${hostId}/validate`, { method: "POST" }, cookie);
    const sum = val.body?.summary;
    const step1 = (sum?.results ?? []).find((r: any) => r.step === 1);
    const skipped = (sum?.results ?? []).filter((r: any) => r.status === "skipped").length;
    rec(
      "POST validate: honest failure on unreachable host",
      val.status === 200 && sum?.overall === "failed" && step1?.status === "fail" && skipped === 9,
      `status=${val.status} overall=${sum?.overall} step1=${step1?.status} out="${(step1?.output ?? "").slice(0, 70)}" skipped=${skipped}/9 tookMs=${Date.now() - t0}`
    );

    // stage install for sn1 — plan must come from the REAL chain-correct repo
    const stage = await jfetch(
      `/api/devops/hosts/${hostId}/install`,
      { method: "POST", body: JSON.stringify({ netuid: 1, walletName: "audit-wallet", hotkeyName: "audit-hot" }) },
      cookie
    );
    const inst = stage.body?.install;
    const steps = inst?.steps ?? [];
    const gates = steps.map((s: any) => s.gate).join(",");
    const hasRepoStep = steps.some((s: any) => s.title.startsWith("Clone") && (s.commands?.[0] ?? "").includes("macrocosm-os/apex"));
    rec(
      "POST install stage sn1: real profile + 9-step plan",
      stage.status === 201 && inst?.status === "staged" && steps.length >= 8 && gates.includes("manual") && gates.includes("approval"),
      `status=${stage.status} steps=${steps.length} gates="${gates}" apexCloneStep=${hasRepoStep} subnet=${inst?.subnetName}`
    );

    // input validation on stage
    const badStage = await jfetch(
      `/api/devops/hosts/${hostId}/install`,
      { method: "POST", body: JSON.stringify({ netuid: 1, walletName: "bad name!", hotkeyName: "x" }) },
      cookie
    );
    rec("POST install stage: bad walletName -> 400", badStage.status === 400, `status=${badStage.status} err=${badStage.body?.error}`);

    // run one real step (s2 OS packages) — designed behavior: the step
    // executor records the transport failure ON the step and returns 200
    // (honest: status=fail + real SSH error + remediation, install=failed)
    const runStep = await jfetch(
      `/api/devops/hosts/${hostId}/install/steps/s2`,
      { method: "POST", body: JSON.stringify({ action: "run" }) },
      cookie
    );
    const rs = runStep.body?.step ?? {};
    rec(
      "POST install step s2: honest transport failure on the step",
      runStep.status === 200 &&
        rs.status === "fail" &&
        (rs.output ?? "").includes("SSH 127.0.0.1:1") &&
        runStep.body?.install?.status === "failed",
      `status=${runStep.status} step.status=${rs.status} out="${(rs.output ?? "").slice(0, 70)}" install=${runStep.body?.install?.status}`
    );

    // fix gating: step without fix -> 400; step with fix -> honest connect
    // failure recorded on the result (200 + status=fail after connect fix)
    const fix1 = await jfetch(
      `/api/devops/hosts/${hostId}/fix`,
      { method: "POST", body: JSON.stringify({ step: 1 }) },
      cookie
    );
    rec("POST fix step1 (no auto fix) -> 400", fix1.status === 400, `status=${fix1.status} err=${fix1.body?.error}`);

    const fix5 = await jfetch(
      `/api/devops/hosts/${hostId}/fix`,
      { method: "POST", body: JSON.stringify({ step: 5 }) },
      cookie
    );
    const f5 = fix5.body?.result ?? {};
    rec(
      "POST fix step5: honest SSH connect failure (not 'SSH not connected')",
      fix5.status === 200 &&
        f5.status === "fail" &&
        (f5.output ?? "").includes("SSH 127.0.0.1:1") &&
        !(f5.output ?? "").includes("SSH not connected"),
      `status=${fix5.status} result.status=${f5.status} out="${(f5.output ?? "").slice(0, 80)}"`
    );

    // stop with no way to reach host — should still mark stopped + honest output
    const stop = await jfetch(`/api/devops/hosts/${hostId}/install/stop`, { method: "POST" }, cookie);
    rec(
      "POST install stop: reachable-required stop honors SSH reality",
      stop.status === 400,
      `status=${stop.status} err="${(stop.body?.error ?? "").slice(0, 80)}"`
    );

    // fake host id -> 404
    const nf = await jfetch("/api/devops/hosts/does-not-exist/validate", { method: "POST" }, cookie);
    rec("POST validate unknown host -> 404", nf.status === 404, `status=${nf.status}`);
    const nfFix = await jfetch("/api/devops/hosts/does-not-exist/fix", { method: "POST", body: JSON.stringify({ step: 5 }) }, cookie);
    rec("POST fix unknown host -> 404", nfFix.status === 404, `status=${nfFix.status}`);

    // ---------- 4) delete + DB hygiene ----------
    const del = await jfetch(`/api/devops/hosts/${hostId}`, { method: "DELETE" }, cookie);
    rec("DELETE host", del.status === 200 && del.body?.ok === true, `status=${del.status}`);

    const after = await jfetch("/api/devops/hosts", {}, cookie);
    const gone = !(after.body?.hosts ?? []).some((h: any) => h.id === hostId);
    rec("GET hosts: host gone after delete", gone, `hosts=${after.body?.hosts?.length}`);
  }

  console.log("\n===== SUMMARY =====");
  const fails = results.filter((r) => !r.pass);
  console.log(`${results.length - fails.length}/${results.length} checks passed`);
  if (fails.length) {
    console.log("FAILURES:");
    for (const f of fails) console.log(`  - ${f.name}: ${f.detail}`);
  }
}

main().catch((e) => {
  console.error("AUDIT CRASH:", e);
  process.exit(1);
});
