/**
 * INFRANEX GPU research — Step 1: build the subnet dataset.
 * Merges: /api/network (live chain: name, github, emissions)
 *       + /api/devops/subnet-options (app classifier: gpuRequired, minVramGb)
 *       + /api/subnet-overrides (curated githubUrl overrides)
 * Output: /home/z/my-project/scripts/gpu-research/dataset.json
 */
const OUT = "/home/z/my-project/scripts/gpu-research/dataset.json";
const BASE = "http://localhost:3000";

async function getJson(path) {
  const res = await fetch(BASE + path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const [net, optsRes, ovRes] = await Promise.all([
  getJson("/api/network"),
  getJson("/api/devops/subnet-options"),
  getJson("/api/subnet-overrides").catch(() => ({ overrides: [] })),
]);

const overrides = Array.isArray(ovRes) ? ovRes : ovRes.overrides || [];
const overrideByNetuid = new Map(overrides.map((o) => [Number(o.netuid), o]));
const optionsByNetuid = new Map(
  (optsRes.subnets || []).map((s) => [Number(s.netuid), s])
);

const subnets = (net.subnets || []).map((s) => {
  const ov = overrideByNetuid.get(s.netuid);
  const opt = optionsByNetuid.get(s.netuid);
  return {
    netuid: s.netuid,
    name: s.name || (opt && opt.name) || `SN${s.netuid}`,
    identityGithub: s.identityGithub || null,
    overrideGithub: (ov && ov.githubUrl) || null,
    githubUrl: s.identityGithub || (ov && ov.githubUrl) || null,
    githubSource: s.identityGithub ? "chain-identity" : (ov && ov.githubUrl) ? "app-override" : null,
    emissionTaoPerDay: s.emissionTaoPerDay,
    minerEmissionTaoPerDay: s.minerEmissionTaoPerDay,
    rewardedMiners: s.rewardedMiners,
    minersCount: s.minersCount,
    taoPriceUsd: net.taoPriceUsd,
    appGpuRequired: (opt && opt.gpuRequired) || null,
    appMinVramGb: (opt && opt.minVramGb) ?? null,
    appCategory: (opt && opt.category) || null,
  };
});

subnets.sort((a, b) => a.netuid - b.netuid);
const withGh = subnets.filter((s) => s.githubUrl).length;

const fs = await import("fs");
fs.mkdirSync("/home/z/my-project/scripts/gpu-research", { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      fetchedAt: net.fetchedAt,
      blockNumber: net.blockNumber,
      taoPriceUsd: net.taoPriceUsd,
      source: net.source,
      totalSubnets: subnets.length,
      subnetsWithGithub: withGh,
      subnets,
    },
    null,
    2
  )
);
console.log(`dataset: ${subnets.length} subnets, ${withGh} with github -> ${OUT}`);
console.log(`taoPrice: $${net.taoPriceUsd}, source: ${net.source}, block: ${net.blockNumber}`);
