import { NextRequest, NextResponse } from "next/server";
import {
  getDeployment,
  deleteDeployment,
  terminateDeployment,
} from "@/lib/infranex/deployment/engine";
import { requireActiveAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deployment = await getDeployment(id);
  if (!deployment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deployment });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // AUDIT-SEC-3 — destructive + can leave a paid pod running: admin-gated,
  // and the pod (if any) is terminated best-effort BEFORE the record is
  // deleted so nothing keeps billing with no UI/audit trail.
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { id } = await params;
  try {
    await terminateDeployment(id);
  } catch {
    // record already gone or pod teardown failed — deletion proceeds either way
  }
  try {
    await deleteDeployment(id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
