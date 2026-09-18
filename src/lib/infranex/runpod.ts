import type { GPUOffer } from "./types";

/**
 * Live RunPod GPU pricing via their GraphQL API.
 *
 * Queries the authenticated `gpuTypes` endpoint for real-time spot
 * (minimumBidPrice) and on-demand (uninterruptablePrice) rates across
 * all 45+ GPU types they list. Cached for 60s — prices are relatively
 * stable and the API is rate-limited.
 */

const RUNPOD_GRAPHQL = "https://api.runpod.io/graphql";

interface RunpodPrice {
  minimumBidPrice: number | null;
  uninterruptablePrice: number | null;
}

export interface RunpodGpuType {
  id: string;
  displayName: string;
  memoryInGb: number;
  lowestPrice: RunpodPrice | null;
}

interface LiveGpuOffer extends GPUOffer {
  live: true;
  source: "runpod";
}

export interface LiveGpuSnapshot {
  offers: LiveGpuOffer[];
  source: "live" | "partial" | "error";
  error?: string;
  fetchedAt: string;
  /** Legacy single-provider field; the multi-provider snapshot uses "multi". */
  provider: string;
  totalGpuTypes: number;
  /** Per-provider status (configured/origin/offers/error) — added with the
   *  Provider API Keys feature; absent in old clients' expectations, so it is
   *  optional and additive. */
  providers?: Array<{
    id: string;
    label: string;
    configured: boolean;
    origin?: "db" | "env";
    status?: string | null;
    offers: number;
    error?: string;
  }>;
}

// Map RunPod GPU names to our canonical model names + tiers.
// (Also reused by the Vast.ai / Lambda adapters — their GPU labels are close
// enough to the same vocabulary that canonical names stay consistent across
// the wizard and the catalog.)
export function normalizeModel(displayName: string, vramGb: number): {
  model: string;
  tierLabel: "Entry" | "Mid" | "High" | "Flagship";
  /** Canonical marketing VRAM for models where provider reporting drifts
   *  (Vast reports MiB -> rounds to GiB, e.g. H200 = 140 instead of 141;
   *  without this the wizard's `vramGb >= minVramGb` filter wrongly hides
   *  Vast's identical-but-cheaper cards). Parsers should prefer this value
   *  over their own unit math when present. */
  vramGb?: number;
} | null {
  const n = displayName.toUpperCase();
  // Only include GPUs relevant to Bittensor mining (skip low-end/consumer).
  const map: { match: RegExp; model: string; tier: "Entry" | "Mid" | "High" | "Flagship"; vramGb?: number }[] = [
    { match: /^RTX 4090$/, model: "RTX 4090", tier: "High" },
    { match: /^RTX 4080/, model: "RTX 4080", tier: "Mid" },
    { match: /^RTX 3090 TI/, model: "RTX 3090 Ti", tier: "Mid" },
    { match: /^RTX 3090$/, model: "RTX 3090", tier: "Mid" },
    { match: /^RTX A5000$/, model: "RTX A5000", tier: "Mid" },
    { match: /^RTX A6000$/, model: "RTX A6000", tier: "High" },
    { match: /^RTX 6000 ADA/, model: "RTX 6000 Ada", tier: "High" },
    { match: /^RTX 5000 ADA/, model: "RTX 5000 Ada", tier: "Mid" },
    { match: /^A100 SXM 40GB/, model: "A100 40GB", tier: "High" },
    { match: /^A100 SXM$/, model: "A100 80GB", tier: "Flagship" },
    { match: /^A100 PCIE/, model: "A100 80GB PCIe", tier: "Flagship" },
    { match: /^A40$/, model: "A40", tier: "Mid" },
    { match: /^L40S$/, model: "L40S", tier: "High" },
    { match: /^L40$/, model: "L40", tier: "Mid" },
    { match: /^L4$/, model: "L4", tier: "Entry" },
    { match: /^H100 SXM$/, model: "H100 80GB", tier: "Flagship", vramGb: 80 },
    { match: /^H100 NVL$/, model: "H100 NVL", tier: "Flagship", vramGb: 94 },
    { match: /^H100 PCIE$/, model: "H100 PCIe", tier: "Flagship", vramGb: 80 },
    { match: /^H200( SXM)?$/, model: "H200 141GB", tier: "Flagship", vramGb: 141 },
    { match: /^H200 NVL$/, model: "H200 NVL", tier: "Flagship", vramGb: 141 },
    { match: /^B200$/, model: "B200 180GB", tier: "Flagship", vramGb: 180 },
    { match: /^B300/, model: "B300 288GB", tier: "Flagship", vramGb: 288 },
    { match: /^MI300X/, model: "MI300X 192GB", tier: "Flagship", vramGb: 192 },
    { match: /^RTX 5090$/, model: "RTX 5090", tier: "High" },
    { match: /^RTX 5080$/, model: "RTX 5080", tier: "Mid" },
  ];
  for (const m of map) {
    if (m.match.test(n)) {
      return m.vramGb != null
        ? { model: m.model, tierLabel: m.tier, vramGb: m.vramGb }
        : { model: m.model, tierLabel: m.tier };
    }
  }
  return null;
}

export async function fetchRunpodGpus(apiKey: string): Promise<RunpodGpuType[]> {
  if (!apiKey) throw new Error("RunPod API key not configured");

  const query = `{
    gpuTypes {
      id
      displayName
      memoryInGb
      lowestPrice {
        minimumBidPrice
        uninterruptablePrice
      }
    }
  }`;

  const res = await fetch(RUNPOD_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`RunPod ${res.status} ${res.statusText}`);

  const j = (await res.json()) as {
    data?: { gpuTypes?: RunpodGpuType[] };
    errors?: Array<{ message: string }>;
  };

  if (j.errors?.length) throw new Error(j.errors[0].message);
  return j.data?.gpuTypes ?? [];
}

/**
 * MOCK-PURGE-2 — live offers only. Fabricated "indicative" catalog prices are
 * gone: with no configured provider key (or a provider error) the catalog is
 * honestly empty instead of showing synthetic marketplace data.
 */
export function mergeGpuOffers(snap: LiveGpuSnapshot | undefined): Array<
  GPUOffer & { live?: boolean; source?: string }
> {
  if (!snap) return [];
  return snap.offers
    .map((o) => ({ ...o, live: true, source: o.source }))
    .sort((a, b) => b.vramGb - a.vramGb);
}
