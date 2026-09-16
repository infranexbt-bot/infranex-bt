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

function extract(html: string): { netuid: string | null; org: string | null; body: string } {
  let b = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  const netuid = b.match(/Subnet\s+(\d{1,3})\b/)?.[1] ?? null;
  const text = b
    .replace(/<[^>]*>/g, "\n")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[.#{}@;]/.test(l) && !/^img\.|:is\(|display:|width:/.test(l));
  const start = text.findIndex((l) => /What exactly does it do/i.test(l));
  const paras = start >= 0
    ? text.slice(start + 1).filter((l) => l.length > 80).slice(0, 6)
    : [];
  return { netuid, org: null, body: paras.join("\n\n").slice(0, 2600) };
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
console.log("\nwrote download/subnetalpha-editorial-summaries.json");
