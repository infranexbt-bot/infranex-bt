// SN51 verdict under the live engine (post stale-gate fix) — mirrors the
// browser pipeline: network + overrides + config → mergeOpportunities →
// computeMinePick + computeRentEarn.
const BASE = "http://localhost:3000";

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const get = async (p: string) =>
    (await fetch(`${BASE}${p}`, { headers: { cookie }, cache: "no-store" })).json();

  const snap = await get("/api/network");
  const overrides = await get("/api/subnet-overrides");
  const config = await get("/api/profitability-config");

  // Build the override map exactly like use-network does (JSON.parse hosting).
  const rows = (overrides as any).overrides ?? (overrides as any).rows ?? overrides;
  const map = new Map<string, any>();
  for (const r of rows as any[]) map.set(String(r.netuid), {
    ...r,
    hostingRequirements: r.hostingRequirements ? JSON.parse(r.hostingRequirements) : null,
  });

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const { computeMinePick } = await import("../src/lib/infranex/mine-pick");
  const { computeRentEarn } = await import("../src/lib/infranex/rent-earn");

  const merged = mergeOpportunities(snap, config, map as any);
  const o = merged.find((x: any) => x.netuid === 51);
  if (!o) { console.log("SN51 not in merged rows"); return; }
  const pick = computeMinePick(o);
  const rent = computeRentEarn(o);

  console.log("=== SN51 verdict (active cost basis:", config.hardwareMode, ") ===");
  console.log("name:", o.subnetName, "| minVramGb:", o.minVramGb, "| recommendedGpu:", o.recommendedGpu);
  console.log("ledger netMonthlyUsd:", Math.round(o.netMonthlyUsd ?? 0), "| meetsMinimum:", o.meetsMinimum);
  console.log("hardware:", pick.hardware, "| conviction:", pick.conviction, "| band:", pick.band);
  console.log("reasons:", pick.reasons.join(" | "));
  console.log("rent-earn: rentable:", rent.rentable, "| band:", rent.band, "| score:", rent.score);
  console.log("  earnChancePct:", rent.earnChancePct, "| top10Take:", rent.top10TakePct, "| whaleMean:", rent.whaleMean);
  console.log("  new-entrant EV:", rent.expectedNetMonthlyUsd, "| notes:", rent.notes.join(" | "));
}

main().catch((e) => { console.error(e); process.exit(1); });
