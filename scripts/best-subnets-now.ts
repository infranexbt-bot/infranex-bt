#!/usr/bin/env node
/**
 * best-subnets-now.ts — answer "best subnets to earn" using the SAME engine
 * as the Dashboard picker: mergeOpportunities -> rankMinePicks.
 * Prints PRIME/READY picks with yields + the gated top-yielders with reasons.
 */
import { PrismaClient } from "@prisma/client";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { rankMinePicks } from "../src/lib/infranex/mine-pick";
import { sanitizeProfitabilityConfig } from "../src/lib/infranex/profitability";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/chain";

const db = new PrismaClient();

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

async function main() {
  const snapRow = await db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  if (!snapRow) { console.log("no snapshot"); return; }
  const subnets = safeJson<any[]>(snapRow.subnetsJson, []);
  const snap: LiveNetworkSnapshot = {
    blockNumber: snapRow.blockNumber,
    totalSubnets: snapRow.totalSubnets,
    specVersion: 0,
    fetchedAt: snapRow.createdAt.toISOString(),
    taoPriceUsd: snapRow.taoPriceUsd,
    taoMarketCapUsd: snapRow.taoMarketCapUsd,
    taoChange24h: snapRow.taoChange24h,
    subnets,
    neurons: safeJson<any[]>(snapRow.neuronsJson || "[]", []),
    source: snapRow.source as "live" | "partial" | "error",
  };

  const cfgRow = await db.profitabilitySettings.findFirst();
  const profConfig = cfgRow ? sanitizeProfitabilityConfig(cfgRow) : undefined;

  const overrides = new Map<number, Record<string, unknown>>();
  for (const o of await db.subnetOverride.findMany()) overrides.set(o.netuid, o as any);

  const opps = mergeOpportunities(snap, profConfig as any, overrides);
  const picks = rankMinePicks(opps as any);

  // display names from chain identity (override > chain)
  const nameOf = (n: number) => {
    const o = overrides.get(n) as any;
    if (o?.name) return String(o.name);
    const s = subnets.find((x: any) => x.netuid === n);
    return (s?.name && String(s.name).trim()) || `SN${n}`;
  };
  const gpuOf = (n: number) => {
    const o = overrides.get(n) as any;
    return [o?.recommendedGpu, o?.minVramGb ? `>=${o.minVramGb}GB` : null, o?.gpuCount ? `x${o.gpuCount}` : null]
      .filter(Boolean).join(" ") || "?";
  };

  const usd = snap.taoPriceUsd || 0;
  console.log(`=== SNAPSHOT block ${snap.blockNumber} | TAO $${usd.toFixed(2)} | ${snap.source} | ${snap.fetchedAt} ===`);
  console.log(`opportunities ranked: ${opps.length}\n`);

  const bandOf = (b: string) => picks.filter((p) => p.band === b);
  for (const band of ["PRIME", "READY"] as const) {
    const rows = bandOf(band).sort((a, b) => b.conviction - a.conviction).slice(0, 8);
    console.log(`--- ${band} (${bandOf(band).length} total) ---`);
    for (const p of rows) {
      const o = p.o as any;
      const gross = `$${Math.round(o.grossMonthlyUsd ?? 0).toLocaleString()}/mo gross`;
      const net = `$${Math.round(o.netMonthlyUsd ?? 0).toLocaleString()}/mo net`;
      const tao = `${(o.perEarningMeanDailyTao ?? 0).toFixed(2)} TAO/d`;
      const slots = o.freeSlots != null ? `slots ${o.freeSlots}/${o.totalSlots}` : "";
      console.log(
        `SN${String(o.netuid).padEnd(4)} ${nameOf(o.netuid).padEnd(12)} conv=${String(Math.round(p.conviction)).padEnd(3)} ${net.padEnd(12)} (gross ${gross.padEnd(16)}, ${tao}) ${o.verdict ?? ""} ${slots} GPU: ${gpuOf(o.netuid).slice(0, 55)}`
      );
      if (p.reasons?.length) console.log(`      -> ${p.reasons.slice(0, 2).join(" | ")}`);
    }
    console.log();
  }

  // Top yielders that got gated — show why (whale-mean trap etc.)
  const marg = bandOf("MARGINAL").sort((a, b) => b.conviction - a.conviction).slice(0, 6);
  console.log(`--- MARGINAL (${bandOf("MARGINAL").length} total) — viable with own hardware / caution ---`);
  for (const p of marg) {
    const o = p.o as any;
    console.log(
      `SN${String(o.netuid).padEnd(4)} ${nameOf(o.netuid).padEnd(12)} conv=${String(Math.round(p.conviction)).padEnd(3)} net $${Math.round(o.netMonthlyUsd ?? 0).toLocaleString()}/mo GPU: ${gpuOf(o.netuid).slice(0, 50)}`
    );
    if (p.reasons?.length) console.log(`      -> ${p.reasons.slice(0, 2).join(" | ")}`);
  }
  console.log();

  const gated = picks
    .filter((p) => p.band === "NO-GO" || p.band === "MARGINAL")
    .sort((a, b) => ((b.o as any).grossMonthlyUsd ?? 0) - ((a.o as any).grossMonthlyUsd ?? 0))
    .slice(0, 6);
  console.log("--- top-yield GATED (NO-GO / MARGINAL) — do not chase blindly ---");
  for (const p of gated) {
    const o = p.o as any;
    const failed = (p.diligence?.stages ?? []).filter((st: any) => st && (st.status === "fail" || st.status === "warn"));
    const failTxt = failed.slice(0, 2).map((st: any) => `${st.status.toUpperCase()} s${st.n} ${st.label}: ${st.value}`).join(" | ") || (p.reasons?.[0] ?? p.band);
    console.log(
      `SN${String(o.netuid).padEnd(4)} ${nameOf(o.netuid).padEnd(12)} ${p.band.padEnd(9)} gross $${Math.round(o.grossMonthlyUsd ?? 0).toLocaleString()}/mo -> ${String(failTxt).slice(0, 95)}`
    );
  }

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
