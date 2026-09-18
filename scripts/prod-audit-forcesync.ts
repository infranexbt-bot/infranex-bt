// Force-sync end-to-end test: re-scrape all subnet repos from GitHub,
// persist overrides, report per-status counts + duration.
async function main() {
  const login = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const t0 = Date.now();
  const r = await fetch("http://localhost:3000/api/subnets/sync-all?force=true", {
    method: "POST",
    headers: { cookie },
    signal: AbortSignal.timeout(540000),
  });
  const ms = Date.now() - t0;
  console.log("force sync:", r.status, `${(ms / 1000).toFixed(1)}s`);
  const j = await r.json().catch(() => null);
  if (j?.results) {
    const s = j.results.reduce((a: any, x: any) => ((a[x.status] = (a[x.status] || 0) + 1), a), {});
    console.log("statuses:", JSON.stringify(s), "total:", j.results.length);
    for (const x of j.results.filter((y: any) => y.status === "error").slice(0, 10))
      console.log(`  ERR sn${x.netuid} ${x.githubUrl} -> ${x.error}`);
    for (const x of j.results.filter((y: any) => y.status === "scraped").slice(0, 8))
      console.log(`  OK  sn${x.netuid} ${(x.description || "").slice(0, 80)}`);
  } else {
    console.log("body:", j ? JSON.stringify(j).slice(0, 400) : "non-json");
  }
}
main().catch((e) => console.log("ERR", e.message));
