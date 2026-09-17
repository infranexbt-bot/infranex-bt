// Print the install plan shapes for the two special paths: cluster (SN64,
// SN90) and rules-only (SN4). Confirms every documented constraint surfaces
// as an executable plan step.
import { pullSubnetRequirements } from "../src/lib/devops/subnet-requirements";
import { buildInstallPlan } from "../src/lib/devops/installer";

async function main() {
  for (const netuid of [64, 90, 4]) {
    const { profile } = await pullSubnetRequirements(netuid);
    const plan = buildInstallPlan({ profile, walletName: "default", hotkeyName: "miner", hostFacts: null });
    console.log(`\n=== SN${netuid} ${profile.subnetName} — ${plan.length} steps ===`);
    for (const s of plan) {
      console.log(`  ${String(s.idx).padStart(2)}. [${s.gate.toUpperCase().padEnd(8)}] ${s.title}`);
    }
    const rules = profile.infraStack;
    if (rules?.hostClass) console.log(`  hostClass quote: ${rules.hostClass.quote.slice(0, 110)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
