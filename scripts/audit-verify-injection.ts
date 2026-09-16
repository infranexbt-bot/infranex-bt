// AUDIT-SEC — prove the installer's env-line + repoUrl escaping neutralizes
// hostile wallet names / GitHub URLs. Run: npx tsx scripts/audit-verify-injection.ts
import { buildInstallPlan } from "../src/lib/devops/installer";
import type { SubnetRequirementsProfile } from "../src/lib/devops/subnet-requirements";

const profile = {
  netuid: 4,
  subnetName: "Targon",
  repoUrl: "https://github.com/o/r';curl evil#x",
  dockerImage: "python:3.10",
  dockerRequired: false,
  dockerfileFound: false,
  osPackages: [],
  pipPackages: [],
  pythonVersion: "3.10",
  gpuSource: "classifier",
  minVramGb: 24,
  recommendedGpu: "A100",
  category: "AI",
  description: null,
  entrypoint: "neurons/miner.py",
  minerCommandTemplate: "",
  ports: { axon: 8091, prometheus: 9090 },
  confidence: "high",
  sources: [],
  fetchedAt: new Date().toISOString(),
  infraStack: null,
} as unknown as SubnetRequirementsProfile;

const plan = buildInstallPlan({
  profile,
  walletName: "default';reboot;'a",
  hotkeyName: "default",
  hostFacts: { docker: true, nvidiaRuntime: true } as never,
});

const envStep = plan.find((p) => p.title.includes("Write the miner environment"));
const cloneStep = plan.find((p) => p.title.includes("Clone"));
const envCmd = envStep?.commands[0] ?? "";
const cloneCmd = cloneStep?.commands[0] ?? "";

console.log("ENV CMD:", envCmd);
console.log("");
console.log("CLONE CMD:", cloneCmd);
console.log("");

// The escaped payload must contain the quote as a literal ('\''), never a raw
// unescaped quote that closes the shell string early.
const hostileInEnv = envCmd.includes("'\\''");
console.log(
  "ENV line escaping:",
  hostileInEnv ? "OK — quotes neutralized" : "FAIL — raw quote present"
);
console.log(
  "REPO URL quoting:",
  cloneCmd.includes("'https://github.com/o/r'\\'';curl evil#x'")
    ? "OK — URL fully quoted"
    : "CHECK MANUALLY"
);
