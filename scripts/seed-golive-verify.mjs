// GO-LIVE-VERIFY E2E seed — two test deployments:
//   A) full-telemetry path: REAL registered hotkey from chain, wallet bound,
//      install done, GpuSample/ProbeSample/TrafficSample history → mostly green
//   B) no-data path: started, no hotkey, no samples → honest unknowns/fails
import { PrismaClient } from "@prisma/client";
import { ApiPromise, WsProvider } from "@polkadot/api";

const db = new PrismaClient();
const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";

function stepsJson(hoursAgo) {
  const t = (h) => new Date(Date.now() - h * 3600_000).toISOString();
  return JSON.stringify([
    { name: "provision", label: "Provision compute", status: "done", startedAt: t(3), completedAt: t(2.6), output: ["pod created"] },
    { name: "setup", label: "Install subnet requirements", status: "done", startedAt: t(2.6), completedAt: t(2.2), output: ["deps installed"] },
    { name: "deploy", label: "Start miner", status: "done", startedAt: t(2.2), completedAt: t(2), output: ["miner started"] },
    { name: "health", label: "Health", status: "done", startedAt: t(2), completedAt: t(2), output: [] },
  ]);
}

const requirements = JSON.stringify({
  dockerfileFound: true,
  dockerImage: "ghcr.io/infranex/miner-sn3:latest",
  pythonVersion: "3.10",
  cudaVersion: "12.1",
  dockerRequired: true,
  nvidiaRuntimeRequired: true,
});

const config = JSON.stringify({
  subnet: { netuid: 3, name: "Test subnet" },
  miner: { walletName: "infranex", hotkeyName: "default", axonPort: 8091 },
  docker: { imageName: "ghcr.io/infranex/miner-sn3:latest", command: "python miner.py --netuid 3", ports: [8091], envVars: [{ name: "BT_NETWORK", value: "finney", secret: false }] },
});

async function findSmallSubnetWithHotkey(api) {
  // Scan a handful of subnets, pick the one with the smallest registered
  // cohort, and grab UID 0's hotkey from it.
  const candidates = [3, 20, 56, 67, 78];
  let best = null;
  for (const netuid of candidates) {
    try {
      const n = await api.query.subtensorModule.subnetworkN(netuid);
      const size = n ? Number(n.toString()) : 0;
      console.log(`netuid ${netuid}: ${size} UIDs`);
      if (size > 0 && (!best || size < best.size)) best = { netuid, size };
      if (best && best.size <= 16) break; // small enough, stop scanning
    } catch (e) {
      console.log(`netuid ${netuid}: read failed (${e.message})`);
    }
  }
  if (!best) throw new Error("no candidate subnet readable");
  const key = await api.query.subtensorModule.keys(best.netuid, 0);
  const hotkey = key.toHex().replace("0x", ""); // some storages wrap
  const hk = hotkey.length === 64 ? `0x${hotkey}` : key.toHex();
  // hotkey storage returns AccountId32 — toHex() is the SS58-encodable pubkey
  const { encodeAddress } = await import("@polkadot/util-crypto");
  const ss58 = encodeAddress(hk, 42);
  console.log(`picked netuid ${best.netuid} (${best.size} UIDs), uid0 hotkey ${ss58.slice(0, 10)}…`);
  return { netuid: best.netuid, hotkey: ss58 };
}

const api = await ApiPromise.create({ provider: new WsProvider(WS_URL, 4000, undefined, 60_000) });
await api.isReady;
const { netuid, hotkey } = await findSmallSubnetWithHotkey(api);

const wallet = await db.walletProfile.upsert({
  where: { walletName_hotkeyName: { walletName: "infranex", hotkeyName: "default" } },
  create: { label: "E2E wallet", walletName: "infranex", hotkeyName: "default", isDefault: true, notes: "seeded for go-live-verify e2e" },
  update: {},
});

// Clean previous seeds
await db.deployment.deleteMany({ where: { minerName: { in: ["e2e-golive-A", "e2e-golive-B"] } } });

const A = await db.deployment.create({
  data: {
    minerName: "e2e-golive-A",
    netuid,
    subnetName: `α${netuid} (chain-verified seed)`,
    gpuModel: "RTX 4090",
    provider: "mock",
    status: "started",
    mode: "mock",
    hourlyCost: 0.4,
    monthlyCost: 288,
    config,
    hotkey,
    sshPort: 22,
    installStatus: "installed",
    requirementsJsonSnapshot: requirements,
    walletProfileId: wallet.id,
    steps: stepsJson(2),
  },
});

// Telemetry history for A: 8 fresh samples + probe + traffic
for (let i = 0; i < 8; i++) {
  await db.gpuSample.create({
    data: {
      deploymentId: A.id,
      daemonStatus: "online",
      gpuUtilPct: 88 + Math.round(Math.sin(i) * 6),
      memUsedMb: 12200 + i * 40,
      memTotalMb: 24564,
      tempC: 64 + i,
      processAlive: true,
      createdAt: new Date(Date.now() - i * 7 * 60_000),
    },
  });
}
await db.probeSample.create({
  data: {
    deploymentId: A.id,
    endpoint: "1.2.3.4:8091",
    mode: "mock",
    ok: true,
    httpStatus: 200,
    ttfbMs: 83,
    totalMs: 141,
  },
});
await db.trafficSample.create({
  data: {
    deploymentId: A.id,
    windowMinutes: 60,
    requests: 14,
    distinctValidators: 3,
    topValidatorHotkey: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    topValidatorCount: 6,
  },
});

// B — started, zero data (honest unknown/fail path)
await db.deployment.create({
  data: {
    minerName: "e2e-golive-B",
    netuid,
    subnetName: `α${netuid} (no-data seed)`,
    gpuModel: "CPU-only",
    provider: "mock",
    status: "started",
    mode: "mock",
    hourlyCost: 0.02,
    monthlyCost: 14.4,
    config: JSON.stringify({ miner: { walletName: "infranex", hotkeyName: "default" } }),
    steps: stepsJson(0.5),
  },
});

console.log("SEEDED", { A: A.id, walletId: wallet.id, netuid, hotkey });
await api.disconnect();
await db.$disconnect();
