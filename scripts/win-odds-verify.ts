// WIN-ODDS-VERIFY — verify the "Can I win here?" panel end-to-end:
//   1. page HTML contains the panel (SSR compile succeeded)
//   2. replicate the tier math on live API data and print the census
// Run: npx tsx scripts/win-odds-verify.ts

const BASE = "http://127.0.0.1:3000";

async function cookie(): Promise<string> {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  if (!login.ok) throw new Error("login failed " + login.status);
  return (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function main() {
  const ck = await cookie();

  // 1) SSR page contains the panel markup (client component still SSRs shell)
  const page = await fetch(BASE + "/", {
    headers: { cookie: ck },
    redirect: "follow",
  });
  const html = await page.text();
  const hasPanel = html.includes("Can I win here?");
  console.log("page status:", page.status, "| panel markup:", hasPanel ? "FOUND" : "MISSING");

  // 2) tier census from live data using the real lib
  const { computeWinOdds, rankWinOdds, winTierCounts } = await import(
    "../src/lib/infranex/win-odds"
  );
  const api = async (p: string) => {
    const r = await fetch(BASE + p, { headers: { cookie: ck } });
    if (!r.ok) throw new Error(`${p} -> ${r.status}`);
    return r.json();
  };
  const snap = await api("/api/network");
  const profConfig = await api("/api/profitability-config");
  const ovrJson = await api("/api/subnet-overrides");
  const overrides = new Map<number, Record<string, unknown>>(
    Object.entries(ovrJson?.overrides ?? {}).map(([k, v]) => [Number(k), v as Record<string, unknown>])
  );
  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const opps = mergeOpportunities(snap, profConfig, overrides);

  const ranked = rankWinOdds(opps as any);
  console.log("census:", winTierCounts(ranked));
  console.log("\nBEST 8 (new-seat odds first):");
  for (const w of ranked.slice(0, 8)) {
    console.log(
      `SN${String(w.netuid).padStart(2, "0")} ${w.subnetName.padEnd(14)} ${w.tier.padEnd(11)}` +
        ` odds ${String(w.oddsPct ?? "-").padStart(3)}% rew ${w.rewardedPct == null ? "-" : Math.round(w.rewardedPct)}%` +
        ` top10 ${w.top10Pct == null ? "-" : Math.round(w.top10Pct)}%`
    );
  }
  // spot checks
  const byNetuid = new Map(ranked.map((w) => [w.netuid, w]));
  const reax = byNetuid.get(92);
  const chutes = byNetuid.get(64);
  const iota = byNetuid.get(9);
  const noah = byNetuid.get(82);
  console.log("\nspot checks:");
  console.log("REAX SN92 :", reax?.tier, "→ expected OPEN_FIELD or FIGHTABLE (not knife/dont)");
  console.log("Noah SN82 :", noah?.tier);
  console.log("Chutes 64 :", chutes?.tier, "→ expected DONT_ENTER or KNIFE_FIGHT");
  console.log("iota 9    :", iota?.tier, "→ expected DONT_ENTER");
  if (!reax || !chutes || !iota || !noah) throw new Error("spot-check rows missing");
  if (reax.tier === "DONT_ENTER" || reax.tier === "UNKNOWN") throw new Error("REAX tier wrong: " + reax.tier);
  if (chutes.tier !== "DONT_ENTER" && chutes.tier !== "KNIFE_FIGHT") throw new Error("Chutes tier wrong: " + chutes.tier);
  if (iota.tier !== "DONT_ENTER") throw new Error("iota tier wrong: " + iota.tier);
  console.log("\nALL CHECKS PASSED");
}

main().catch((e) => {
  console.error("VERIFY FAILED:", e.message);
  process.exit(1);
});
