import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/lib/auth-admin";
import { advanceDeployment } from "@/lib/infranex/deployment/engine";

export const dynamic = "force-dynamic";

// POST /api/deployments/[id]/tick — advance the deployment one step
// (advances real provisioning/rental → admin-gated, AUDIT-SEC-3)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const { id } = await params;
    const deployment = await advanceDeployment(id);
    return NextResponse.json({ deployment });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
