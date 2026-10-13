/**
 * SOCIAL-LINKS ENRICHMENT — build the per-subnet social link map that
 * mirrors subnetalpha.ai's subnet pages (Website / X / GitHub / Discord).
 *
 * Sources, in honesty order:
 *   1. ON-CHAIN  tool-results/subnet-identities.json (SubnetIdentitiesV3 —
 *                subnet_url / discord / subnet_contact / github_repo)
 *   2. DB        SubnetOverride.website / githubUrl (user-curated)
 *   3. README    raw.githubusercontent.com scrape of the repo README for
 *                x.com/twitter.com + discord.gg invites + a name-matched
 *                website when the chain left subnet_url blank.
 *
 * Output: tool-results/subnet-links.json — consumed by the generator that
 * bakes src/lib/infranex/subnet-links-seed.ts into the app bundle.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ROOT = "/home/z/my-project";
const IDENTITIES = `${ROOT}/tool-results/subnet-identities.json`;
const OUT = `${ROOT}/tool-results/subnet-links.json`;
const MAX_BODY = 3_000_000;

interface ChainIdentity {
  subnetName?: string;
  githubRepo?: string;
  subnetContact?: string;
  subnetUrl?: string;
  discord?: string;
  description?: string;
  additional?: [string, string];
}

interface LinkEntry {
  netuid: number;
  name: string;
  github: string | null;
  website: string | null;
  twitter: string | null;
  discord: string | null;
  contact: string | null;
  /** Where twitter/discord/website came from: chain | db | readme */
  sources: Record<string, string>;
}

// ---------------------------------------------------------------------------
// URL normalization + classification
// ---------------------------------------------------------------------------

function ensureHttps(url: string): string | null {
  const s = url.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  // Bare domains (hone.ai, www.x.io) — upgrade, but not emails/handles.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(s)) return `https://${s}`;
  return null;
}

function isDiscordInvite(s: string): boolean {
  return /^https?:\/\/(discord\.gg\/[\w-]+|discord\.com\/invite\/[\w-]+)/i.test(s.trim());
}

function normalizeDiscord(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // discord.gg/xxx without scheme
  if (/^discord\.gg\/[\w-]+$/i.test(s)) return `https://${s}`;
  if (/^discord\.com\/invite\/[\w-]+$/i.test(s)) return `https://${s}`;
  if (isDiscordInvite(s)) return s;
  return null; // "@handle" usernames are not invite links — skip honestly
}

function extractTwitter(text: string): string | null {
  if (!text) return null;
  // x.com or twitter.com user links — strip trailing punctuation, exclude
  // intent/share/status/hashtag/search/home pages and image hosts.
  const re =
    /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(@?[A-Za-z0-9_]{2,15})(?:[/?#]|$)/gi;
  const bad = /^(intent|share|home|search|hashtag|i|personalize|privacy|tos|settings)$/i;
  let m: RegExpExecArray | null;
  const found: string[] = [];
  while ((m = re.exec(text)) !== null) {
    const handle = m[1].replace(/^@/, "");
    if (bad.test(handle)) continue;
    const url = `https://x.com/${handle}`;
    if (!found.includes(url)) found.push(url);
  }
  return found[0] ?? null;
}

/** Domains that never count as "the official website". */
const NON_SITE =
  /(^|\.)(github\.com|githubusercontent\.com|x\.com|twitter\.com|discord\.gg|discord\.com|t\.me|telegram\.me|huggingface\.co|pypi\.org|npmjs\.com|doi\.org|arxiv\.org|medium\.com|substack\.com|youtube\.com|reddit\.com|docs\.google\.com|forms\.gle|gitbook\.io|gitbook\.com|notion\.so|netlify\.app|vercel\.app|pages\.dev|workers\.dev|readthedocs\.io|crates\.io|anaconda\.org|docker\.io|wandb\.ai|colab\.research\.google\.com)$/i;

/**
 * Pull the subnet's own homepage and read its X/Twitter identity.
 * Best signals, in order: <meta name="twitter:site" content="@handle">,
 * then x.com/twitter.com links in the served HTML. Static-only fetch —
 * SPA pages that render links client-side yield nothing (honest blank).
 */
async function twitterFromWebsite(website: string): Promise<string | null> {
  const html = await fetchRaw(website);
  if (!html) return null;
  // twitter:site meta — both attribute orders.
  const metaRe =
    /<meta[^>]+(?:name|property)=["']twitter:site["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*(?:name|property)=["']twitter:site["']/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const raw = (m[1] ?? m[2] ?? "").trim();
    if (!raw) continue;
    if (/^@?[A-Za-z0-9_]{2,15}$/.test(raw.replace(/^https?:\/\/x\.com\//i, ""))) {
      return `https://x.com/${raw.replace(/^@/, "").replace(/^https?:\/\/x\.com\//i, "")}`;
    }
  }
  const linkRe =
    /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/(@?[A-Za-z0-9_]{2,15})(?:[/?#"']|$)/gi;
  const bad = /^(intent|share|home|search|hashtag|i|personalize|privacy|tos|settings)$/i;
  while ((m = linkRe.exec(html)) !== null) {
    const handle = m[1].replace(/^@/, "");
    if (bad.test(handle)) continue;
    return `https://x.com/${handle}`;
  }
  return null;
}

function extractWebsite(readme: string, nameHint: string): string | null {
  // Prefer URLs whose domain overlaps the subnet name (e.g. "grail" →
  // "rayonx.ai/grail", "taoapp" → "tao.app"). Fall back to nothing —
  // an arbitrary badge link is worse than an honest blank.
  const urls = [...readme.matchAll(/https?:\/\/[^\s)"'<>\\\]]+/g)].map(
    (m) => m[0].replace(/[.,;:]+$/, "")
  );
  const hint = nameHint.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!hint) return null;
  const seen = new Set<string>();
  for (const u of urls) {
    let host: string;
    try {
      host = new URL(u).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (NON_SITE.test(host)) continue;
    const bare = host.replace(/^www\./, "");
    if (seen.has(bare)) continue;
    seen.add(bare);
    if (bare.includes(hint) || hint.includes(bare.split(".")[0])) return u;
  }
  return null;
}

// ---------------------------------------------------------------------------
// README fetching (raw.githubusercontent — no API quota)
// ---------------------------------------------------------------------------

async function boundedText(res: Response): Promise<string | null> {
  const len = Number(res.headers.get("content-length") ?? "0");
  if (!Number.isNaN(len) && len > MAX_BODY) return null;
  const text = await res.text();
  if (text.length > MAX_BODY) return null;
  return text;
}

async function fetchRaw(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "infranex-bt/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await boundedText(res);
  } catch {
    return null;
  }
}

function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function fetchReadme(
  owner: string,
  repo: string
): Promise<string | null> {
  const paths = ["README.md", "readme.md", "README.rst", "Readme.md", "AGENTS.md", "docs/README.md"];
  for (const branch of ["HEAD", "main", "master"]) {
    for (const p of paths) {
      const content = await fetchRaw(
        `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`
      );
      if (content) return content;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// DB overrides (user-curated website / githubUrl)
// ---------------------------------------------------------------------------

interface DbOverrides {
  get(netuid: number): { githubUrl: string | null; website: string | null } | undefined;
}

async function loadDbOverrides(): Promise<DbOverrides> {
  try {
    // Prisma client is generated under node_modules — dynamic import keeps the
    // script runnable even when the client is mid-regeneration.
    const mod = await import(`${ROOT}/node_modules/@prisma/client`);
    const prisma = new mod.PrismaClient();
    const rows = await prisma.subnetOverride.findMany({
      select: { netuid: true, githubUrl: true, website: true },
    });
    await prisma.$disconnect();
    const map = new Map(
      rows.map((r) => [r.netuid, { githubUrl: r.githubUrl, website: r.website }])
    );
    console.log(`db overrides: ${map.size} rows`);
    return { get: (n) => map.get(n) };
  } catch (e) {
    console.log(`db overrides unavailable (${(e as Error).message}) — chain+readme only`);
    return { get: () => undefined };
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const idents = JSON.parse(readFileSync(IDENTITIES, "utf8")) as {
    entries: Record<string, ChainIdentity>;
  };

  const db = await loadDbOverrides();

  // Gather candidate repos: chain github + DB override github.
  const repos = new Map<number, { owner: string; repo: string }>();
  for (const [k, v] of Object.entries(idents.entries)) {
    const netuid = Number(k);
    const gh = ensureHttps(v.githubRepo ?? "") ?? null;
    const parsed = gh ? parseRepoUrl(gh) : null;
    if (parsed) repos.set(netuid, parsed);
  }
  for (const netuidStr of Object.keys(idents.entries)) {
    const netuid = Number(netuidStr);
    const ov = db.get(netuid);
    if (ov?.githubUrl && !repos.has(netuid)) {
      const parsed = parseRepoUrl(ov.githubUrl);
      if (parsed) repos.set(netuid, parsed);
    }
  }
  console.log(`repos to scrape: ${repos.size}`);

  const entries: Record<string, LinkEntry> = {};
  let idx = 0;
  for (const [k, v] of Object.entries(idents.entries)) {
    const netuid = Number(k);
    const ov = db.get(netuid);
    const sources: Record<string, string> = {};

    // GitHub: CHAIN identity repo first (owner's current registration —
    // e.g. SN1 = macrocosm-os/apex), DB override only when the chain left
    // it blank. The reverse order picked up stale pre-dTAO repos.
    const ghChain = ensureHttps(v.githubRepo ?? "");
    const github = ghChain ?? (ov?.githubUrl ? ensureHttps(ov.githubUrl) : null) ?? null;

    // Website: DB > chain subnet_url > README (name-matched)
    let website = ov?.website ? ensureHttps(ov.website) : null;
    if (website) sources.website = "db";
    if (!website) {
      const chainUrl = ensureHttps(v.subnetUrl ?? "");
      // Chain values are team-registered — accept any http URL they set.
      if (chainUrl && /^https?:\/\//i.test(chainUrl)) {
        website = chainUrl;
        sources.website = "chain";
      }
    }

    // Twitter: chain contact if it is an x/twitter link; else README.
    const contact = (v.subnetContact ?? "").trim() || null;
    let twitter = extractTwitter(contact ?? "");
    if (twitter) sources.twitter = "chain";

    // Discord: chain field only when a real invite URL.
    let discord = normalizeDiscord(v.discord ?? "");
    if (discord) sources.discord = "chain";

    const parsed = repos.get(netuid);
    const name = (v.subnetName ?? "").trim() || `Subnet ${netuid}`;

    // Twitter: chain contact > subnet's own homepage > README.
    if (!twitter && website) {
      const tw = await twitterFromWebsite(website);
      if (tw) {
        twitter = tw;
        sources.twitter = "website";
      }
    }

    if (parsed) {
      const readme = await fetchReadme(parsed.owner, parsed.repo);
      idx++;
      if (idx % 20 === 0) console.log(`  scraped ${idx}/${repos.size}…`);
      if (readme) {
        if (!twitter) {
          const tw = extractTwitter(readme);
          if (tw) {
            twitter = tw;
            sources.twitter = "readme";
          }
        }
        if (!discord) {
          const m = readme.match(
            /https?:\/\/(?:discord\.gg\/[\w-]+|discord\.com\/invite\/[\w-]+)/i
          );
          const dc = m ? normalizeDiscord(m[0]) : null;
          if (dc) {
            discord = dc;
            sources.discord = "readme";
          }
        }
        if (!website) {
          const site = extractWebsite(readme, name);
          if (site) {
            website = site;
            sources.website = "readme";
          }
        }
      }
    }

    entries[netuid] = {
      netuid,
      name,
      github: github ?? null,
      website: website ?? null,
      twitter: twitter ?? null,
      discord: discord ?? null,
      contact,
      sources,
    };
  }

  const coverage = {
    total: Object.keys(entries).length,
    website: Object.values(entries).filter((e) => e.website).length,
    twitter: Object.values(entries).filter((e) => e.twitter).length,
    discord: Object.values(entries).filter((e) => e.discord).length,
    github: Object.values(entries).filter((e) => e.github).length,
  };
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        coverage,
        entries,
      },
      null,
      1
    )
  );
  console.log(`wrote ${OUT}`, coverage);
}

main().catch((e) => {
  console.error("enrich failed:", e);
  process.exit(1);
});
