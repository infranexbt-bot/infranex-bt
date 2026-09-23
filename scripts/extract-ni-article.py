#!/usr/bin/env python3
"""Extract readable text from the Neural Internet Medium article JSON."""
import html as htmllib
import json
import re

d = json.load(open("/tmp/ni_article.json"))
data = d.get("data", d)
raw = data.get("html", "")

# Drop style/script blocks and CSS
text = re.sub(r"<style[^>]*>.*?</style>", " ", raw, flags=re.S | re.I)
text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.S | re.I)
# Paragraph/heading breaks
text = re.sub(r"</(p|h1|h2|h3|h4|li|blockquote)>", "\n", text, flags=re.I)
text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
# Strip remaining tags
text = re.sub(r"<[^>]+>", " ", text)
text = htmllib.unescape(text)
# Collapse whitespace per line, drop empties and CSS-looking lines
lines = []
for ln in text.split("\n"):
    ln = re.sub(r"\s+", " ", ln).strip()
    if not ln or ln.startswith(("{", "}", ":root", "--", "html{", "body{")):
        continue
    if len(ln) > 400 and ("{" in ln or "var(" in ln):
        continue
    lines.append(ln)

out = "\n".join(lines)
print(f"TOTAL CHARS: {len(out)}\n")
print(out[:12000])
