/** Dump raw min_compute.yml + boilerplate comparison for every audit row that has one. */
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const results = require("/home/z/my-project/scripts/gpu-audit/audit-results.json");

async function fetchRaw(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "infranex-audit/1.0" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync("/home/z/my-project/scripts/gpu-audit/mincompute", { recursive: true });

  // official template baseline for boilerplate detection
  const tpl = await fetchRaw("https://raw.githubusercontent.com/opentensor/bittensor-subnet-template/HEAD/min_compute.yml");
  console.log("=== OFFICIAL TEMPLATE min_compute.yml ===");
  console.log(tpl ?? "(fetch failed)");

  const withMc = results.filter((r: any) => r.gtMinCompute);
  for (const r of withMc) {
    const url = r.gtMinCompute.url.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/");
    const raw = await fetchRaw(url);
    if (raw) {
      writeFileSync(`/home/z/my-project/scripts/gpu-audit/mincompute/${r.netuid}.yml`, raw);
    }
    const isBoilerplate =
      tpl && raw && raw.replace(/\s+/g, " ").trim() === tpl.replace(/\s+/g, " ").trim();
    console.log(`\n--- SN${r.netuid} ${r.name} (${url})${isBoilerplate ? "  *** UNMODIFIED TEMPLATE BOILERPLATE ***" : ""}`);
    console.log((raw ?? "(fetch failed)").split("\n").slice(0, 40).join("\n"));
  }
}
main();
