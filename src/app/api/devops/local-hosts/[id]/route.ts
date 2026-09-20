import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/devops/local-hosts/[id] — revoke a local machine: marks it
 * revoked (its agent secret stops verifying immediately) and cancels any
 * still-queued commands.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  const host = await db.localHost.findUnique({ where: { id } });
  if (!host) return NextResponse.json({ error: "local host not found" }, { status: 404 });

  await db.$transaction([
    db.localHost.update({ where: { id }, data: { status: "revoked" } }),
    db.localCommand.updateMany({
      where: { hostId: id, status: { in: ["queued", "delivered"] } },
      data: { status: "canceled", finishedAt: new Date() },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
