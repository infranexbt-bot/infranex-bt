import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";
import { getPrice } from "@/lib/infranex/prices";

// WEALTH-3 — Engine 01 · INVEST AI research briefs.
//
// POST /api/theses/ai-brief  { id, question? }
//
// One LLM run over the operator's own thesis + every hard number we can
// source live (entry/target/stop, live price if resolvable). The model is
// a research analyst: it stress-tests the argument, not a fortune teller —
// it may ONLY use the numbers provided; anything missing is "unknown".
// The brief is persisted on the thesis row (aiBrief / aiBriefAt).

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are the research desk of a crypto fund writing a one-page investment brief for a decision maker who already holds a view on the asset.

Output format (plain text, exactly these section headers, English only):
SNAPSHOT — 2-3 lines: what the asset is and the live numbers given.
BULL CASE — the strongest version of the operator's thesis, sharpened with their catalysts.
BEAR CASE — the strongest case against; use their risks and anything the thesis ignores.
WHAT TO WATCH — 3-5 concrete, checkable signals/events with the level or date where known.
RISK CONTROL — one paragraph: position-sizing and invalidation guidance tied to their stop/conviction. No financial advice disclaimers, just craft.
VERDICT — one blunt line: does the written thesis + numbers justify the stated conviction (HIGH/MEDIUM/LOW)? Say if conviction looks overconfident.

Rules: use ONLY the numbers provided in the input — never invent metrics, prices, dates or events. Unknown/missing data is "unknown", not zero. No pleasantries. Under 380 words.`;

export type CompletionFn = (messages: { role: string; content: string }[]) => Promise<string>;

async function defaultCompletion(messages: { role: string; content: string }[]): Promise<string> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    // Skill convention: the system prompt rides the "assistant" role.
    messages: messages.map((m, i) => ({
      role: i === 0 ? "assistant" : "user",
      content: m.content,
    })),
    thinking: { type: "disabled" },
  });
  const content = completion.choices[0]?.message?.content;
  if (!content || !content.trim()) throw new Error("AI brief returned an empty response");
  return content;
}

export async function POST(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const thesis = await db.investmentThesis.findUnique({ where: { id } });
  if (!thesis) return NextResponse.json({ error: "thesis not found" }, { status: 404 });

  // Live price best-effort — brief still works without it (labelled unknown).
  const tick = await getPrice(thesis.asset).catch(() => null);

  const parseList = (json: string): string[] => {
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  const catalysts = parseList(thesis.catalystsJson);
  const risks = parseList(thesis.risksJson);

  const context = {
    asset: thesis.asset,
    direction: thesis.direction,
    conviction: thesis.conviction,
    timeframe: thesis.timeframe,
    status: thesis.status,
    entryPrice: thesis.entryPrice ?? "unknown",
    targetPrice: thesis.targetPrice ?? "unknown",
    stopPrice: thesis.stopPrice ?? "unknown",
    livePrice: tick ? { price: tick.price, change24hPct: tick.change24h ?? "unknown", asOf: tick.fetchedAt } : "unavailable",
    thesisText: thesis.thesis || "(operator did not write the core argument)",
    catalysts: catalysts.length ? catalysts : "(none listed)",
    risks: risks.length ? risks : "(none listed)",
    operatorQuestion: typeof body?.question === "string" && body.question.trim() ? body.question.trim() : null,
    priceSource: tick ? tick.source : null,
    note: "Prices come from public exchange feeds; subnet-specific assets (e.g. SNxx-ALPHA) have no spot feed — treat livePrice as unavailable there.",
  };

  const userContent =
    (context.operatorQuestion ? `OPERATOR QUESTION: ${context.operatorQuestion}\n\n` : "") +
    `THESIS INPUT (JSON):\n${JSON.stringify(context, null, 2)}`;

  const messages = [
    { role: "assistant", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  const content = await defaultCompletion(messages);

  const row = await db.investmentThesis.update({
    where: { id },
    data: { aiBrief: content, aiBriefAt: new Date() },
  });

  await logAudit({
    action: "thesis.ai-brief",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `generated research brief for ${thesis.asset} (${content.length} chars)`,
  });

  return NextResponse.json({
    brief: content,
    generatedAt: row.aiBriefAt?.toISOString() ?? new Date().toISOString(),
  });
}
