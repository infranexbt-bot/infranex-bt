import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

// AUDIT-SEC-2 — the override's githubUrl feeds the DevOps requirements
// profiler → install-plan `git clone`; it must be a plain https github.com
// repo URL (owner/repo charset strictly re-checked in parseGithubUrl).
const GITHUB_URL_RE = /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*(\.git)?(\/.*)?$/;

// GET /api/subnets/[netuid]/override — get the user override for a subnet
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ netuid: string }> }
) {
  const { netuid } = await params;
  const n = parseInt(netuid, 10);
  const override = await db.subnetOverride.findUnique({ where: { netuid: n } });
  return NextResponse.json({ override });
}

// PUT /api/subnets/[netuid]/override — create or update the override.
// Mutates shared catalog data that drives installs → active-user gated
// (session + DB revocation check), not just the proxy.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ netuid: string }> }
) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { netuid } = await params;
  const n = Number.parseInt(netuid, 10);
  if (!Number.isFinite(n) || n < 0 || n > 255) {
    return NextResponse.json({ error: "Invalid netuid" }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const githubUrl = typeof body.githubUrl === "string" && body.githubUrl.trim() ? body.githubUrl.trim() : null;
  if (githubUrl && !GITHUB_URL_RE.test(githubUrl)) {
    return NextResponse.json(
      { error: "githubUrl must be a https://github.com/owner/repo URL" },
      { status: 400 }
    );
  }
  if (body.tags !== undefined && body.tags !== null && !Array.isArray(body.tags)) {
    return NextResponse.json({ error: "tags must be an array" }, { status: 400 });
  }

  const data = {
    name: typeof body.name === "string" ? body.name : null,
    description: typeof body.description === "string" ? body.description : null,
    category: typeof body.category === "string" ? body.category : null,
    minVramGb:
      typeof body.minVramGb === "string" && /^\d+$/.test(body.minVramGb.trim())
        ? Number.parseInt(body.minVramGb, 10)
        : typeof body.minVramGb === "number" && Number.isFinite(body.minVramGb)
          ? Math.trunc(body.minVramGb)
          : null,
    recommendedGpu: typeof body.recommendedGpu === "string" ? body.recommendedGpu : null,
    githubUrl,
    website: typeof body.website === "string" ? body.website : null,
    tags: Array.isArray(body.tags) ? JSON.stringify(body.tags) : null,
  };

  const override = await db.subnetOverride.upsert({
    where: { netuid: n },
    create: { netuid: n, ...data },
    update: data,
  });

  // OVERLAY-1 — the requirements profiler caches per netuid (6h TTL). A user
  // override can change the repo URL / VRAM, so drop the cached profile; the
  // next pull re-fetches requirements from the user's repo immediately.
  await db.subnetRequirements
    .deleteMany({ where: { netuid: n } })
    .catch(() => {});

  return NextResponse.json({ override });
}

// DELETE /api/subnets/[netuid]/override — remove the override (revert to curated).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ netuid: string }> }
) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { netuid } = await params;
  const n = Number.parseInt(netuid, 10);
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: "Invalid netuid" }, { status: 400 });
  }
  // deleteMany is idempotent (no P2025 on missing rows) and still surfaces
  // real DB failures instead of swallowing them and claiming success.
  const gone = await db.subnetOverride.deleteMany({ where: { netuid: n } });
  // OVERLAY-1 — revert to the chain profile: drop the cached requirements.
  await db.subnetRequirements
    .deleteMany({ where: { netuid: n } })
    .catch(() => {});
  return NextResponse.json({ success: true, removed: gone.count });
}
