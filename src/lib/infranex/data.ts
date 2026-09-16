import type { GPUModel } from "./types";

// ---------------------------------------------------------------------------
// DATA-AUDIT-1 — the old "curated reference catalog" is GONE.
//
// It used to hardcode 16 subnet rows with invented names, prices, market
// caps, emissions, miner counts, owner addresses and per-category "docker
// images" that do not exist on Docker Hub. Several of those fabricated
// numbers leaked into live views (offline fallbacks, card badges, the
// Optimization Engine's alternatives), so the whole catalog was removed.
//
// What survives is an honest, minimal seed:
//   curatedSubnetSeeds — netuid → GitHub repo URL, used ONLY as the scrape
//   seed when neither the on-chain identity registry nor a user override
//   provides a repo. Chain identity + user overrides are always
//   authoritative; a seed never overrides either of them.
//
// Static GPU specs (hardware reference, not market data) stay here too.
// ---------------------------------------------------------------------------

export interface CuratedSubnetSeed {
  netuid: number;
  githubUrl: string;
}

export const curatedSubnetSeeds: CuratedSubnetSeed[] = [
  { netuid: 1, githubUrl: "https://github.com/opentensor/text-prompting" },
  { netuid: 3, githubUrl: "https://github.com/omegalabsinc/omegalabs-bittensor-subnet" },
  { netuid: 7, githubUrl: "https://github.com/macrocosm-os/apex" },
  { netuid: 9, githubUrl: "https://github.com/macrocosm-os/pretraining" },
  { netuid: 11, githubUrl: "https://github.com/UncleTensor/BittAudio" },
  { netuid: 19, githubUrl: "https://github.com/omegalabsinc/omegalabs-bittensor-subnet" },
  { netuid: 23, githubUrl: "https://github.com/omegalabsinc/omegalabs-bittensor-subnet" },
  { netuid: 25, githubUrl: "https://github.com/macrocosm-os/mainframe" },
];

/** Repo URL seed for a netuid (null when none curated). */
export function curatedGithubUrl(netuid: number): string | null {
  return curatedSubnetSeeds.find((s) => s.netuid === netuid)?.githubUrl ?? null;
}

// ---------------------------------------------------------------------------
// Scoring — Miner's Ledger v2 re-exports (shared by the live pipeline;
// kept here for compatibility with existing imports).
// ---------------------------------------------------------------------------

export {
  SCORE_WEIGHTS,
  deriveFactors,
  totalScore,
  riskLevel,
  classifySubnetHardware,
  scoreMinersLedger,
  GPU_TIERS,
  estimateGpuTierFromRevenue,
} from "./miner-score";

// ---------------------------------------------------------------------------
// GPU catalog — hardware spec reference (static specs, not market data) plus
// the provider list used for catalog filters. Live pricing comes exclusively
// from configured provider APIs (MOCK-PURGE-2 — no synthetic offers).
// ---------------------------------------------------------------------------

export const gpuModels: GPUModel[] = [
  { id: "rtx4090", name: "RTX 4090", manufacturer: "NVIDIA", vramGb: 24, cudaCores: 16384, fp16Tflops: 330, tdpWatts: 450, generation: "Ada", tierLabel: "High" },
  { id: "rtxa5000", name: "RTX A5000", manufacturer: "NVIDIA", vramGb: 24, cudaCores: 8192, fp16Tflops: 108, tdpWatts: 230, generation: "Ampere", tierLabel: "Mid" },
  { id: "rtxa6000", name: "RTX A6000", manufacturer: "NVIDIA", vramGb: 48, cudaCores: 10752, fp16Tflops: 155, tdpWatts: 300, generation: "Ampere", tierLabel: "High" },
  { id: "a100-40", name: "A100 40GB", manufacturer: "NVIDIA", vramGb: 40, cudaCores: 6912, fp16Tflops: 312, tdpWatts: 250, generation: "Ampere", tierLabel: "High" },
  { id: "a100-80", name: "A100 80GB", manufacturer: "NVIDIA", vramGb: 80, cudaCores: 6912, fp16Tflops: 312, tdpWatts: 400, generation: "Ampere", tierLabel: "Flagship" },
  { id: "h100-80", name: "H100 80GB", manufacturer: "NVIDIA", vramGb: 80, cudaCores: 16896, fp16Tflops: 989, tdpWatts: 700, generation: "Hopper", tierLabel: "Flagship" },
  { id: "h200", name: "H200 141GB", manufacturer: "NVIDIA", vramGb: 141, cudaCores: 16896, fp16Tflops: 989, tdpWatts: 700, generation: "Hopper", tierLabel: "Flagship" },
  { id: "l40s", name: "L40S", manufacturer: "NVIDIA", vramGb: 48, cudaCores: 18176, fp16Tflops: 362, tdpWatts: 350, generation: "Ada", tierLabel: "High" },
];

export const gpuProviders = ["RunPod", "Vast.ai", "TensorDock", "E2E Cloud", "Lambda"];
