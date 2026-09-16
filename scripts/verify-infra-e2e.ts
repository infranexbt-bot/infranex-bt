/**
 * End-to-end infra verification for SN64: rebuild the requirements profile
 * (routed to chutes-miner), then build the install plan and show the new
 * infra steps. Run: bun scripts/verify-infra-e2e.ts
 */
import { pullSubnetRequirements } from "../src/lib/devops/subnet-requirements";
import { buildInstallPlan } from "../src/lib/devops/installer";

const { profile, cached } = await pullSubnetRequirements(64, { refresh: true });
console.log(`=== SN64 profile (cached=${cached}) ===`);
console.log("repoUrl:", profile.repoUrl);
console.log("pipCount:", profile.pipPackageCount, "| sample:", profile.pipPackages.slice(0, 10).join(", "));
console.log("entrypoint:", profile.entrypoint, "| confidence:", profile.confidence);
console.log("dockerRequired:", profile.dockerRequired, "| image:", profile.dockerImage);
console.log("infraStack services:", profile.infraStack?.services.map((s) => s.name).join(", ") ?? "none");
console.log("orchestration:", profile.infraStack?.orchestration ?? "-", "| ramRule:", !!profile.infraStack?.ramRule);
console.log("notes:");
for (const n of profile.notes) console.log("  -", n.slice(0, 120));

const plan = buildInstallPlan({
  profile,
  walletName: "test",
  hotkeyName: "default",
  hostFacts: { gpuName: "H200", gpuVramMb: 141 * 1024, totalRamMb: 260 * 1024 },
});
console.log(`\n=== install plan (${plan.length} steps) ===`);
for (const s of plan) {
  console.log(`${s.idx}. [${s.gate}${s.virtual ? "/virtual" : ""}] ${s.title}`);
}
