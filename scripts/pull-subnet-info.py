#!/usr/bin/env python3
"""
subnet-info-1 — Pull "what each subnet does + what the miner does" raw material.

Sources (priority order):
  1. Latest ChainSnapshot.subnetsJson  → name, identityDescription, identityGithub,
                                          minersCount, emission (live chain truth)
  2. SubnetOverride                    → description, requirementsSource (verified
                                          README repo), githubUrl, hostingRequirements
  3. GitHub README.md                  → intro + miner/validator sections extracted

Output: scripts/subnet-info-extracts/<netuid>.md  (structured raw material for synthesis)
        scripts/subnet-info-extracts/_coverage.json
"""
import sqlite3, json, os, re, time, urllib.request, urllib.error, sys

BASE = "/home/z/my-project"
OUT = os.path.join(BASE, "scripts", "subnet-info-extracts")
os.makedirs(OUT, exist_ok=True)

HEADERS = {"User-Agent": "infranex-research/1.0 (subnet capability audit)"}

def http_get(url, timeout=12):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception:
        return None

def repo_slug(url):
    """github.com/org/repo[/tree/...] → org/repo"""
    if not url:
        return None
    m = re.search(r"github\.com/([^/]+)/([^/#?]+)", url)
    if not m:
        return None
    return f"{m.group(1)}/{m.group(2)}"

def strip_noise(text):
    """Remove badges, HTML comments, <img>/<picture> blocks, front-matter."""
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    text = re.sub(r"<picture>.*?</picture>", " ", text, flags=re.S | re.I)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)          # images
    text = re.sub(r"\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)", " ", text)  # badge links
    text = re.sub(r"<img[^>]*>", " ", text, flags=re.I)
    text = re.sub(r"^---\n.*?\n---\n", " ", text, flags=re.S)   # front matter
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

HEADING = re.compile(r"^(#{1,4})\s+(.+?)\s*$", re.M)

def sectionize(md):
    """Split markdown into (heading, body) chunks."""
    matches = list(HEADING.finditer(md))
    if not matches:
        return [("intro", md.strip())]
    sections = []
    pre = md[: matches[0].start()].strip()
    if len(pre) > 80:
        sections.append(("intro", pre))
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        title = m.group(2).strip()
        body = md[m.end(): end].strip()
        sections.append((title, body))
    return sections

MINER_RX = re.compile(r"\b(miner|mining|for miners|miners|miner setup|miner guide|run.*miner|hardware)\b", re.I)
SKIP_RX = re.compile(r"(liquidat|trademark|license|contribut|code of conduct|changelog|security polic)", re.I)

def extract_from_readme(md):
    """Return dict: intro, miner_text, validator_text, purpose_text (chars capped)."""
    md = strip_noise(md)
    sections = sectionize(md)
    intro = sections[0][1][:1600] if sections else ""
    miner_parts, validator_parts, purpose_parts = [], [], []
    for title, body in sections:
        if not body:
            continue
        t = title.lower()
        if SKIP_RX.search(t):
            continue
        if MINER_RX.search(t) and len(body) > 120:
            miner_parts.append(f"### {title}\n{body[:2600]}")
        elif re.search(r"validator|validating", t) and len(body) > 120:
            validator_parts.append(f"### {title}\n{body[:900]}")
        elif re.search(r"what is|about|overview|introduction|the subnet|description|how (it|the) work", t) and len(body) > 120:
            purpose_parts.append(f"### {title}\n{body[:1800]}")
    return {
        "intro": intro,
        "purpose": "\n\n".join(purpose_parts)[:2600],
        "miner": "\n\n".join(miner_parts)[:4200],
        "validator": "\n\n".join(validator_parts)[:1200],
    }

def fetch_readme(slug):
    """Try branches/paths; return (text, branch) or (None, None)."""
    for path in ("README.md", "readme.md", "Readme.md"):
        for branch in ("main", "master", "stgr", "universe"):
            url = f"https://raw.githubusercontent.com/{slug}/{branch}/{path}"
            txt = http_get(url)
            if txt and len(txt) > 200 and "<!DOCTYPE html" not in txt[:200]:
                return txt, f"{branch}/{path}"
    return None, None

def main():
    con = sqlite3.connect(os.path.join(BASE, "db", "custom.db"))
    cur = con.cursor()

    # 1) live chain snapshot
    row = cur.execute(
        "SELECT subnetsJson FROM ChainSnapshot ORDER BY createdAt DESC LIMIT 1"
    ).fetchone()
    subs = json.loads(row[0])
    chain = {s["netuid"]: s for s in subs}

    # 2) overrides
    ov_rows = cur.execute(
        "SELECT netuid, name, description, githubUrl, requirementsSource, "
        "hostingRequirements FROM SubnetOverride"
    ).fetchall()
    ov = {}
    for netuid, name, desc, gurl, rsrc, hosting in ov_rows:
        o = ov.get(netuid, {})
        if name: o["name"] = name
        if desc and (not o.get("description") or len(desc) > len(o["description"])):
            o["description"] = desc
        if rsrc: o["reqSource"] = rsrc
        if gurl and not o.get("githubUrl"): o["githubUrl"] = gurl
        if hosting:
            try:
                h = json.loads(hosting)
                notes = h.get("notes") or []
                if notes: o["hostingNotes"] = notes[:4]
            except Exception:
                pass
        ov[netuid] = o

    coverage = {"total": len(chain), "readme_ok": 0, "readme_fail": [], "no_repo": []}
    for netuid in sorted(chain):
        s = chain[netuid]
        o = ov.get(netuid, {})
        name = s.get("name") or o.get("name") or f"Subnet {netuid}"
        # repo priority: verified requirementsSource > identityGithub > override githubUrl
        repo = repo_slug(o.get("reqSource")) or repo_slug(s.get("identityGithub")) or repo_slug(o.get("githubUrl"))

        lines = []
        lines.append(f"# NETUID {netuid} — {name}")
        lines.append(f"\n## CHAIN (live)")
        lines.append(f"- miners: {s.get('minersCount')} | validators: {s.get('validatorsCount')}")
        lines.append(f"- miner emission: {s.get('minerEmissionTaoPerDay')} TAO/day "
                     f"(rewarded miners: {s.get('rewardedMiners')})")
        lines.append(f"- alpha price: {s.get('movingPrice')} | emissionEnabled: {s.get('emissionEnabled')}")
        if s.get("identityDescription"):
            lines.append(f"- on-chain description: {s['identityDescription']}")
        if s.get("identityGithub"):
            lines.append(f"- on-chain github: {s['identityGithub']}")
        if o.get("description"):
            lines.append(f"- repo/registry description: {o['description'][:500]}")
        if o.get("hostingNotes"):
            lines.append(f"- known hosting notes: {'; '.join(o['hostingNotes'])}")
        lines.append(f"- repo used: {repo or 'NONE'}")

        readme_block = ""
        if repo:
            md, branch = fetch_readme(repo)
            if md:
                coverage["readme_ok"] += 1
                ext = extract_from_readme(md)
                readme_block = (
                    f"\n\n## README ({repo} @ {branch})\n"
                    f"### INTRO\n{ext['intro']}\n"
                    + (f"\n{ext['purpose']}\n" if ext["purpose"] else "")
                    + (f"\n{ext['miner']}\n" if ext["miner"] else "  (no explicit miner section found)\n")
                    + (f"\n{ext['validator']}\n" if ext["validator"] else "")
                )
            else:
                coverage["readme_fail"].append({"netuid": netuid, "repo": repo})
        else:
            coverage["no_repo"].append(netuid)

        lines.append(readme_block)
        with open(os.path.join(OUT, f"{netuid}.md"), "w") as f:
            f.write("\n".join(lines))
        time.sleep(0.25)  # polite to raw.githubusercontent

    with open(os.path.join(OUT, "_coverage.json"), "w") as f:
        json.dump(coverage, f, indent=2)
    print(f"subnets={coverage['total']} readme_ok={coverage['readme_ok']} "
          f"readme_fail={len(coverage['readme_fail'])} no_repo={len(coverage['no_repo'])}")
    print("fail repos:", [x["repo"] for x in coverage["readme_fail"]][:25])
    print("no repo netuids:", coverage["no_repo"][:25])

if __name__ == "__main__":
    main()
