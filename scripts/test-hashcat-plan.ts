#!/usr/bin/env bun
/**
 * test-hashcat-plan.ts — integration test: buildInstallPlan() must emit the
 * dedicated hashcat step (apt install + version gate + OpenCL probe) when
 * profile.hashcatRequired is set, and must NOT emit it otherwise.
 * Run: DATABASE_URL="file:/home/z/my-project/db/custom.db" bun scripts/test-hashcat-plan.ts
 */
import { buildInstallPlan } from "../src/lib/devops/installer";
import type { SubnetRequirementsProfile } from "../src/lib/devops/subnet-requirements";

function fakeProfile(over: Partial<SubnetRequirementsProfile>): SubnetRequirementsProfile {
  return {
    netuid: 35,
    subnetName: "TestSubnet",
    description: null,
    category: null,
    minVramGb: 0,
    recommendedGpu: "None (CPU-only)",
    gpuSource: "curated",
    osPackages: ["git", "python3", "python3-venv", "python3-pip", "build-essential"],
    pythonVersion: "3.10",
    pipPackages: ["bittensor>=9.0"],
    pipPackageCount: 1,
    gitDeps: [],
    cudaMinVersion: null,
    dockerImage: null,
    dockerRequired: false,
    bittensorStack: ["bittensor"],
    packageManager: "pip",
    hashcatRequired: false,
    hashcatMinVersion: null,
    infraStack: null,
    repoUrl: "https://github.com/example/test-subnet",
    repoBranch: "main",
    entrypoint: "neurons/miner.py",
    readmeUrl: null,
    requirementsUrl: null,
    dockerfileFound: false,
    chainNetwork: "finney",
    ports: { axon: 8091, prometheus: 8092 },
    envKeys: [],
    minerCommandTemplate: "",
    sources: ["github"],
    confidence: "high",
    notes: [],
    fetchedAt: new Date().toISOString(),
    ...over,
  };
}

let fails = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
}

// A: hashcat >= 6.2.5 → step present with version gate
const withHashcat = buildInstallPlan({
  profile: fakeProfile({ hashcatRequired: true, hashcatMinVersion: "6.2.5" }),
  walletName: "w",
  hotkeyName: "h",
});
const step = withHashcat.find((s) => s.title.startsWith("Install Hashcat"));
check("A1: hashcat step present", !!step, step?.title);
check("A2: step is auto-gated", step?.gate === "auto");
const cmds = step?.commands ?? [];
check("A3: installs hashcat + ocl-icd via apt", cmds[0]?.includes("apt-get install -y -qq hashcat ocl-icd-libopencl1"));
const gate = cmds[1] ?? "";
check("A4: version gate pins 6.2.5", gate.includes("'6.2.5'") && gate.includes("sort -V"));
check("A5: gate hard-fails on older version", gate.includes("installed but subnet requires"));
check("A6: OpenCL backend probe present", (cmds[2] ?? "").includes("hashcat -I"));
check("A7: numbering stays sequential", withHashcat.map((s) => s.idx).every((v, i) => v === i + 1));

// B: hashcat required, no floor → step without version pin
const noFloor = buildInstallPlan({
  profile: fakeProfile({ hashcatRequired: true, hashcatMinVersion: null }),
  walletName: "w",
  hotkeyName: "h",
});
const stepB = noFloor.find((s) => s.title === "Install Hashcat");
check("B1: step titled 'Install Hashcat' (no floor)", !!stepB);
check("B2: no version pin in gate", !(stepB?.commands[1] ?? "").includes("requires >="));

// C: no hashcat → no step (regression guard for SN5-class plans)
const clean = buildInstallPlan({
  profile: fakeProfile({}),
  walletName: "w",
  hotkeyName: "h",
});
check("C1: no hashcat step when not required", !clean.some((s) => s.title.includes("Hashcat")));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
