// Wallet policy + config builder enforcement test (Phase 3a)
import { scanWalletViolations, assertHotkeyOnly, WalletPolicyError, WALLET_POLICY } from "/home/z/my-project/infranex-bt/src/lib/infranex/deployment/wallet-policy.ts";
import { buildDeploymentConfig } from "/home/z/my-project/infranex-bt/src/lib/infranex/deployment/config.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

console.log("Policy:", WALLET_POLICY.name);
console.log("---");

// 1. Clean config → no violations
check("clean env passes",
  scanWalletViolations({
    envVars: [
      { name: "BT_WALLET_NAME", value: "infranex" },
      { name: "BT_HOTKEY_NAME", value: "default" },
      { name: "BT_HOTKEY_SS58", value: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" },
    ],
    commands: ["python neurons/miner.py --netuid 64 --wallet.name infranex"],
  }).length === 0
);

// 2. WIF private key in env → violation
check("WIF key detected",
  scanWalletViolations({
    envVars: [{ name: "BT_PRIV", value: "5Kd3NBUAdUnhyzenEwVLy9pBKxSwXvE9FMPyR4UKZvpe6E3AgLr" }],
  }).length === 1
);

// 3. Mnemonic in env → violation
check("mnemonic detected",
  scanWalletViolations({
    envVars: [{ name: "SEED", value: "apple banana cherry dog elephant fish grape horse island jungle kiwi lemon" }],
  }).length >= 1
);

// 4. coldkey mention in command → violation
check("coldkey in command detected",
  scanWalletViolations({
    commands: ["scp ~/.bittensor/wallets/mine/coldkey root@pod:/root/"],
  }).length === 1
);

// 5. PEM block in env → violation
check("PEM block detected",
  scanWalletViolations({
    envVars: [{ name: "KEY", value: "-----BEGIN OPENSSH PRIVATE KEY-----b3BlbnNzaC1rZXk=-----END OPENSSH PRIVATE KEY-----" }],
  }).length === 1
);

// 6. forbidden env NAME (private_key) → violation
check("private_key env name detected",
  scanWalletViolations({
    envVars: [{ name: "WALLET_PRIVATE_KEY", value: "harmless" }],
  }).length === 1
);

// 7. assertHotkeyOnly throws WalletPolicyError on violation
let threw = false;
try {
  assertHotkeyOnly({ envVars: [{ name: "COLDKEY", value: "x" }] });
} catch (e) {
  threw = e instanceof WalletPolicyError;
}
check("assertHotkeyOnly throws", threw);

// 8. SS58 hotkey address (48 chars, starts 5G/5D etc.) is NOT flagged as WIF
check("public SS58 not flagged",
  scanWalletViolations({
    envVars: [{ name: "BT_HOTKEY_SS58", value: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" }],
  }).length === 0
);

// 9. buildDeploymentConfig enforces policy: legit inputs succeed
const subnet = {
  netuid: 64, name: "T子网测试", symbol: "SN64", category: "Inference",
  minVramGb: 24, recommendedGpu: "RTX 4090",
} as Parameters<typeof buildDeploymentConfig>[0];
const offer = {
  id: "runpod-4090", model: "RTX 4090", vramGb: 24, provider: "runpod",
  hourlyPrice: 0.34, monthlyPrice: 248, region: "US-EAST",
  source: "curated", available: true,
} as unknown as Parameters<typeof buildDeploymentConfig>[1];
const cfg = buildDeploymentConfig(subnet, offer, { hotkey: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY" });
check("config builds with hotkey", !!cfg && cfg.miner.walletName === "infranex");

// 10. buildDeploymentConfig rejects coldkey material in hotkey field
let cfgThrew = false;
try {
  buildDeploymentConfig(subnet, offer, {
    hotkey: "5Kd3NBUAdUnhyzenEwVLy9pBKxSwXvE9FMPyR4UKZvpe6E3AgLr",
  });
} catch (e) {
  cfgThrew = e instanceof WalletPolicyError;
}
check("config builder rejects WIF in hotkey field", cfgThrew);

console.log("---");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
