/**
 * Query live on-chain registration burn + emission for CPU-only subnets.
 * Purpose: find subnets a user can join as a CPU miner with zero/near-zero
 * TAO burn so they can test the app on a laptop.
 */
import { fetchLiveSnapshot } from "../src/lib/infranex/chain";

const CPU_SUBNETS = [2, 5, 6, 7, 8, 11, 13, 15, 18, 21, 22, 41, 43, 46, 50, 54, 56, 61, 63, 69, 78, 79, 83, 88];
const QPU_SUBNETS = [48]; // quantum hardware — not laptop-runnable, listed separately

async function main() {
  console.log("Fetching live chain snapshot (this takes ~30-90s)...");
  const snap = await fetchLiveSnapshot();
  console.log(`Block ${snap.blockNumber} | source: ${snap.source} | subnets: ${snap.totalSubnets}`);
  if (snap.error) console.log("warn:", snap.error);

  const byNetuid = new Map(snap.subnets.map((s) => [s.netuid, s]));

  const rows: string[] = [];
  for (const n of [...CPU_SUBNETS, ...QPU_SUBNETS]) {
    const s = byNetuid.get(n);
    if (!s) {
      rows.push(`SN${String(n).padStart(3)} | NOT FOUND ON CHAIN`);
      continue;
    }
    const burn = s.burnCostTao === null ? "0/free?" : `${s.burnCostTao.toFixed(4)} TAO`;
    const emis = s.minerEmissionTaoPerDay === null ? "?" : `${s.minerEmissionTaoPerDay.toFixed(3)} TAO/day`;
    const miners = s.minersCount ?? "?";
    const imm = s.immunityBlocks ?? "?";
    rows.push(
      `SN${String(n).padStart(3)} | burn: ${burn.padEnd(14)} | minerEmis: ${emis.padEnd(16)} | miners: ${String(miners).padEnd(4)} | immunityBlk: ${String(imm).padEnd(6)} | alpha$24h: ${s.alphaPriceChange24h ?? "?"}%`
    );
  }
  console.log("\nnetuid | registration burn | miner emission | miners | immunity | alpha 24h");
  for (const r of rows) console.log(r);

  await (await import("../src/lib/infranex/chain")).getChainApi().then((a) => a.disconnect());
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
