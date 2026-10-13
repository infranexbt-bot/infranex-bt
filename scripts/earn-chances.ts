#!/usr/bin/env node
/**
 * earn-chances.ts — "which subnets have the CHANCES to earn rewards?"
 *
 * Different question than "which pay the most". A new entrant earns only if:
 *  1. There is a seat (minersCount < maxUids) OR displacement is realistic
 *  2. Rewards are BROAD (rewardedMiners/minersCount high) — not a whale lottery
 *  3. Incentive is not hoarded by top-10 (top10IncentiveShare)
 *  4. The per-miner pool is worth it (minerEmissionTaoPerDay / rewardedMiners)
 *  5. Emission is on and alpha is realizable (rewardRealizability)
 *
 * Output tiers:
 *   A  OPEN + BROAD    — joinable now, rewards spread across many miners
 *   B  OPEN + STEEP    — joinable now, but tail earns little (concentrated)
 *   C  FULL + BROAD    — must displace weakest UID, but if in: broad rewards
 *   D  WHALE LOTTERY   — few rewarded miners, headline number is a trap
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

async function main() {
  const snapRow = await db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  if (!snapRow) { console.log("no snapshot"); return; }
  const subnets = safeJson<any[]>(snapRow.subnetsJson, []);
  const tao = snapRow.taoPriceUsd || 0;

  const overrides = new Map<number, any>();
  for (const o of await db.subnetOverride.findMany()) overrides.set(o.netuid, o);

  const nameOf = (n: number) => {
    const o = overrides.get(n);
    if (o?.name) return String(o.name);
    const s = subnets.find((x: any) => x.netuid === n);
    return (s?.name && String(s.name).trim()) || `SN${n}`;
  };
  const hwOf = (n: number) => {
    const o = overrides.get(n) || {};
    const parts = [o.recommendedGpu, o.minVramGb ? `>=${o.minVramGb}GB` : null, o.gpuCount ? `x${o.gpuCount}` : null].filter(Boolean);
    return parts.join(" ") || (o.workType === "cpu" ? "CPU" : "?");
  };

  type Row = {
    netuid: number; name: string; hw: string;
    miners: number; maxUids: number; open: number;
    rewarded: number; breadth: number; top10: number; median: number;
    poolTaoDay: number; perMinerTaoDay: number; perMinerUsdMo: number;
    realizability: number; emissionOn: boolean; score: number; tier: string;
    notes: string[];
  };

  const rows: Row[] = [];
  for (const s of subnets) {
    const miners = s.minersCount ?? 0;
    const maxUids = s.maxUids ?? 256;
    if (!s.emissionEnabled) continue;                 // no emission = no rewards, skip
    const pool = s.minerEmissionTaoPerDay ?? 0;       // TAO/day flowing to miners
    if (pool <= 0) continue;
    const rewarded = s.rewardedMiners ?? 0;
    const breadth = miners > 0 ? rewarded / miners : 0;
    const top10 = s.top10IncentiveShare ?? 1;
    const median = s.incentiveMedianShare ?? 0;
    const open = Math.max(0, maxUids - miners);
    const perMinerTaoDay = rewarded > 0 ? pool / rewarded : pool / Math.max(miners, 1);
    const perMinerUsdMo = perMinerTaoDay * 30 * tao;
    const real = s.rewardRealizability ?? 1;

    let score = 0;
    const notes: string[] = [];

    // seat
    if (open > 0) score += 40; else notes.push("full — must displace weakest UID");

    // breadth
    if (breadth >= 0.7) score += 25;
    else if (breadth >= 0.4) score += 15;
    else if (breadth >= 0.15) { score += 8; notes.push(`only ${rewarded}/${miners} miners earn`); }
    else { score += 0; notes.push(`whale lottery: ${rewarded}/${miners} rewarded`); }

    // concentration
    if (top10 <= 0.5) score += 15;
    else if (top10 <= 0.75) { score += 8; notes.push(`top-10 take ${(top10 * 100).toFixed(0)}%`); }
    else { score += 0; notes.push(`top-10 hoard ${(top10 * 100).toFixed(0)}%`); }

    // per-miner pool
    if (perMinerUsdMo >= 600) score += 20;
    else if (perMinerUsdMo >= 150) score += 12;
    else if (perMinerUsdMo >= 30) score += 6;
    else notes.push(`avg miner only ~$${Math.round(perMinerUsdMo)}/mo`);

    // realizability penalty
    if (real < 0.5) { score -= 10; notes.push(`alpha realizability ${(real * 100).toFixed(0)}%`); }

    if (open === 0) {
      // full subnets: can't join without displacement — cap tier at C
      score = Math.min(score, 55);
    }

    let tier: string;
    if (open > 0 && breadth >= 0.4 && top10 <= 0.75 && perMinerUsdMo >= 150) tier = "A";
    else if (open > 0) tier = "B";
    else if (breadth >= 0.4 && top10 <= 0.75) tier = "C";
    else tier = "D";

    rows.push({
      netuid: s.netuid, name: nameOf(s.netuid), hw: hwOf(s.netuid),
      miners, maxUids, open, rewarded, breadth, top10, median,
      poolTaoDay: pool, perMinerTaoDay, perMinerUsdMo,
      realizability: real, emissionOn: true, score: Math.max(0, score), tier, notes,
    });
  }

  const order = { A: 0, B: 1, C: 2, D: 3 } as const;
  rows.sort((a, b) => order[a.tier] - order[b.tier] || b.score - a.score);

  const tierTitle: Record<string, string> = {
    A: "A — REAL CHANCES: open seats + broad rewards + worthwhile per-miner pool",
    B: "B — OPEN BUT STEEP: seat available, rewards concentrated or pool thin",
    C: "C — FULL BUT MERITOCRATIC: must displace a UID; rewards broad if you get in",
    D: "D — WHALE LOTTERY: headline TAO is real but ~all of it goes to few miners",
  };

  console.log(`=== EARN-CHANCES | block ${snapRow.blockNumber} | TAO $${tao.toFixed(2)} | ${snapRow.createdAt.toISOString()} ===`);
  console.log(`emitting subnets evaluated: ${rows.length}\n`);

  for (const t of ["A", "B", "C", "D"] as const) {
    const rs = rows.filter((r) => r.tier === t);
    console.log(`--- TIER ${tierTitle[t]} (${rs.length}) ---`);
    for (const r of rs.slice(0, 12)) {
      console.log(
        `SN${String(r.netuid).padEnd(4)} ${r.name.padEnd(14)} score=${String(Math.round(r.score)).padStart(3)} seats ${r.miners}/${r.maxUids} rewarded ${String(r.rewarded).padStart(3)} top10 ${(r.top10 * 100).toFixed(0)}%  ~$${Math.round(r.perMinerUsdMo).toLocaleString()}/mo avg-miner  GPU: ${r.hw.slice(0, 40)}`
      );
      if (r.notes.length) console.log(`      -> ${r.notes.slice(0, 2).join(" | ")}`);
    }
    console.log();
  }

  // Cross-reference: which of these does the platform's own picker flag as GO?
  console.log("--- platform picker verdicts for Tier A/B (from best-subnets-now) ---");
  console.log("(picker already showed: SN61 RedTeam = only PRIME; SN35/SN116/SN120/SN68 gated)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
