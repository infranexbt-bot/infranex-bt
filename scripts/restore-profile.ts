// RESTORE-PROFILE — restore the user's saved ProfitabilitySettings singleton
// (owned rig / 96GB / TEE) after a sandbox recycle wiped it. Run:
//   bun --smol scripts/restore-profile.ts
const BASE = "http://127.0.0.1:3000";

async function main() {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  if (!login.ok) throw new Error("login failed " + login.status);
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const profile = {
    minNetProfitTargetUsd: 300,
    storageMonthlyUsd: 15,
    infraMonthlyUsd: 0,
    otherOpexMonthlyUsd: 25,
    hardwareMode: "owned",
    electricityUsdPerKwh: 0.12,
    rigGpuVramGb: 96,
    rigTeeCapable: true,
    includeRegistrationBurn: true,
    amortizeBurnMonths: 3,
    riskAdjustment: true,
  };

  const res = await fetch(BASE + "/api/profitability-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(profile),
  });
  console.log("PUT status", res.status);
  console.log(JSON.stringify(await res.json(), null, 1));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
