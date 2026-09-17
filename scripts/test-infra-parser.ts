/**
 * Quick infra-parser test against live READMEs (chutes-miner + a few controls).
 * Run: bun scripts/test-infra-parser.ts
 */
import { parseInfraStack } from "../src/lib/infranex/github-scraper";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "infranex-bt/1.0" }, cache: "no-store" });
  return res.ok ? await res.text() : "";
}

const CASES: Array<[string, string, string[]?]> = [
  ["SN64 chutes-miner", "https://raw.githubusercontent.com/chutesai/chutes-miner/main/README.md", ["kubernetes", "postgres", "redis", "gepetto"]],
  ["SN120 affine AGENTS.md", "https://raw.githubusercontent.com/AffineFoundation/affine/main/AGENTS.md"],
  ["neg control — no stack", "# Miner\n\nRun `python neurons/miner.py --netuid 1`. Requires 24GB VRAM GPU.\n"],
];

for (const [label, target, expect] of CASES) {
  const text = target.startsWith("http") ? await fetchText(target) : target;
  if (target.startsWith("http") && !text) { console.log(`\n=== ${label} === fetch failed, skipped`); continue; }
  const infra = parseInfraStack(text);
  console.log(`\n=== ${label} (${text.length} chars) ===`);
  if (!infra) { console.log("  no infra detected"); continue; }
  console.log(`  orchestration: ${infra.orchestration ?? "-"}`);
  console.log(`  ramRule: ${infra.ramRule ? infra.ramRule.quote.slice(0, 90) : "-"}`);
  for (const s of infra.services) {
    console.log(`  · ${s.name}${s.role ? ` — ${s.role.slice(0, 80)}` : ""}`);
  }
  if (expect) {
    const got = infra.services.map((s) => s.name);
    const missing = expect.filter((e) => !got.includes(e));
    console.log(missing.length ? `  ✗ MISSING: ${missing.join(", ")}` : `  ✓ all expected services detected`);
  }
}
