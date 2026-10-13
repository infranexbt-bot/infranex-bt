import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";
import { loadFunding } from "@/lib/infranex/funding";
import { getPrices } from "@/lib/infranex/prices";

// WEALTH-4 — AlphaChaser scan: one AI run over a compact, number-dense
// market digest. Inputs (all key-free public sources):
//   · Hyperliquid perp funding extremes (annualized carry, OI, volume, 24h move)
//   · Live prices + 24h change for TAO and the funding-scan assets
//   · The operator's own journal edge (win rate, avg R, top pairs)
// Output: 0-3 concrete setups, strict JSON, persisted to the signal inbox.
// The model may ONLY pick pairs and use numbers from the digest — no invented
// levels. It is a scanner assist, not an executor; nothing here trades.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are AlphaChaser, a tactical crypto setups scanner for a solo operator who hunts asymmetric perp opportunities and Bittensor (TAO) moves.

You receive a MARKET DIGEST: funding extremes (annualized %), mark prices, 24h changes, open interest, volumes, live TAO data, and the operator's trade journal stats.

Produce 0 to 3 setups. STRICT JSON array only — no prose before or after:
[{"pair":"SYMBOL","signal":"LONG"|"SHORT"|"NEUTRAL","entry":number,"stop":number,"target":number,"confidence":0-100,"timeframe":"e.g. 3-7 days","rationale":"2 sentences max: the trigger and the invalidation"}]

Hard rules:
- pair MUST be chosen from the digest's tradable assets (the funding table symbols, or TAO).
- entry must be within ±3% of the digest mark price (or TAO live price); stop and target must respect a minimum 1.5R reward-to-risk and sit on plausible sides of entry for the signal direction.
- confidence reflects setup quality honestly; emit FEWER setups when the digest is unconvincing. An empty array [] is a valid answer.
- rationale must cite digest numbers (funding %, 24h change, volume). No invented metrics, no news you are not given.
- Numbers only in numeric fields.`;

export type CompletionFn = (messages: { role: string; content: string }[]) => Promise<string>;

async function defaultCompletion(messages: { role: string; content: string }[]): Promise<string> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: messages.map((m, i) => ({
      role: i === 0 ? "assistant" : "user",
      content: m.content,
    })),
    thinking: { type: "disabled" },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content || !content.trim()) throw new Error("AlphaChaser returned an empty response");
  return content;
}

function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const focus = typeof body.focus === "string" ? body.focus.slice(0, 300) : "";

  // 1) Build the digest — every source failure tolerated independently.
  const fundingTop = await loadFunding()
    .then((s) => s.rows.slice(0, 14))
    .catch(() => []);

  const watchSymbols = ["TAO", ...fundingTop.map((r) => r.asset).filter((a) => a !== "TAO")];
  const priceMap = await getPrices(watchSymbols.slice(0, 16)).catch(() => ({
    prices: {} as Record<string, { price: number; change24h: number | null }>,
  }));

  const closedTrades = await db.tradeSetup.findMany({
    where: { resultR: { not: null } },
    orderBy: { closedAt: "desc" },
    take: 30,
  });
  const wins = closedTrades.filter((t) => (t.resultR ?? 0) > 0).length;
  const journal = {
    closedTrades: closedTrades.length,
    winRatePct: closedTrades.length ? Math.round((wins / closedTrades.length) * 100) : null,
    avgR: closedTrades.length
      ? Math.round((closedTrades.reduce((a, t) => a + (t.resultR ?? 0), 0) / closedTrades.length) * 100) / 100
      : null,
  };

  const digest = {
    fundingExtremes: fundingTop.map((r) => ({
      asset: r.asset,
      markPx: r.markPx,
      fundingAnnualPct: Math.round(r.fundingAnnualPct * 100) / 100,
      carrySide: r.carrySide,
      openInterestUsd: r.openInterestUsd != null ? Math.round(r.openInterestUsd) : null,
      dayVolumeUsd: r.dayVolumeUsd != null ? Math.round(r.dayVolumeUsd) : null,
      change24hPct: r.change24hPct != null ? Math.round(r.change24hPct * 100) / 100 : null,
    })),
    livePrices: Object.fromEntries(
      Object.entries(priceMap.prices).map(([s, t]) => [s, { price: t.price, change24hPct: t.change24h }])
    ),
    journal,
    tradableAssets: ["TAO", ...fundingTop.map((r) => r.asset)],
    note: "Funding is annualized hourly funding on Hyperliquid perps. Positive funding = shorts collect carry; negative = longs collect. TAO may have no funding row — trade TAO with the live price only.",
  };

  const userContent =
    (focus ? `OPERATOR FOCUS: ${focus}\n\n` : "") +
    `MARKET DIGEST (JSON):\n${JSON.stringify(digest)}`;

  const messages = [
    { role: "assistant", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  const completion = (await defaultCompletion(messages)).trim();
  const arr = extractJsonArray(completion);
  if (arr == null) {
    return NextResponse.json(
      { error: "AlphaChaser returned an unparseable response", raw: completion.slice(0, 500) },
      { status: 502 }
    );
  }

  // 2) Validate + clamp every setup before persisting.
  const created: string[] = [];
  const rejected: string[] = [];
  const tradable = new Set(digest.tradableAssets.map((a) => a.toUpperCase()));
  const prices = priceMap.prices;

  for (const item of arr.slice(0, 3)) {
    const s = (item ?? {}) as Record<string, unknown>;
    const pair = String(s.pair ?? "").toUpperCase().replace(/-?USDT$/, "");
    const signal = String(s.signal ?? "").toUpperCase();
    const entry = Number(s.entry);
    const stop = Number(s.stop);
    const target = Number(s.target);
    const confidence = Number(s.confidence);

    if (!pair || !tradable.has(pair)) { rejected.push(`${pair || "?"}: pair not in digest`); continue; }
    if (!["LONG", "SHORT", "NEUTRAL"].includes(signal)) { rejected.push(`${pair}: bad signal`); continue; }
    if (!Number.isFinite(entry) || entry <= 0) { rejected.push(`${pair}: bad entry`); continue; }

    const ref = prices[pair]?.price ?? null;
    if (ref && Math.abs(entry - ref) / ref > 0.03) { rejected.push(`${pair}: entry ${entry} >3% off mark ${ref}`); continue; }

    if (signal !== "NEUTRAL") {
      if (!Number.isFinite(stop) || !Number.isFinite(target) || stop <= 0 || target <= 0) {
        rejected.push(`${pair}: missing stop/target`); continue;
      }
      const risk = Math.abs(entry - stop);
      const reward = Math.abs(target - entry);
      if (risk <= 0 || reward / risk < 1.5) { rejected.push(`${pair}: R:R < 1.5`); continue; }
      const longOk = signal === "LONG" && stop < entry && target > entry;
      const shortOk = signal === "SHORT" && stop > entry && target < entry;
      if (!longOk && !shortOk) { rejected.push(`${pair}: levels on wrong side of entry`); continue; }
    }

    const row = await db.botSignal.create({
      data: {
        botName: "AlphaChaser",
        pair,
        signal,
        entry: Math.round(entry * 1e6) / 1e6,
        stop: Number.isFinite(stop) ? stop : null,
        target: Number.isFinite(target) ? target : null,
        confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 100) : null,
        timeframe: typeof s.timeframe === "string" ? s.timeframe.slice(0, 40) : "",
        rationale: typeof s.rationale === "string" ? s.rationale.slice(0, 500) : "",
      },
    });
    created.push(row.id);
  }

  await logAudit({
    action: "alphachaser.scan",
    actor: gate.session?.uid ?? "system",
    target: "alpha-chaser",
    detail: `scan produced ${created.length} signal(s), ${rejected.length} rejected`,
  });

  return NextResponse.json({
    created: created.length,
    rejected,
    digestMeta: {
      fundingRows: fundingTop.length,
      pricedSymbols: Object.keys(prices).length,
      journal,
      scannedAt: new Date().toISOString(),
    },
  });
}
