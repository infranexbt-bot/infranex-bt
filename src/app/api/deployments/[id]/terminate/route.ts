import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/lib/auth-admin";
import { terminateDeployment } from "@/lib/infranex/deployment/engine";

export const dynamic = "force-dynamic";

// POST /api/deployments/[id]/terminate — terminate the deployment
// (destroys a paid pod → admin-gated, AUDIT-SEC-3)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const { id } = await params;
    const deployment = await terminateDeployment(id);
    return NextResponse.json({ deployment });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
