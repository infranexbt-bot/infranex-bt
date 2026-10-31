/**
 * verify-sn82-playbook.ts — E2E check that SN82 Noah now appears in the
 * Miner Playbook: login → GET /api/playbook → assert the SN82 entry exists
 * with the repo-verified Noah content and correct hardware floor.
 */
const BASE = "http://localhost:3000";

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const res = await fetch(`${BASE}/api/playbook`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) throw new Error(`/api/playbook → ${res.status}`);
  const data = (await res.json()) as {
    meta: { totalSubnets: number };
    entries: Array<Record<string, unknown>>;
  };

  console.log(`playbook entries: ${data.meta.totalSubnets}`);
  const sn82 = data.entries.find((e) => e.netuid === 82);
  if (!sn82) throw new Error("SN82 STILL MISSING from /api/playbook");

  console.log("SN82 playbook entry:");
  console.log(`  name: ${sn82.name}`);
  console.log(`  confidence: ${sn82.confidence}`);
  console.log(`  gpu: ${sn82.gpu} · minVramGb: ${sn82.minVramGb} · gpuCount: ${sn82.gpuCount}`);
  console.log(`  category: ${sn82.category}`);
  console.log(`  githubUrl: ${sn82.githubUrl}`);
  console.log(`  live.perEarningUsdPerDay: ${(sn82.live as Record<string, unknown> | null)?.perEarningUsdPerDay ?? "n/a"}`);
  console.log(`  whatItDoes: ${String(sn82.whatItDoes).slice(0, 140)}…`);
  console.log(`  keyRequirements: ${(sn82.keyRequirements as string[]).length} items`);
  console.log(`  minerJob: ${String(sn82.minerJob).slice(0, 120)}…`);
  console.log(`  top10Levers: ${(sn82.top10Levers as string[]).length} items`);
  console.log(`  sources: ${(sn82.sources as Array<{ label: string }>).map((s) => s.label).join(" | ")}`);
  console.log(`  researchedAt: ${sn82.researchedAt}`);

  const checks: Array<[string, boolean]> = [
    ["name is Noah", sn82.name === "Noah"],
    ["confidence repo-verified", sn82.confidence === "repo-verified"],
    ["gpu is CPU-only", String(sn82.gpu) === "None (CPU-only)"],
    ["minVramGb === 0", sn82.minVramGb === 0],
    ["whatItDoes mentions the Ark", /ark/i.test(String(sn82.whatItDoes))],
    ["keyRequirements >= 5", (sn82.keyRequirements as string[]).length >= 5],
    ["top10Levers >= 5", (sn82.top10Levers as string[]).length >= 5],
    ["sources include SCORING.md", (sn82.sources as Array<{ url: string }>).some((s) => s.url.includes("SCORING.md"))],
    ["minerJob mentions deposit flow", /deposit/.test(String(sn82.minerJob))],
    ["followTopMiners present", typeof sn82.followTopMiners === "string" && String(sn82.followTopMiners).length > 50],
  ];

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"} — ${name}`);
    if (!ok) failed++;
  }
  console.log(failed === 0 ? "\nE2E PASS — SN82 Noah is live in the Miner Playbook" : `\n${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
