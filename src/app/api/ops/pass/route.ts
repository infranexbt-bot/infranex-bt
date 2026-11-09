import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { requireActiveAdmin } from "@/lib/auth-admin";
import { fetchLiveSnapshot } from "@/lib/infranex/chain";
import { runWinTierWatchPass } from "@/lib/infranex/win-odds-watch";
import { runComputeRotationPass } from "@/lib/infranex/compute-rotation";
import { runUidDefensePass } from "@/lib/infranex/uid-defense";
import { runRunwayPass } from "@/lib/infranex/runway";
import { runAutopilotPass } from "@/lib/infranex/autopilot";

export const dynamic = "force-dynamic";

// POST /api/ops/pass — the miner-facing watch suite, runnable on demand.
//
// Hosts with INFRANEX_WORKERS=off (small-RAM sandboxes) run no background
// workers, so the watchers that keep the miner honest — seat-flip radar,
// compute-rotation watcher, UID defense, immunity runway, autopilot — would
// never fire. This route runs ONE pass of the whole suite, in the devops
// worker's order, and returns the compact results. It is driven by an
// external cron (scripts/run-ops-pass.sh) holding the ops token.
//
// Auth: ops token (x-ops-token, timing-safe vs scripts/.ops-token) OR an
// active admin session. The token file is git-ignored and read at request
// time, so no secret lives in the repo or the env.
//
// Freshness: if the newest ChainSnapshot row is older than 5 minutes, one
// fetchLiveSnapshot() sweep runs first and persists a row (same shape as the
// chain worker) — the watchers read the DB, so without this their "latest
// two scans" would go stale on workers-off hosts. A chain failure degrades
// to the last stored snapshot; it never fails the pass.

const TOKEN_PATH = "/home/z/my-project/scripts/.ops-token";
const FRESH_MS = 5 * 60 * 1000;

function opsTokenValid(req: NextRequest): boolean {
  const header = req.headers.get("x-ops-token") ?? "";
  if (header.length === 0) return false;
  try {
    const expected = readFileSync(TOKEN_PATH, "utf8").trim();
    if (expected.length === 0) return false;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const tokenOk = opsTokenValid(req);
  if (!tokenOk) {
    // Fall back to admin session auth (UI / manual runs).
    const gate = await requireActiveAdmin(req);
    if ("error" in gate) {
      return NextResponse.json({ error: "ops token or admin session required" }, { status: gate.status });
    }
  }

  const startedAt = Date.now();
  const out: Record<string, unknown> = { evaluatedAt: new Date().toISOString() };
  const steps: { step: string; ms: number; ok: boolean; detail: string }[] = [];
  const step = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      steps.push({ step: name, ms: Date.now() - t0, ok: true, detail });
    } catch (e) {
      // A failing step must never fail the pass — the watchers are
      // independent and the next cron run retries everything.
      steps.push({
        step: name,
        ms: Date.now() - t0,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // 1 — snapshot freshness (persist a row when stale; tolerate chain failure)
  await step("snapshot", async () => {
    const latest = await db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
    const age = latest ? Date.now() - latest.createdAt.getTime() : Infinity;
    if (age < FRESH_MS) {
      return `snapshot fresh (age ${Math.round(age / 1000)}s) — sweep skipped`;
    }
    const snap = await fetchLiveSnapshot();
    await db.chainSnapshot.create({
      data: {
        blockNumber: snap.blockNumber,
        totalSubnets: snap.totalSubnets,
        scannedSubnets: snap.subnets.length,
        neuronCount: snap.neurons.length,
        taoPriceUsd: snap.taoPriceUsd,
        taoMarketCapUsd: snap.taoMarketCapUsd,
        taoChange24h: snap.taoChange24h,
        subnetsJson: JSON.stringify(snap.subnets),
        neuronsJson: JSON.stringify(snap.neurons),
        source: snap.source,
      },
    });
    // Prune (keep last 100) — same policy as the chain worker.
    const count = await db.chainSnapshot.count();
    if (count > 100) {
      const old = await db.chainSnapshot.findMany({
        orderBy: { createdAt: "desc" },
        skip: 100,
        select: { id: true },
      });
      if (old.length > 0) {
        await db.chainSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      }
    }
    return `new snapshot persisted (block ${snap.blockNumber}, ${snap.subnets.length} subnets, source ${snap.source})`;
  });

  // 2-6 — the watch suite, devops-worker order (rotation after uid-defense,
  // autopilot LAST so it sees every event the earlier watchers committed).
  await step("seat-flip", async () => {
    const r = await runWinTierWatchPass();
    return `checked ${r.checked}, committed ${r.committed}, resolved ${r.resolved}`;
  });
  await step("uid-defense", async () => {
    const r = await runUidDefensePass();
    return `evaluated ${r.evaluated}, skipped ${r.skipped}, findings ${r.findings.length}`;
  });
  await step("runway", async () => {
    const r = await runRunwayPass();
    return `evaluated ${r.evaluated}, skipped ${r.skipped}, findings ${r.findings.length}`;
  });
  await step("compute-rotation", async () => {
    const r = await runComputeRotationPass();
    return `deployments ${r.deployments}, committed ${r.committed}, refreshed ${r.refreshed}, healthy ${r.healthy}${r.notes.length ? ` — ${r.notes.join("; ")}` : ""}`;
  });
  await step("autopilot", async () => {
    const r = await runAutopilotPass();
    return `open ${r.openEvents}, rules ${r.rules}, acted ${r.acted.length}, skipped ${r.skipped.length}`;
  });

  const failing = steps.filter((s) => !s.ok);
  out.ok = failing.length === 0;
  out.steps = steps;
  out.durationMs = Date.now() - startedAt;
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
