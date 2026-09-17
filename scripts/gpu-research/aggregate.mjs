/**
 * INFRANEX GPU research — Step 4: aggregate rankings.
 * View A: verified GPU-model mentions (README + min_compute.yml) — miner-context + any-context
 * View B: VRAM-class demand (miner-side explicit minimums: min_compute.yml, README lines, app classifier)
 * View C: app profiler classifier cross-check
 * -> rankings.json
 */
import fs from "fs";

const DIR = "/home/z/my-project/scripts/gpu-research";
const ev = JSON.parse(fs.readFileSync(`${DIR}/subnet-evidence.json`, "utf8"));
const TAO = ev[0]?.taoPriceUsd ?? 251;

// ---------- helpers ----------
const usd = (taoPerDay) => (taoPerDay ?? 0) * TAO;

function canonFromText(text) {
  // reuse the extractor's catalog via its own scan: import not possible (not a module export),
  // so re-require by running pattern matching inline (duplicate minimal logic)
  return text;
}

// VRAM -> GPU-class buckets (miner buys hardware by VRAM class)
function vramClass(gb) {
  if (gb == null) return null;
  if (gb <= 12) return "8–12 GB (3060/4070-class)";
  if (gb <= 17) return "16 GB (4060 Ti 16G / 4080 / 5080-class)";
  if (gb <= 24) return "24 GB (RTX 4090 / 3090 / 5090-class)";
  if (gb <= 48) return "32–48 GB (A6000 / L40S / A100 40G-class)";
  return "80 GB+ (A100 80G / H100 / H200-class)";
}
const CLASS_ORDER = ["8–12 GB (3060/4070-class)", "16 GB (4060 Ti 16G / 4080 / 5080-class)", "24 GB (RTX 4090 / 3090 / 5090-class)", "32–48 GB (A6000 / L40S / A100 40G-class)", "80 GB+ (A100 80G / H100 / H200-class)"];

// ---------- View A: verified GPU mentions ----------
// per GPU: tiered subnet accounting (1=requirement, 2=miner-supported, 3=mention)
const A = {}; // canon -> tiered accounting
for (const s of ev) {
  for (const g of s.gpus) {
    const a = (A[g.gpu] ??= {
      reqSubnets: [], supportedSubnets: [], anySubnets: [],
      reqTaoPerDay: 0, anyTaoPerDay: 0, evidence: [],
    });
    const t = g.tier ?? 3;
    if (!a.anySubnets.includes(s.netuid)) {
      a.anySubnets.push(s.netuid);
      a.anyTaoPerDay += s.minerEmissionTaoPerDay ?? 0;
    }
    if (t === 1 && !a.reqSubnets.includes(s.netuid)) {
      a.reqSubnets.push(s.netuid);
      a.reqTaoPerDay += s.minerEmissionTaoPerDay ?? 0;
    }
    if (t <= 2 && !a.supportedSubnets.includes(s.netuid)) a.supportedSubnets.push(s.netuid);
    a.evidence.push({
      netuid: s.netuid, name: s.name, gpu: g.gpu, file: g.file, tier: t,
      miner: !!g.minerCtx, require: !!g.requireCtx, validator: !!g.valCtx,
      quote: g.quote, url: s.readmeUrl || s.githubUrl,
      minerTaoPerDay: s.minerEmissionTaoPerDay,
    });
  }
}
for (const k of Object.keys(A)) {
  A[k].reqCount = A[k].reqSubnets.length;
  A[k].supportedCount = A[k].supportedSubnets.length;
  A[k].anyCount = A[k].anySubnets.length;
  A[k].reqUsdPerDay = usd(A[k].reqTaoPerDay);
  A[k].anyUsdPerDay = usd(A[k].anyTaoPerDay);
  A[k].evidence.sort((a, b) => a.tier - b.tier || (b.miner + b.require) - (a.miner + a.require));
  A[k].evidence = A[k].evidence.slice(0, 5);
}
const viewA = Object.entries(A)
  .map(([gpu, v]) => ({ gpu, ...v }))
  .sort((a, b) => b.reqCount - a.reqCount || b.supportedCount - a.supportedCount || b.reqTaoPerDay - a.reqTaoPerDay);

// ---------- View B: VRAM class demand (miner-side) ----------
// collect per subnet the BEST (max) explicit miner-side VRAM minimum, with source
const B = { byClass: {}, unclassified: [] };
for (const s of ev) {
  let gb = null, src = null, quote = null;
  const mc = s.minCompute?.miner;
  if (mc && mc.minVram) { gb = mc.minVram; src = "min_compute.yml"; quote = `min_vram=${mc.minVram}${mc.recVram ? ` rec=${mc.recVram}` : ""}${mc.recGpu ? ` rec_gpu=${mc.recGpu}` : ""}`; }
  if (!gb) {
    const cand = (s.vramMins || []).filter((v) => v.requireCtx);
    if (cand.length) { gb = Math.max(...cand.map((v) => v.gb)); src = cand.find((v) => v.gb === gb)?.file || "README"; quote = cand.find((v) => v.gb === gb)?.quote; }
  }
  if (gb == null && s.appMinVramGb) { gb = s.appMinVramGb; src = "app-classifier"; quote = `classifier: ${s.appGpuRequired || "n/a"}`; }
  if (gb == null) { B.unclassified.push({ netuid: s.netuid, name: s.name }); continue; }
  const cls = vramClass(gb);
  const e = (B.byClass[cls] ??= { subnets: 0, taoPerDay: 0, usdPerDay: 0, examples: [] });
  e.subnets++;
  e.taoPerDay += s.minerEmissionTaoPerDay ?? 0;
  if (e.examples.length < 6) e.examples.push({ netuid: s.netuid, name: s.name, minVramGb: gb, src, quote });
}
for (const k of Object.keys(B.byClass)) B.byClass[k].usdPerDay = usd(B.byClass[k].taoPerDay);
B.classes = CLASS_ORDER.filter((c) => B.byClass[c]).map((c) => ({ class: c, ...B.byClass[c] }));

// ---------- View C: app classifier cross-check ----------
const C = {};
for (const s of ev) {
  const g = s.appGpuRequired;
  if (!g) continue;
  const key = g.replace(/^Entry GPU.*$/i, "Entry GPU (≤12GB)").trim();
  const c = (C[key] ??= { subnetCount: 0, taoPerDay: 0, subnets: [] });
  c.subnetCount++;
  c.taoPerDay += s.minerEmissionTaoPerDay ?? 0;
  if (c.subnets.length < 8) c.subnets.push(s.netuid);
}
const viewC = Object.entries(C).map(([gpu, v]) => ({ gpu, ...v, usdPerDay: usd(v.taoPerDay) })).sort((a, b) => b.subnetCount - a.subnetCount);

// ---------- coverage stats ----------
const stats = {
  totalSubnets: ev.length,
  withGithub: ev.filter((s) => s.githubUrl).length,
  readmeOk: ev.filter((s) => s.readmeStatus === "ok").length,
  withMinCompute: ev.filter((s) => s.minCompute).length,
  withGpuMention: ev.filter((s) => s.gpus.length).length,
  withVramSignal: ev.filter((s) => (s.vramMins || []).length || s.minCompute?.miner?.minVram).length,
  taoPriceUsd: TAO,
  totalMinerTaoPerDay: ev.reduce((a, s) => a + (s.minerEmissionTaoPerDay ?? 0), 0),
};

fs.writeFileSync(`${DIR}/rankings.json`, JSON.stringify({ stats, viewA, viewB: B, viewC }, null, 2));
console.log(JSON.stringify(stats, null, 1));
console.log("\nVIEW A (verified mentions):");
for (const v of viewA.slice(0, 14)) console.log(`  ${v.gpu}: req=${v.reqCount} supported=${v.supportedCount} any=${v.anyCount}, req-emit=${v.reqTaoPerDay.toFixed(1)} TAO/d`);
console.log("\nVIEW B (VRAM classes):");
for (const v of B.classes) console.log(`  ${v.class}: ${v.subnets} subnets, ${v.taoPerDay.toFixed(1)} TAO/d`);
