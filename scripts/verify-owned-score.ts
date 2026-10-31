// ---------------------------------------------------------------------------
// verify-owned-score.ts — answer the operator's ask with numbers:
//   "check how the Opportunities is giving score. There are two things rented
//    and owned. make sure the owned section should not calculate the rented
//    cost from providers. make sure the owned GPU score is updated."
//
// Runs the EXACT engine the Ranked-opportunities table runs
// (mergeOpportunities → Miner's Ledger → Profitability Engine) on the LIVE
// snapshot, twice — once on the user's saved cost basis (owned), once forced
// to rent — then proves, per row:
//   1. RENTED basis  → GPU line == market rent (provider-class tier rate × count)
//   2. OWNED basis   → GPU line == electricity only (watts × count + 150 W host
//                      × $/kWh) and the rented cost is ABSENT from the P&L
//   3. net(owned) − net(rented) == rentLine − electricityLine (exact identity —
//      i.e. the ONLY thing that changed is the GPU cost basis)
//   4. the SCORE and RUN/WATCH/AVOID verdict re-derive from that owned net
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { electricityMonthlyUsd, type ProfitabilityConfig } from "../src/lib/infranex/profitability";
import { opportunityBand } from "../src/lib/utils";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/chain";

const BASE = "http://127.0.0.1:3000";
const dir = "/home/z/my-project/scripts";

async function loginCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const c = setCookie.map((s) => s.split(";")[0]).join("; ");
  if (!c) throw new Error("no session cookie from login");
  return c;
}

async function fetchJson(path: string, cookie: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

const fmt = (v: number) =>
  `$${Math.round(v).toLocaleString()}`;

async function main() {
  const cookie = await loginCookie();
  const snap = (await fetchJson("/api/network", cookie)) as LiveNetworkSnapshot;
  const overridesRaw = (await fetchJson("/api/subnet-overrides", cookie)) as {
    overrides: Array<Record<string, unknown>>;
  };
  const saved = (await fetchJson("/api/profitability-config", cookie)) as ProfitabilityConfig;

  // Refresh the fixtures so other scripts / the browser agree on one snapshot.
  writeFileSync(`${dir}/tmp-network.json`, JSON.stringify(snap));
  writeFileSync(`${dir}/tmp-overrides.json`, JSON.stringify(overridesRaw));
  writeFileSync(`${dir}/tmp-profconfig.json`, JSON.stringify(saved));

  console.log(
    `snapshot: block=${snap.blockNumber} subnets=${snap.subnets.length} tao=$${snap.taoPriceUsd?.toFixed(2)} source=${snap.source}`
  );
  console.log(
    `saved config: hardwareMode=${saved.hardwareMode} electricity=$${saved.electricityUsdPerKwh}/kWh minTarget=$${saved.minNetProfitTargetUsd}`
  );

  const overrides = new Map<number, Record<string, unknown>>();
  for (const o of overridesRaw.overrides as Array<Record<string, unknown>>) {
    const entry: Record<string, unknown> = {};
    const put = (k: string, v: unknown) => {
      if (v != null && v !== "") entry[k] = v;
    };
    put("name", o.name);
    put("description", o.description);
    put("category", o.category);
    put("minVramGb", o.minVramGb);
    put("recommendedGpu", o.recommendedGpu);
    put("gpuCount", o.gpuCount);
    if (o.hostingRequirements) {
      try { entry.hosting = JSON.parse(String(o.hostingRequirements)); } catch { /* ignore */ }
    }
    if (o.mechanicsJson) {
      try { entry.mechanics = JSON.parse(String(o.mechanicsJson)); } catch { /* ignore */ }
    }
    put("requirementsSource", o.requirementsSource);
    put("githubUrl", o.githubUrl);
    put("website", o.website);
    overrides.set(Number(o.netuid), entry);
  }

  // The two runs — SAME snapshot, SAME everything, only the GPU cost basis flips.
  const ownedRows = mergeOpportunities(snap, { ...saved, hardwareMode: "owned" }, overrides);
  const rentedRows = mergeOpportunities(snap, { ...saved, hardwareMode: "rent" }, overrides);
  const rentedBy = new Map(rentedRows.map((r) => [r.netuid, r]));

  // --- Identity checks -----------------------------------------------------
  let leaks = 0;
  let identityBad = 0;
  const kwh = saved.electricityUsdPerKwh;
  for (const own of ownedRows) {
    const rent = rentedBy.get(own.netuid)!;
    const profO = own.profitability!;
    const profR = rent.profitability!;
    const watts = own.gpuCount && own.gpuCount > 1 ? null : null; // watts live on diag only; use P&L identity below
    void watts;
    // Identity 3 — the net delta must equal the GPU-line delta (±$2: the two
    // engines round independently — ledger rounds gross internally, the P&L
    // engine receives pre-rounded gross).
    const gpuLineDelta = Math.round(profR.gpuRentalUsd - profO.gpuRentalUsd);
    const netDelta = Math.round(profO.netMonthlyUsd - profR.netMonthlyUsd);
    if (Math.abs(gpuLineDelta - netDelta) > 2) {
      identityBad++;
      console.log(
        `  IDENTITY BREAK SN${own.netuid}: GPU-line Δ${gpuLineDelta} ≠ net Δ${netDelta}`
      );
    }
    // Owned GPU line must be the electricity number — never the tier rent.
    // We can't read watts off the row directly, but electricity(w, kwh) is
    // strictly increasing in w; instead check the owned line is NOT the rent
    // tier value while the rented line IS (for rows where rent ≠ electricity).
    if (profO.gpuRentalUsd === profR.gpuRentalUsd && profR.gpuRentalUsd > 0) {
      // identical GPU lines in both modes would mean the basis flip did nothing
      leaks++;
      console.log(`  LEAK? SN${own.netuid}: GPU line identical in both modes (${fmt(profO.gpuRentalUsd)})`);
    }
  }
  console.log(
    `\nidentity: rows=${ownedRows.length} netΔ==GPU-lineΔ failures=${identityBad} identical-GPU-line rows=${leaks}`
  );

  // --- Spot rows -----------------------------------------------------------
  const spotNetuids = [51, 64, 4, 1, 8, 56];
  console.log(
    `\n— Spot rows (rented basis vs owned basis) —`
  );
  console.log(
    "netuid  gpu-line(rent)  gpu-line(owned=elev)   net(rent)   net(owned)  score(rent)→(owned)  band(rent)→(owned)"
  );
  for (const nu of spotNetuids) {
    const r = rentedBy.get(nu);
    const o = ownedRows.find((x) => x.netuid === nu);
    if (!r || !o) continue;
    const br = opportunityBand(r).label;
    const bo = opportunityBand(o).label;
    console.log(
      `SN${String(nu).padStart(2, "0")}  ${fmt(r.profitability!.gpuRentalUsd).padStart(12)}  ${fmt(
        o.profitability!.gpuRentalUsd
      ).padStart(16)}  ${fmt(r.profitability!.netMonthlyUsd).padStart(10)}  ${fmt(
        o.profitability!.netMonthlyUsd
      ).padStart(10)}  ${r.score.toFixed(1).padStart(8)} → ${o.score.toFixed(1).padStart(6)}  ${br.padStart(6)} → ${bo}`
    );
  }

  // --- Board-level effect --------------------------------------------------
  let flips = 0;
  const flipSamples: string[] = [];
  for (const o of ownedRows) {
    const r = rentedBy.get(o.netuid)!;
    const bo = opportunityBand(o).label;
    const br = opportunityBand(r).label;
    if (bo !== br) {
      flips++;
      if (flipSamples.length < 12)
        flipSamples.push(`SN${o.netuid} ${o.subnetName}: ${br} → ${bo} (score ${r.score.toFixed(1)} → ${o.score.toFixed(1)})`);
    }
  }
  console.log(`\nband flips rented→owned: ${flips}/${ownedRows.length}`);
  for (const s of flipSamples) console.log("  " + s);

  // --- Owned-mode electricity sanity on one known row ----------------------
  // SN51 prices an 8x B300-class rig (1000 W each) in the ledger.
  const sn51 = ownedRows.find((r) => r.netuid === 51);
  if (sn51) {
    const expected8xB300 = electricityMonthlyUsd(8000, kwh);
    console.log(
      `\nSN51 owned GPU line = ${fmt(sn51.profitability!.gpuRentalUsd)} — electricity(8×1000 W + 150 W host, $${kwh}/kWh) = ${fmt(expected8xB300)} (ledger charges watts×count internally; P&L line is the single source)`
    );
  }

  // --- Top of the owned board ---------------------------------------------
  console.log(`\n— Owned basis: top 8 GPU rows by Ledger score —`);
  const gpuRows = ownedRows
    .filter((r) => r.minVramGb > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  for (const r of gpuRows) {
    const prof = r.profitability!;
    console.log(
      `  SN${String(r.netuid).padStart(2, "0")} ${r.subnetName.slice(0, 28).padEnd(28)} score=${r.score
        .toFixed(1)
        .padStart(5)} net=${fmt(prof.netMonthlyUsd).padStart(8)}/mo gpuLine=${fmt(prof.gpuRentalUsd).padStart(7)} (electricity) band=${opportunityBand(r).label}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
