/**
 * INFRANEX GPU research — Step 2d: last-mile recovery.
 * - Rendered README from repo HTML page (handles odd branches/README casing)
 * - CookingTao docs repos (Incentive-Mechanism, Developers-Partner-Program, profile README)
 */
import fs from "fs";

const DIR = "/home/z/my-project/scripts/gpu-research";
const RAW = `${DIR}/raw`;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 infranex-research";

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

// Extract readable text of the README article from a repo page HTML
function readmeFromRepoHtml(html) {
  const m = html.match(/<article[^>]*(?:id="readme"|class="[^"]*markdown-body[^"]*")[^>]*>([\s\S]*?)<\/article>/i);
  if (!m) return null;
  return m[1]
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|pre|code)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function saveReadme(netuid, content, url, note) {
  const f = `${RAW}/${netuid}.json`;
  const rec = JSON.parse(fs.readFileSync(f, "utf8"));
  if (rec.readmeStatus === "ok") return;
  rec.readme = content;
  rec.readmeUrl = url;
  rec.readmeStatus = "ok";
  rec.recoveryNote = note;
  fs.writeFileSync(f, JSON.stringify(rec));
  console.log(`SN${netuid}: RECOVERED via ${note} (${content.length} chars)`);
}

// 1) Affine SN120 + Albedo SN97 rendered pages
for (const [netuid, full] of [[120, "AffineFoundation/affine"], [97, "unarbos/albedo"]]) {
  const html = await fetchHtml(`https://github.com/${full}`);
  if (!html) { console.log(`SN${netuid}: page fetch failed for ${full}`); continue; }
  const txt = readmeFromRepoHtml(html);
  if (txt && txt.length > 200) saveReadme(netuid, txt, `https://github.com/${full}`, "rendered repo page");
  else console.log(`SN${netuid}: no readme article found on ${full} page (${txt ? txt.length : 0} chars)`);
}

// 2) CookingTao docs repos — merge their READMEs into SN122 record
{
  const f = `${RAW}/122.json`;
  const rec = JSON.parse(fs.readFileSync(f, "utf8"));
  const parts = [];
  for (const repo of ["Incentive-Mechanism", "Developers-Partner-Program", "assets"]) {
    const html = await fetchHtml(`https://github.com/CookingTao/${repo}`);
    if (!html) { console.log(`SN122: ${repo} page failed`); continue; }
    const txt = readmeFromRepoHtml(html);
    if (txt && txt.length > 200) {
      parts.push(`===== CookingTao/${repo} README =====\n${txt}`);
      console.log(`SN122: got CookingTao/${repo} README (${txt.length} chars)`);
    } else console.log(`SN122: ${repo} no readme (${txt ? txt.length : 0})`);
  }
  // profile README (org page)
  const prof = await fetchHtml("https://github.com/CookingTao");
  if (prof) {
    const txt = readmeFromRepoHtml(prof);
    if (txt && txt.length > 100) { parts.push(`===== CookingTao profile README =====\n${txt}`); console.log(`SN122: got profile README (${txt.length})`); }
  }
  if (parts.length) {
    rec.readme = parts.join("\n\n");
    rec.readmeUrl = "https://github.com/orgs/CookingTao/repositories";
    rec.readmeStatus = "ok";
    rec.recoveryNote = "CookingTao org docs repos (Incentive-Mechanism / Developers-Partner-Program / profile)";
    fs.writeFileSync(f, JSON.stringify(rec));
  }
}
console.log("last-mile recovery done");
