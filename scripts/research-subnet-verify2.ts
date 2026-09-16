/**
 * Final follow-ups for the hosting audit:
 *  - SN4 Targon: section headers around bare-metal/TEE claims
 *  - SN51 lium: dstacktee README — is TDX required or optional for providers?
 *  - SN71 Leadpoet: "TEE Attestation Verification" section context
 *  - SN33 ReadyAI: static-ip hit context
 *  - Dead/404 check for repos that returned no README:
 *    latent-to/cacheon, center196/feval, actual-computer/actual-subnet-95,
 *    unarbos/albedo, AffineFoundation/affine, CookingTao org
 * Run: bun scripts/research-subnet-verify2.ts
 */

async function raw(owner: string, repo: string, path = "README.md"): Promise<string | null> {
  for (const branch of ["HEAD", "main", "master"]) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, {
        headers: { "User-Agent": "infranex-bt-audit/1.0" },
      });
      if (res.ok) return await res.text();
    } catch { /* next */ }
  }
  return null;
}

const out: string[] = [];

function dumpAround(md: string, grep: RegExp, label: string, ctx = 6, maxWindows = 6) {
  out.push(`\n==== ${label} ====`);
  const lines = md.split("\n");
  const hits: number[] = [];
  lines.forEach((l, i) => { if (grep.test(l)) hits.push(i); });
  if (!hits.length) { out.push("  (no matches)"); return; }
  const wins: Array<[number, number]> = [];
  for (const i of hits) {
    const last = wins[wins.length - 1];
    if (last && i - last[1] <= 2) last[1] = i;
    else wins.push([i, i]);
  }
  for (const [a, b] of wins.slice(0, maxWindows)) {
    out.push(`--- lines ${a + 1}-${b + 1} ---`);
    for (let i = Math.max(0, a - ctx); i <= Math.min(lines.length - 1, b + ctx); i++) {
      const t = lines[i].replace(/[#*`>|]/g, "").trim();
      if (t) out.push(`  ${i + 1 >= a && i <= b ? "»" : " "} L${i + 1}: ${t.slice(0, 220)}`);
    }
  }
}

// --- SN4 Targon: show section headers + the bare-metal line's section ---
const targon = await raw("manifold-inc", "targon");
if (targon) {
  out.push("\n################ SN4 Targon — all section headers ################");
  targon.split("\n").forEach((l, i) => {
    if (/^#{1,3} /.test(l)) out.push(`  L${i + 1}: ${l.trim().slice(0, 140)}`);
  });
  dumpAround(targon, /bare[ -]?metal/i, "SN4 Targon — bare metal context", 12);
  dumpAround(targon, /require|must/i, "SN4 Targon — requirement lines", 2, 8);
}

// --- SN51 lium dstacktee README ---
const dstack = await raw("Datura-ai", "lium-io", "neurons/executor/dstacktee/README.md")
  ?? await raw("Datura-ai", "lium-io", "dstacktee/README.md");
if (dstack) {
  dumpAround(dstack, /require|must|optional|attest|TDX|TEE/i, "SN51 lium dstacktee/README.md", 3, 10);
} else {
  out.push("\n==== SN51 lium dstacktee/README.md — NOT FOUND ====");
}

// --- SN71 Leadpoet TEE section ---
const leadpoet = await raw("leadpoet", "leadpoet");
if (leadpoet) {
  dumpAround(leadpoet, /TEE Attestation Verification/i, "SN71 Leadpoet — TEE Attestation section", 10, 3);
}

// --- SN33 ReadyAI static ip ---
const readyai = await raw("afterpartyai", "bittensor-conversation-genome-project");
if (readyai) {
  dumpAround(readyai, /static ip/i, "SN33 ReadyAI — static ip context", 5, 3);
}

// --- dead/404 checks ---
out.push("\n################ Repo existence checks ################");
const check = async (name: string, url: string) => {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "infranex-bt-audit/1.0" }, redirect: "follow" });
    out.push(`  ${name}: HTTP ${res.status} ${res.status === 200 ? "(exists)" : "(missing/private)"}`);
  } catch (e) {
    out.push(`  ${name}: fetch error ${e}`);
  }
};
await check("latent-to/cacheon (SN14)", "https://github.com/latent-to/cacheon");
await check("center196/feval (SN47)", "https://github.com/center196/feval");
await check("actual-computer/actual-subnet-95 (SN95)", "https://github.com/actual-computer/actual-subnet-95");
await check("unarbos/albedo (SN97)", "https://github.com/unarbos/albedo");
await check("AffineFoundation/affine (SN120)", "https://github.com/AffineFoundation/affine");
await check("CookingTao org (SN122)", "https://github.com/CookingTao");

await Bun.write("/tmp/subnet-verify2.txt", out.join("\n"));
console.log(out.join("\n").slice(0, 26000));
