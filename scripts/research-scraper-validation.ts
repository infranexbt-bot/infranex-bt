/**
 * Validate the updated scrapeGithubMetadata guards against the audit's
 * key subnets: expected hosting flags + GPU + evidence quotes.
 * Run: bun scripts/research-scraper-validation.ts
 */

const CASES: Array<{
  netuid: number;
  name: string;
  url: string;
  expect: string; // human-readable expectation
}> = [
  { netuid: 64, name: "Chutes", url: "https://github.com/chutesai/chutes", expect: "bare+TEE+IP all TRUE (miner repo chutes-miner)" },
  { netuid: 4, name: "Targon", url: "https://github.com/manifold-inc/targon", expect: "TEE true (NVIDIA CC current impl); bare metal FALSE (roadmap)" },
  { netuid: 28, name: "SayGM", url: "https://github.com/taostat/gm-miner", expect: "TEE true (Phala CVM deploy)" },
  { netuid: 33, name: "ReadyAI", url: "https://github.com/afterpartyai/bittensor-conversation-genome-project", expect: "all FALSE (RunPod allowed)" },
  { netuid: 38, name: "ChronoLLM", url: "https://github.com/chronollm/sn38", expect: "all FALSE (TEE is validator-side)" },
  { netuid: 51, name: "lium.io", url: "https://github.com/Datura-ai/lium-io", expect: "TEE true (TDX executor)" },
  { netuid: 58, name: "greevils", url: "https://github.com/greevils-ai/greevils-cli", expect: "TEE true (Confidential Space TDX VM)" },
  { netuid: 71, name: "Leadpoet", url: "https://github.com/leadpoet/leadpoet", expect: "all FALSE (negation / no requirement)" },
  { netuid: 82, name: "Compelle", url: "https://github.com/compelle/compelle-validator", expect: "all FALSE (sudo tee false positive)" },
  { netuid: 90, name: "KubeTEE", url: "https://github.com/KubeTEE-AI/kubetee-subnet", expect: "TEE true (TEE-attested clusters); GPU maybe H-class" },
  { netuid: 94, name: "BitSota", url: "https://github.com/AlveusLabs/SN94-BitSota", expect: "all FALSE (dedicated hw is a recommendation)" },
  { netuid: 103, name: "Capcomp", url: "https://github.com/orgs/Capcomp-AI/repositories", expect: "org URL resolves" },
  { netuid: 105, name: "Beam", url: "https://github.com/orgs/Beam-Network/repositories", expect: "org URL resolves" },
  { netuid: 118, name: "Ditto", url: "https://github.com/orgs/ditto-assistant/repositories", expect: "org URL resolves" },
  { netuid: 122, name: "CookingTAO", url: "https://github.com/CookingTao", expect: "org URL resolves" },
];

const out: string[] = [];
for (const c of CASES) {
  const meta = await scrapeGithubMetadata(c.url, { netuid: c.netuid });
  const h = meta.hosting;
  const flags = h
    ? `${h.bareMetalOnly ? "BARE " : ""}${h.teeRequired ? "TEE " : ""}${h.staticIpRequired ? "IP" : ""}`.trim() || "none-true"
    : "null";
  out.push(`#${String(c.netuid).padStart(3)} ${c.name.padEnd(12)} hosting=[${flags}]  gpu=${meta.recommendedGpu ?? "-"}  src=${meta.requirementsSource ?? "-"}  err=${meta.error ?? "-"}`);
  out.push(`     expect: ${c.expect}`);
  if (h?.notes?.length) {
    for (const n of h.notes.slice(0, 2)) out.push(`     note: ${n.slice(0, 160)}`);
  }
  await new Promise((r) => setTimeout(r, 400));
}

import { scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";
console.log(out.join("\n"));
