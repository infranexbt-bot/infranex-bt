"""Extract the front (cover) page of the guide into a standalone HTML
so cover_validate.js can check it in isolation (its intended scope)."""
import re

SRC = "/home/z/my-project/download/devops-engine-miner-guide.html"
OUT = "/home/z/my-project/scripts/guide-cover-only.html"

html = open(SRC, encoding="utf-8").read()

head_end = html.index("</head>") + len("</head>")
head = html[:head_end]

start = html.index('<div class="front">')
end = html.index("<!-- ================= BODY")
cover = html[start:end]

open(OUT, "w", encoding="utf-8").write(head + "\n<body>\n" + cover + "\n</body>\n</html>\n")
print("wrote", OUT)
