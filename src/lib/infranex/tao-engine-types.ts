// Types shared between the research script (scripts/tao-engine-research.ts),
// the frozen baseline JSON (tao-engine-baseline.json) and the engine
// (tao-engine.ts). Kept separate so the lib stays import-clean in the bundle.

export interface TaoEngineResearchPayload {
  model: string;
  fetchedAt: string;
  block: number;
  taoPriceUsd: number;
  referenceStakeTao: number;
  rootBaseline: {
    poolTao: number;
    emissionTaoPerDay: number;
    naiveChainApyPct: number;
    marketGrossApyPct: number;
    takePct: number;
    netApyPct: number;
  };
  subnets: unknown[];
  allResearched: unknown[];
}
