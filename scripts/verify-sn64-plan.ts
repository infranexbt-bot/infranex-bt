// Verify: refresh SN64 profile with the new infra detectors, then print the
// install plan the DevOps Engine would execute for a Chutes-class host.
import { pullSubnetRequirements } from "../src/lib/devops/subnet-requirements";
import { buildInstallPlan } from "../src/lib/devops/installer";

async function main() {
  const { profile, cached } = await pullSubnetRequirements(64, { refresh: true });
  console.log(`SN64 profile refreshed (cached=${cached})`);
  console.log("orchestration:", profile.infraStack?.orchestration);
  console.log("services:", profile.infraStack?.services.map((s) => s.name).join(", "));
  console.log("ramRule:", profile.infraStack?.ramRule?.quote.slice(0, 100) ?? null);
  console.log("networkRule:", profile.infraStack?.networkRule?.quote.slice(0, 140) ?? null);
  console.log("storageRule:", profile.infraStack?.storageRule?.quote.slice(0, 140) ?? null);
  console.log("hostClass:", profile.infraStack?.hostClass?.quote.slice(0, 140) ?? null);

  const plan = buildInstallPlan({
    profile,
    walletName: "default",
    hotkeyName: "miner",
    hostFacts: null,
  });
  console.log(`\n=== SN64 install plan (${plan.length} steps) ===`);
  for (const s of plan) {
    console.log(
      `${String(s.idx).padStart(2)}. [${s.gate.toUpperCase().padEnd(8)}] ${s.title}` +
        (s.virtual ? " (virtual)" : "")
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
