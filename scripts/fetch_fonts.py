"""Download Inter + JetBrains Mono latin woff2 files from Google Fonts and
rewrite the guide HTML to use local @font-face rules (relative paths)."""
import re, urllib.request, pathlib

CSS_URL = ("https://fonts.googleapis.com/css2?"
           "family=Inter:wght@400;600;700;800;900&"
           "family=JetBrains+Mono:wght@400;600;700&display=swap")
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
HTML = pathlib.Path("/home/z/my-project/download/devops-engine-miner-guide.html")
FONT_DIR = HTML.parent / "fonts"
FONT_DIR.mkdir(exist_ok=True)

req = urllib.request.Request(CSS_URL, headers={"User-Agent": UA})
css = urllib.request.urlopen(req, timeout=20).read().decode()

# Parse blocks: comment /* latin */ followed by @font-face {...}
blocks = re.findall(r"/\*\s*(\w[\w-]*)\s*\*/\s*@font-face\s*\{([^}]+)\}", css)
faces = []
for subset, body in blocks:
    if subset != "latin":
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
    weight = re.search(r"font-weight:\s*(\d+)", body).group(1)
    url = re.search(r"src:\s*url\(([^)]+)\)", body).group(1)
    slug = "inter" if fam == "Inter" else "jbmono"
    fname = f"{slug}-{weight}.woff2"
    dest = FONT_DIR / fname
    if not dest.exists():
        data = urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30).read()
        dest.write_bytes(data)
    faces.append((fam, weight, fname, dest.stat().st_size))
    print(f"{fam} {weight} -> {fname} ({dest.stat().st_size//1024} KB)")

rules = "\n".join(
    f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};"
    f"src:url('fonts/{fn}') format('woff2');}}"
    for fam, w, fn, _ in faces)

html = HTML.read_text(encoding="utf-8")
link_re = re.compile(r'<link href="https://fonts\.googleapis\.com[^"]*" rel="stylesheet">')
assert link_re.search(html), "Google Fonts link not found"
html = link_re.sub(f"<style>\n{rules}\n</style>", html)
HTML.write_text(html, encoding="utf-8")
print("HTML rewritten with local @font-face rules")
