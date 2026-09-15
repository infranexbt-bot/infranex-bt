// Authenticated end-to-end check of the requirements profiler (OVERLAY-1).
// Usage: bun scripts/test-profiler-e2e.ts
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3000";
const USERS: Array<{ userId: string; code: string }> = JSON.parse(
  fs.readFileSync(path.join(path.dirname(process.argv[1] ?? ""), "users.local.json"), "utf8")
);

async function login(userId: string, code: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, code }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const c = cookies.find((x) => x.startsWith("infranex_session="));
  return c ? c.split(";")[0] : "";
}

const creds = USERS.find((u) => u.userId === "ops01") ?? USERS[0];
const cookie = await login(creds.userId, creds.code);
if (!cookie) {
  console.error("FAIL — login failed");
  process.exit(1);
}

async function getProfile(netuid: number) {
  const res = await fetch(`${BASE}/api/devops/subnet-requirements?netuid=${netuid}&refresh=1`, {
    headers: { cookie },
  });
  return res.json() as Promise<Record<string, unknown>>;
}

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${cond ? "" : `: ${detail}`}`);
  if (!cond) failures++;
}

// 1) Chain+github profiler run (netuid 8 — Tau/Propimage etc.)
const r1 = (await getProfile(8)) as {
  profile?: Record<string, unknown>;
  error?: string;
};
const p1 = r1.profile;
if (!p1) {
  console.error("FAIL — no profile returned:", r1.error);
  process.exit(1);
}
console.log(JSON.stringify({
  subnetName: p1.subnetName,
  repoUrl: p1.repoUrl,
  dockerImage: p1.dockerImage,
  dockerfileFound: p1.dockerfileFound,
  entrypoint: p1.entrypoint,
  minVramGb: p1.minVramGb,
  sources: p1.sources,
  confidence: p1.confidence,
  notes: (p1.notes as string[]).slice(0, 3),
}, null, 2));
check("profile has sources array incl. chain/github", Array.isArray(p1.sources) && (p1.sources as string[]).length > 0);
check("profile repoUrl is a canonical https github link", !p1.repoUrl || /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(p1.repoUrl as string));
check("dockerImage, if present, has no ${VAR}", !p1.dockerImage || !(p1.dockerImage as string).includes("${"));
check("confidence is high|medium|low", ["high", "medium", "low"].includes(p1.confidence as string));

// 2) OVERLAY-1: save an override githubUrl → profile must re-pull from it
const netuid = 8;
const put = await fetch(`${BASE}/api/subnets/${netuid}/override`, {
  method: "PUT",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ githubUrl: "https://github.com/opentensor/bittensor" }),
});
check("override PUT is 200", put.status === 200, `status=${put.status}`);

const r2 = (await getProfile(netuid)) as { profile?: Record<string, unknown> };
const p2 = r2.profile;
check("override repoUrl wins", p2?.repoUrl === "https://github.com/opentensor/bittensor", `repoUrl=${p2?.repoUrl}`);
check("override source flagged", Array.isArray(p2?.sources) && (p2.sources as string[]).includes("override"));
check("override note present", Array.isArray(p2?.notes) && (p2.notes as string[]).some((n) => n.includes("override")));

// 3) invalid override URL falls back to chain + warns
const putBad = await fetch(`${BASE}/api/subnets/${netuid}/override`, {
  method: "PUT",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ githubUrl: "https://gitlab.com/org/repo" }),
});
const r3 = (await getProfile(netuid)) as { profile?: Record<string, unknown> };
const p3 = r3.profile;
check("non-github override rejected in note", Array.isArray(p3?.notes) && (p3.notes as string[]).some((n) => n.includes("not a valid github.com repo link")));

// 4) cleanup: remove override (profile cache dropped too)
const del = await fetch(`${BASE}/api/subnets/${netuid}/override`, { method: "DELETE", headers: { cookie } });
check("override DELETE is 200", del.status === 200, `status=${del.status}`);
const r4 = (await getProfile(netuid)) as { profile?: Record<string, unknown> };
const p4 = r4.profile;
check("after DELETE, override source gone", !Array.isArray(p4?.sources) || !(p4.sources as string[]).includes("override"));

process.exit(failures > 0 ? 1 : 0);
