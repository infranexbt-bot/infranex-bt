// RIG-GATE-CHECK — verify the OWNED-RIG-1 gates on specific subnets.
// Run: bun --smol scripts/rig-gate-check.ts
const fs = require("fs");

async function main() {
  const snap = JSON.parse(fs.readFileSync("/tmp/net.json", "utf8"));
  const profConfig = JSON.parse(fs.readFileSync("/tmp/pc.json", "utf8"));
  const ovrJson = JSON.parse(fs.readFileSync("/tmp/ovr.json", "utf8"));
  const overrides = new Map<number, Record<string, unknown>>();
  for (const o of ovrJson.overrides as any[]) {
    const entry: Record<string, unknown> = {};
    if (o.name) entry.name = o.name;
    if (o.description) entry.description = o.description;
    if (o.category) entry.category = o.category;
    if (o.minVramGb != null) entry.minVramGb = o.minVramGb;
    if (o.recommendedGpu) entry.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) entry.gpuCount = o.gpuCount;
    if (o.hostingRequirements) { try { entry.hosting = JSON.parse(o.hostingRequirements); } catch {} }
    if (o.mechanicsJson) { try { entry.mechanics = JSON.parse(o.mechanicsJson); } catch {} }
    if (o.requirementsSource) entry.requirementsSource = o.requirementsSource;
    overrides.set(o.netuid, entry);
  }
  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const { computeRentEarn } = await import("../src/lib/infranex/rent-earn");
  const opps = mergeOpportunities(snap, profConfig, overrides);

  const probe = (netuid: number, label: string, basis: any) => {
    const row: any = opps.find((o) => o.netuid === netuid);
    if (!row) { console.log(`SN${netuid} ${label}: NOT IN SNAPSHOT`); return; }
    const r = computeRentEarn(row, basis);
    console.log(
      `SN${netuid} ${label} [minVram=${row.minVramGb ?? "?"}GB teeFlag=${row.hosting?.teeRequired ?? "-"}]\n` +
      `   rentable=${r.rentable} score=${r.score} band=${r.band}\n` +
      `   block: ${r.rentBlock ?? "—"}\n` +
      `   notes: ${r.notes.slice(0, 3).join(" | ") || "—"}`
    );
  };

  // owned rig: 96GB, TEE-capable
  const rig96tee = { mode: "owned", rigVramGb: 96, rigTeeCapable: true };
  // owned rig: 96GB, NO TEE (e.g. A100)
  const rig96notee = { mode: "owned", rigVramGb: 96, rigTeeCapable: false };

  console.log("=== RIG = 96GB + TEE (RTX PRO 6000) ===");
  probe(4, "Targon (TEE, 80GB)", rig96tee);
  probe(64, "Chutes (TEE, 48GB)", rig96tee);
  probe(90, "Kube (TEE)", rig96tee);
  probe(92, "REAX (80GB)", rig96tee);
  probe(51, "lium.io (180GB)", rig96tee);
  probe(39, "deprecated (141GB)", rig96tee);

  console.log("\n=== RIG = 96GB NO TEE (A100 80GB-class) ===");
  probe(4, "Targon (TEE)", rig96notee);
  probe(92, "REAX (80GB)", rig96notee);

  console.log("\n=== RIG = 32GB NO TEE (RTX 5090) ===");
  const rig5090 = { mode: "owned", rigVramGb: 32, rigTeeCapable: false };
  probe(92, "REAX (80GB)", rig5090);
  probe(9, "iota (16GB)", rig5090);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
