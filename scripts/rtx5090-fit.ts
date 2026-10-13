#!/usr/bin/env node
/**
 * rtx5090-fit.ts — which subnets can an RTX 5090 (32GB, consumer Blackwell)
 * actually mine? Combines the app's own requirement data (recommendedGpu,
 * minVramGb, gpuCount, hosting, mechanics) with live economics from
 * mergeOpportunities and free-slot feasibility.
 *
 * 5090 profile: 32 GB GDDR7, consumer tier (landscape tier A), sm_120.
 */
import { PrismaClient } from "@prisma/client";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { sanitizeProfitabilityConfig } from "../src/lib/infranex/profitability";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/chain";

const db = new PrismaClient();
const VRAM_5090 = 32;

const DC_ONLY = /\b(H100|H200|H800|B200|B300|A100|MI300X|L40S|L40\b|A6000|RTX PRO 6000|6000 Ada)\b/i;
const CONSUMER_OK = /\b(3090|4090|5090|GeForce|consumer|24\s*GB|32\s*GB)\b/i;
const EXCLUDES_5090 = /\b5090\b[^.]{0,80}\b(EXCLUDED|exclude|not accepted|rejected)\b|EXCLUDED[^.]{0,80}\b5090\b/i;

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

async function main() {
  const snapRow = await db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  const subnets = safeJson<any[]>(snapRow?.subnetsJson, []);
  const snap: LiveNetworkSnapshot = {
    blockNumber: snapRow!.blockNumber,
    totalSubnets: snapRow!.totalSubnets,
    specVersion: 0,
    fetchedAt: snapRow!.createdAt.toISOString(),
    taoPriceUsd: snapRow!.taoPriceUsd,
    taoMarketCapUsd: snapRow!.taoMarketCapUsd,
    taoChange24h: snapRow!.taoChange24h,
    subnets,
    neurons: safeJson<any[]>(snapRow!.neuronsJson || "[]", []),
    source: snapRow!.source as any,
  };
  const cfgRow = await db.profitabilitySettings.findFirst();
  const overrides = new Map<number, Record<string, unknown>>();
  for (const o of await db.subnetOverride.findMany()) overrides.set(o.netuid, o as any);

  const opps = mergeOpportunities(snap, sanitizeProfitabilityConfig(cfgRow ?? undefined) as any, overrides);
  const nameOf = (n: number) => {
    const s = subnets.find((x: any) => x.netuid === n);
    return (s?.name && String(s.name).trim()) || `SN${n}`;
  };

  type Row = typeof opps[number] & { any: any };
  const rows = opps as any[];
  const out: Array<{
    netuid: number; name: string; fit: "YES-5090" | "YES-consumer" | "CHECK" | "NO";
    why: string; gpu: string; vram: number | null; count: string;
    gross: number; net: number; verdict: string; free: number | null; total: number | null;
    rewarded: number | null; burn: number | null; band: string | null;
  }> = [];

  for (const o of rows) {
    if (o.netuid === 0) continue;
    const gpu = String(o.recommendedGpu ?? "");
    const vram = o.minVramGb ?? null;
    const hosting = o.hosting ?? null;
    const text = `${gpu} ${o.workType ?? ""} ${o.category ?? ""}`;
    const live = subnets.find((x: any) => x.netuid === o.netuid) ?? {};

    // CPU-only work — no GPU needed, 5090 idle money
    if (/cpu|none/i.test(gpu) && (vram == null || vram === 0)) {
      out.push({ netuid: o.netuid, name: nameOf(o.netuid), fit: "NO", why: "CPU-only work — 5090 idle", gpu, vram, count: "", gross: o.grossMonthlyUsd ?? 0, net: o.netMonthlyUsd ?? 0, verdict: o.verdict, free: o.freeSlots, total: o.totalSlots, rewarded: live.rewardedMiners, burn: live.burnCostTao, band: null });
      continue;
    }
    // datacenter-only requirement, no consumer path
    if (DC_ONLY.test(gpu) && !CONSUMER_OK.test(gpu)) {
      out.push({ netuid: o.netuid, name: nameOf(o.netuid), fit: "NO", why: "datacenter GPU required", gpu, vram, count: "", gross: o.grossMonthlyUsd ?? 0, net: o.netMonthlyUsd ?? 0, verdict: o.verdict, free: o.freeSlots, total: o.totalSlots, rewarded: live.rewardedMiners, burn: live.burnCostTao, band: null });
      continue;
    }
    // explicit exclusion
    if (EXCLUDES_5090.test(gpu)) {
      out.push({ netuid: o.netuid, name: nameOf(o.netuid), fit: "NO", why: "5090 explicitly excluded by subnet", gpu, vram, count: "", gross: o.grossMonthlyUsd ?? 0, net: o.netMonthlyUsd ?? 0, verdict: o.verdict, free: o.freeSlots, total: o.totalSlots, rewarded: live.rewardedMiners, burn: live.burnCostTao, band: null });
      continue;
    }
    const vrOk = vram != null ? vram <= VRAM_5090 : true;
    if (!vrOk) {
      out.push({ netuid: o.netuid, name: nameOf(o.netuid), fit: "NO", why: `needs >=${vram}GB (> 32)`, gpu, vram, count: "", gross: o.grossMonthlyUsd ?? 0, net: o.netMonthlyUsd ?? 0, verdict: o.verdict, free: o.freeSlots, total: o.totalSlots, rewarded: live.rewardedMiners, burn: live.burnCostTao, band: null });
      continue;
    }
    const explicit5090 = /\b5090\b/i.test(gpu);
    const consumerPath = CONSUMER_OK.test(gpu);
    const fit = explicit5090 ? "YES-5090" : consumerPath ? "YES-consumer" : "CHECK";
    const why = explicit5090
      ? "5090 explicitly named in requirements"
      : consumerPath
        ? "consumer 24GB-class accepted (5090 >= floor)"
        : `vram<=32 OK; model unspecified (${gpu.slice(0, 40) || "?"}) — verify stack supports sm_120`;
    out.push({ netuid: o.netuid, name: nameOf(o.netuid), fit, why, gpu, vram, count: o.gpuCount ? `x${o.gpuCount}` : "", gross: o.grossMonthlyUsd ?? 0, net: o.netMonthlyUsd ?? 0, verdict: o.verdict, free: o.freeSlots, total: o.totalSlots, rewarded: live.rewardedMiners, burn: live.burnCostTao, band: null });
  }

  const byFit = (f: string) => out.filter((r) => r.fit === f).sort((a, b) => b.net - a.net);
  console.log(`=== RTX 5090 (32GB, sm_120) fit — ${out.length} subnets scored @ block ${snap.blockNumber}, TAO $${snap.taoPriceUsd?.toFixed(2)} ===\n`);
  for (const f of ["YES-5090", "YES-consumer", "CHECK"]) {
    const rows2 = byFit(f);
    console.log(`--- ${f} (${rows2.length}) ---`);
    for (const r of rows2.slice(0, 12)) {
      const whale = r.rewarded != null && r.rewarded <= 2 ? ` [whale-risk: ${r.rewarded} rewarded]` : "";
      const full = r.free != null && r.free <= 0 ? " [FULL]" : ` [free ${r.free}/${r.total}]`;
      console.log(`SN${String(r.netuid).padEnd(4)} ${r.name.padEnd(13)} net $${Math.round(r.net).toLocaleString()}/mo  gross $${Math.round(r.gross).toLocaleString()}/mo ${r.verdict ?? ""}${full}${whale}`);
      console.log(`      ${r.why} | GPU req: ${r.gpu.slice(0, 70)}${r.count} | burn ${r.burn ?? "?"} TAO`);
    }
    console.log();
  }
  const no = byFit("NO");
  console.log(`--- NO for 5090 (${no.length}) — brief ---`);
  const noReasons = new Map<string, number>();
  for (const r of no) noReasons.set(r.why.replace(/>=\d+GB \(> 32\)/, "needs >32GB"), (noReasons.get(r.why.replace(/>=\d+GB \(> 32\)/, "needs >32GB")) ?? 0) + 1);
  for (const [why, n] of [...noReasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)} × ${why}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
