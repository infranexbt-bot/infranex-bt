import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/lib/auth-admin";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchLiveSnapshot } from "@/lib/infranex/chain";
import { commitFinding, autoResolve } from "@/lib/infranex/triggers-core";

export const dynamic = "force-dynamic";

/**
 * DEVOPS-DEMO-1 — the Fault Drill.
 *
 * A clearly-labeled sandbox miner so a non-technical operator can watch the
 * DevOps Engine work end-to-end (detect → recommend → approve → act →
 * change feed) without renting a GPU or spending a dollar.
 *
 * Honesty rules (mirrors MOCK-PURGE-1):
 * - The sandbox row uses mode "mock", which every evaluator already skips:
 *   no spend accrual (cost stays $0.00 — truthful), no synthesized vitals,
 *   no chain calls, no probes, no benchmarks.
 * - The miner name, GPU model and provider all say Demo/Sandbox so the card
 *   can never be mistaken for a real rental.
 * - Exactly ONE scripted fault is injected (GPU thermal, acknowledge-path —
 *   the safest action branch: no SSH, no restart ladder, no state change).
 * - DELETE ends the drill: the deployment is marked terminated and the
 *   open finding auto-resolves into the change feed.
 */

const DRILL_NAME_PREFIX = "DEMO-";
const DRILL_NAME = "DEMO-fault-drill";
const THERMAL_DEDUPE_KEY = "demo-drill:thermal";

async function findDrillDeployment() {
  return db.deployment.findFirst({
    where: { minerName: { startsWith: DRILL_NAME_PREFIX }, mode: "mock" },
    orderBy: { createdAt: "desc" },
  });
}

async function pickSubnet(preferredNetuid: number) {
  try {
    const snap = await fetchLiveSnapshot();
    // LiveSubnetMetrics has no status column — emissionEnabled is the
    // honest "alive" signal for picking a sandbox home subnet.
    const candidates = snap.subnets.filter((s) => s.emissionEnabled && s.name);
    return (
      candidates.find((s) => s.netuid === preferredNetuid) ?? candidates[0] ?? null
    );
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const drill = await findDrillDeployment();
  if (!drill) return NextResponse.json({ drill: null });
  const openFault = await db.triggerEvent.findFirst({
    where: { dedupeKey: THERMAL_DEDUPE_KEY, status: "open" },
  });
  return NextResponse.json({
    drill: {
      id: drill.id,
      status: drill.status,
      minerName: drill.minerName,
      netuid: drill.netuid,
    },
    hasOpenFault: !!openFault,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // Ownership attribution — same pattern as the deployments route.
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  let preferredNetuid = 61;
  try {
    const body = await req.json();
    if (typeof body?.netuid === "number") preferredNetuid = body.netuid;
  } catch {
    // no body — defaults are fine
  }

  const subnet = await pickSubnet(preferredNetuid);

  // Reuse or create the sandbox miner.
  let drill = await findDrillDeployment();
  if (drill && drill.status === "terminated") {
    // Recycle: a fresh drill re-uses the same row with a new lifecycle.
    drill = await db.deployment.update({
      where: { id: drill.id },
      data: { status: "started", progress: 100 },
    });
  }
  if (!drill) {
    drill = await db.deployment.create({
      data: {
        minerName: DRILL_NAME,
        netuid: subnet?.netuid ?? preferredNetuid,
        subnetName: subnet?.name ?? "Sandbox",
        gpuModel: "Demo RTX 4090 (virtual)",
        provider: "Sandbox",
        status: "started",
        progress: 100,
        mode: "mock",
        hourlyCost: 0,
        monthlyCost: 0,
        estimatedRevenue: 0,
        ownerUserId: session?.uid ?? null,
        createdByLabel: session?.uid ?? "admin",
        config: JSON.stringify({
          demo: true,
          note: "Fault-drill sandbox miner — no pod, no spend, no chain identity. The DevOps Engine's detect → recommend → approve → act loop is demonstrated against a scripted GPU-thermal fault.",
        }),
        steps: JSON.stringify([]),
      },
    });
  }

  // Inject the scripted fault (deduped — re-running the drill refreshes it).
  const finding = await commitFinding({
    kind: "GPU_HEALTH",
    severity: "warning",
    dedupeKey: THERMAL_DEDUPE_KEY,
    title: "Fault drill — sandbox GPU is running hot (91 °C)",
    detail:
      "DEMO ONLY — this is a scripted exercise on the sandbox miner, not a real rental. The card, evidence, runbook and approval flow are exactly what a real thermal warning looks like.",
    evidence: {
      demo: true,
      tempC: 91,
      throttleLimitC: 85,
      gpu: "Demo RTX 4090 (virtual)",
      suggestedAction: "acknowledge",
      note: "Thermal drift over the last 6 samples; card would begin throttling above 85 °C.",
    },
    deploymentId: drill.id,
    netuid: drill.netuid,
    runbook: [
      "Check the GPU temperature trend on the miner card below (sandbox: synthetic 91 °C reading).",
      "In production: reduce load, verify fans/cooling, or recycle the compute if the card keeps throttling.",
      "Approve to acknowledge — the engine logs the condition and keeps watching for recurrence.",
    ],
  });

  return NextResponse.json({
    drill: {
      id: drill.id,
      status: drill.status,
      minerName: drill.minerName,
      netuid: drill.netuid,
    },
    finding,
    note:
      "Fault drill armed — sandbox miner is on the board and a scripted thermal warning is in Recommendations. Approve it to complete the loop.",
  });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const drill = await findDrillDeployment();
  if (!drill) return NextResponse.json({ note: "No fault drill to remove." });

  await db.deployment.update({
    where: { id: drill.id },
    data: { status: "terminated" },
  });
  const resolved = await autoResolve("GPU_HEALTH", THERMAL_DEDUPE_KEY);

  return NextResponse.json({
    note: `Fault drill ended — sandbox miner terminated, ${resolved} open finding(s) resolved into the change feed. $0.00 was ever spent.`,
  });
}
