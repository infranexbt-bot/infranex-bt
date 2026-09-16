// Parse the 9 fetched subnetalpha pages: confirm netuid, org, extract the
// editorial description + any mining/how-it-works substance.
import * as fs from "fs";

const PAGES: Array<[number, string, string]> = [
  [30, "endure-network", "Endure Network"],
  [31, "rec4ll", "rec4ll"],
  [87, "provenonce", "Provenonce"],
  [95, "actual", "Actual"],
  [99, "thirty-spokes", "Thirty Spokes"],
  [109, "finsight", "Finsight"],
  [110, "green-compute", "Green Compute"],
  [116, "memo", "Memo"],
  [122, "cookingtao", "CookingTAO"],
];

function extract(html: string): { netuid: string | null; body: string } {
  let b = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  const netuid = b.match(/Subnet\s+(\d{1,3})\b/)?.[1] ?? null;
  // Block-level tags → newline; inline tags (a, b, i, code, span…) → removed
  // WITHOUT a newline so link text stays embedded in the sentence.
  b = b.replace(/<\/?(p|div|h[1-6]|li|tr|table|section|article|blockquote|pre|br)[^>]*>/gi, "\n");
  b = b.replace(/<[^>]*>/g, "");
  const text = b
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, "'")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !/^[.#{}@;]/.test(l) && !/^img\.|:is\(|display:|width:/.test(l));
  const start = text.findIndex((l) => /What exactly does it do/i.test(l));
  const stop = text.findIndex((l) => /Tokenomics|how do i|mining guide|team\b/i.test(l) && l.length < 40 && start >= 0 && text.indexOf(l) > start);
  const prose = text.slice(start + 1, stop > start ? stop : undefined)
    .filter((l) => l.length > 100);
  return { netuid, body: prose.join("\n\n").slice(0, 2800) };
}

const out: Record<string, unknown> = {};
for (const [netuid, slug, name] of PAGES) {
  const file = `/tmp/sa-${slug}.json`;
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    const html: string = (d.data ?? d).html ?? "";
    const { netuid: nu, body } = extract(html);
    out[String(netuid)] = {
      netuid,
      name,
      siteNetuid: nu ? Number(nu) : null,
      slug,
      url: `https://subnetalpha.ai/subnet/${slug}/`,
      summary: body,
      kind: body.length > 400 ? "editorial-summary" : "stub-or-thin",
    };
    console.log(`SN${netuid} ${name}: ${body.length} chars → ${out[String(netuid)].kind}`);
  } catch (e) {
    console.log(`SN${netuid} ${name} — FAIL: ${e instanceof Error ? e.message : e}`);
  }
}
fs.writeFileSync(
  "/home/z/my-project/download/subnetalpha-editorial-summaries.json",
  JSON.stringify(
    {
      source: "subnetalpha.ai (third-party editorial directory, WordPress)",
      fetchedAt: new Date().toISOString(),
      provenance: "third-party editorial — NOT official subnet docs; use for context only, label in UI",
      subnets: out,
    },
    null,
    2
  )
);

// Human-readable English companion
const name: Record<string, string> = {};
for (const [nu, , n] of PAGES) name[String(nu)] = n;
let md = `# Subnet Alpha — Editorial Summaries (English)\n\n`;
md += `Source: subnetalpha.ai — third-party editorial directory (NOT official subnet docs). Fetched ${new Date().toISOString().slice(0, 10)}.\n`;
md += `Covers the subnets we could not source from official GitHub repos. Use as context only; label provenance in any UI.\n\n`;
for (const [k, v] of Object.entries(out) as Array<[string, { summary: string; kind: string; url: string }]>) {
  md += `## SN${k} — ${name[k]}\n\n`;
  md += `Source page: ${v.url}\n\n`;
  md += v.kind === "editorial-summary" ? `${v.summary.trim()}\n\n` : `(Page is a stub — no editorial summary available.)\n\n`;
}
fs.writeFileSync("/home/z/my-project/download/subnetalpha-editorial-summaries.md", md);
console.log("\nwrote download/subnetalpha-editorial-summaries.json + .md");
