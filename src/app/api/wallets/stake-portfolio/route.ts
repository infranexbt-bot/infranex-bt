import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { fetchStakePortfolio } from "@/lib/infranex/stake-portfolio";

// STAKE-PORTFOLIO-1 — read-only on-chain stake portfolio.
//
// GET /api/wallets/stake-portfolio[?hotkey=5A...&hotkey=5B...]
//
// Hotkey resolution order:
//   1. Explicit ?hotkey= params (validated SS58, max 8).
//   2. Otherwise: every hotkey the platform already knows — wallet-profile
//      hotAddresses + deployment hotkeys (deduped). Public keys only; the
//      platform holds no wallet secrets anywhere (WALLET-ECON-1).
//
// The response is pure observation: chain storage reads + platform rollups.
// It never signs, unstakes, or moves funds.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_HOTKEYS = 8;

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // 1. Resolve the hotkey set.
  const explicit = req.nextUrl.searchParams
    .getAll("hotkey")
    .map((h) => h.trim())
    .filter(Boolean);

  let hotkeys = explicit;
  let resolvedBy: "query" | "registry" = "query";

  if (hotkeys.length === 0) {
    resolvedBy = "registry";
    const [wallets, deployments] = await Promise.all([
      db.walletProfile.findMany({
        where: { hotAddress: { not: null } },
        select: { hotAddress: true, label: true },
      }),
      db.deployment.findMany({
        where: { hotkey: { not: null } },
        select: { hotkey: true },
      }),
    ]);
    hotkeys = [
      ...wallets.map((w) => w.hotAddress as string),
      ...deployments.map((d) => d.hotkey as string),
    ];
  }

  // Dedupe + cap. Wallet profiles first (they carry labels), then deployments.
  const seen = new Set<string>();
  hotkeys = hotkeys.filter((h) => (seen.has(h) ? false : (seen.add(h), true))).slice(0, MAX_HOTKEYS);

  // 2. Platform metadata per hotkey (labels, lifetime earnings, deployments).
  const metadata = new Map<
    string,
    { label?: string | null; lifetimeEarnedTao?: number; lifetimeEarnedUsd?: number; linkedDeployments?: number }
  >();

  if (hotkeys.length > 0) {
    const [wallets, earnings, deployCounts] = await Promise.all([
      db.walletProfile.findMany({
        where: { hotAddress: { in: hotkeys } },
        select: { hotAddress: true, label: true },
      }),
      db.earningsDaily.groupBy({
        by: ["hotkey"],
        where: { hotkey: { in: hotkeys } },
        _sum: { earnedTao: true, earnedUsd: true },
      }),
      db.deployment.groupBy({
        by: ["hotkey"],
        where: { hotkey: { in: hotkeys } },
        _count: { _all: true },
      }),
    ]);
    for (const w of wallets) {
      if (w.hotAddress) metadata.set(w.hotAddress, { ...metadata.get(w.hotAddress), label: w.label });
    }
    for (const e of earnings) {
      metadata.set(e.hotkey, {
        ...metadata.get(e.hotkey),
        lifetimeEarnedTao: e._sum.earnedTao ?? 0,
        lifetimeEarnedUsd: e._sum.earnedUsd ?? 0,
      });
    }
    for (const d of deployCounts) {
      if (d.hotkey) {
        metadata.set(d.hotkey, { ...metadata.get(d.hotkey), linkedDeployments: d._count._all });
      }
    }
  }

  // 3. Read the chain.
  const report = await fetchStakePortfolio(hotkeys, { metadata });

  return NextResponse.json(
    { resolvedBy, ...report },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
