// Live sample: build requirements profiles for a representative subnet set to
// prove the infra pipeline is uniform — infraStack appears ONLY where the
// subnet's own docs document one (no fabrication, no omission).
import { pullSubnetRequirements } from "../src/lib/devops/subnet-requirements";

const SAMPLE = [1, 4, 8, 27, 51, 90, 64];

async function main() {
  for (const netuid of SAMPLE) {
    try {
      const { profile } = await pullSubnetRequirements(netuid, { refresh: true });
      const infra = profile.infraStack;
      console.log(
        `SN${String(netuid).padStart(3)} ${profile.subnetName.slice(0, 16).padEnd(16)} ` +
          `conf=${profile.confidence.padEnd(6)} repo=${profile.repoUrl ? "Y" : "n"} ` +
          `docker=${profile.dockerImage ? "Y" : "n"} ` +
          (infra
            ? `INFRA svc=[${infra.services.map((s) => s.name).join(",")}] orch=${infra.orchestration ?? "-"} ` +
              `rules=${[infra.ramRule && "ram", infra.networkRule && "net", infra.storageRule && "stor", infra.hostClass && "host"].filter(Boolean).join("+") || "-"}`
            : "no documented service stack (plain pip/GPU miner)")
      );
    } catch (e) {
      console.log(`SN${netuid} ERROR: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
