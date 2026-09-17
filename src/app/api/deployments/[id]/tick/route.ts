import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/lib/auth-admin";
import { tickDeployment } from "@/lib/infranex/deployment/engine";

export const dynamic = "force-dynamic";

// POST /api/deployments/[id]/tick — advance the deployment one step
// (advances real provisioning/rental → admin-gated, AUDIT-SEC-3).
// DEPLOY-AUDIT — must be tickDeployment (the engine's smart tick), NOT
// advanceDeployment: the smart tick polls runpod/vast provisioning instead
// of force-jumping to "provisioned" without an IP, no-ops while the setup
// runner is mid-flight, RETRIES a failed install phase on an explicit
// Advance press (the card labels the button "Retry install"), and only
// then falls through to the plain state advance. The raw advance skipped
// all of that — a failed setup jumped straight to ready → deploying.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const { id } = await params;
    const deployment = await tickDeployment(id);
    return NextResponse.json({ deployment });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
