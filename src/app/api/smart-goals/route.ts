import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";

// SMART-FRAMEWORK-1 — Operator goal engine (SMART goals).
//
// GET    /api/smart-goals        — list all goals (newest first)
// POST   /api/smart-goals        — create goal (full SMART payload)
// PATCH  /api/smart-goals?id=... — update any subset (incl. milestone toggles)
// DELETE /api/smart-goals?id=... — remove goal
//
// Milestones are stored as a JSON string (Prisma/SQLite has no list type):
//   [{ text: string, done: boolean }]

export const dynamic = "force-dynamic";

const STATUSES = new Set(["draft", "active", "achieved", "at-risk", "abandoned"]);

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function normalizeMilestones(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((m) => {
      if (typeof m === "string") return { text: m.slice(0, 300), done: false };
      if (m && typeof m === "object") {
        const o = m as Record<string, unknown>;
        if (typeof o.text === "string" && o.text.trim()) {
          return { text: o.text.slice(0, 300), done: o.done === true };
        }
      }
      return null;
    })
    .filter((m): m is { text: string; done: boolean } => m !== null)
    .slice(0, 12);
  return JSON.stringify(items);
}

function serialize(row: Awaited<ReturnType<typeof db.smartGoal.findFirst>>) {
  if (!row) return null;
  let milestones: { text: string; done: boolean }[] = [];
  try {
    const parsed = JSON.parse(row.milestonesJson);
    if (Array.isArray(parsed)) milestones = parsed;
  } catch {
    /* keep empty */
  }
  return {
    ...row,
    milestones,
    deadline: row.deadline ? row.deadline.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const rows = await db.smartGoal.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ goals: rows.map(serialize) });
}

export async function POST(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const status = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "draft";
  const deadline = typeof body.deadline === "string" && body.deadline ? new Date(body.deadline) : null;
  if (deadline && Number.isNaN(deadline.getTime())) {
    return NextResponse.json({ error: "invalid deadline" }, { status: 400 });
  }

  const row = await db.smartGoal.create({
    data: {
      title,
      specific: typeof body.specific === "string" ? body.specific.slice(0, 4000) : "",
      metric: typeof body.metric === "string" ? body.metric.slice(0, 80) : "",
      target: num(body.target) ?? 0,
      current: num(body.current) ?? 0,
      achievable: typeof body.achievable === "string" ? body.achievable.slice(0, 4000) : "",
      confidence: Math.min(5, Math.max(1, Math.round(num(body.confidence) ?? 3))),
      relevant: typeof body.relevant === "string" ? body.relevant.slice(0, 4000) : "",
      deadline,
      milestonesJson: normalizeMilestones(body.milestones) ?? "[]",
      status,
    },
  });

  await logAudit({
    action: "smart-goal.create",
    actor: gate.session?.uid ?? "system",
    target: row.id,
    detail: `created SMART goal "${row.title}"`,
  });
  return NextResponse.json({ goal: serialize(row) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 160);
  for (const k of ["specific", "achievable", "relevant"] as const) {
    if (typeof body[k] === "string") patch[k] = (body[k] as string).slice(0, 4000);
  }
  if (typeof body.metric === "string") patch.metric = body.metric.slice(0, 80);
  if (body.target !== undefined) patch.target = num(body.target) ?? 0;
  if (body.current !== undefined) patch.current = num(body.current) ?? 0;
  if (body.confidence !== undefined) {
    patch.confidence = Math.min(5, Math.max(1, Math.round(num(body.confidence) ?? 3)));
  }
  if (typeof body.status === "string" && STATUSES.has(body.status)) patch.status = body.status;
  if ("deadline" in body) {
    const d = typeof body.deadline === "string" && body.deadline ? new Date(body.deadline) : null;
    if (d && Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "invalid deadline" }, { status: 400 });
    }
    patch.deadline = d;
  }
  const milestones = normalizeMilestones(body.milestones);
  if (milestones !== undefined) patch.milestonesJson = milestones;

  const row = await db.smartGoal.update({ where: { id }, data: patch });
  await logAudit({
    action: "smart-goal.update",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `updated SMART goal "${row.title}"`,
  });
  return NextResponse.json({ goal: serialize(row) });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const row = await db.smartGoal.delete({ where: { id } }).catch(() => null);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  await logAudit({
    action: "smart-goal.delete",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `deleted SMART goal "${row.title}"`,
  });
  return NextResponse.json({ ok: true });
}
