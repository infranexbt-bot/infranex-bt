import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rows: any[] = await db.$queryRawUnsafe(
  `SELECT blockNumber, taoPriceUsd, subnetsJson, createdAt FROM ChainSnapshot WHERE source='live' ORDER BY createdAt ASC`
);
console.log("snapshots:", rows.length);
const pts: Array<{ d: string; block: number; tao: number; emT: number; price: number; pool: number; aIn: number; aOut: number }> = [];
for (const r of rows) {
  try {
    const j = JSON.parse(r.subnetsJson);
    const s32 = (Array.isArray(j) ? j : j.subnets || []).find((x: any) => x.netuid === 32);
    if (!s32) continue;
    pts.push({
      d: new Date(r.createdAt).toISOString().slice(0, 10),
      block: r.blockNumber,
      tao: r.taoPriceUsd,
      emT: +(s32.emissionTaoPerDay ?? 0).toFixed(2),
      price: +(s32.movingPrice ?? 0).toFixed(5),
      pool: Math.round(s32.subnetTao ?? 0),
      aIn: Math.round(s32.alphaIn ?? 0),
      aOut: Math.round(s32.alphaOut ?? 0),
    });
  } catch {}
}
// daily downsample: keep first row per date
const byDay = new Map<string, any>();
for (const p of pts) if (!byDay.has(p.d)) byDay.set(p.d, p);
const daily = [...byDay.values()];
console.log("days with data:", daily.length);
for (const p of daily) console.log(`${p.d} blk${p.block} em${String(p.emT).padStart(6)} TAO/d price ${p.price} pool ${p.pool} aIn ${p.aIn} aOut ${p.aOut}`);
await db.$disconnect();
