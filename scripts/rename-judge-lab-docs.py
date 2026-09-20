"""Rename 'Judge Lab' -> 'Validator Lab' across guide docs (user-confirmed rename).

- Exact-case variants handled: "Judge Lab", "JUDGE LAB", "judge-lab" (img filename)
- Lowercase concept word "judge" (subnet's validator) is intentionally untouched.
- Renames the s18 screenshot file + its src reference.
- DOES NOT touch PDFs (regenerated separately from HTML).
"""
import re
from pathlib import Path

ROOT = Path("/home/z/my-project")
FILES = [
    ROOT / "docs/setup-guide/gpu-miner-setup-guide.html",
    ROOT / "docs/setup-guide/README.md",
]

# 1) rename screenshot + fix src ref
img = ROOT / "docs/setup-guide/images/s18-judge-lab.png"
if img.exists():
    img.rename(img.with_name("s18-validator-lab.png"))
    print("renamed image -> s18-validator-lab.png")

for f in FILES:
    text = f.read_text(encoding="utf-8")
    orig = text
    text = text.replace("s18-judge-lab.png", "s18-validator-lab.png")
    text = text.replace("Judge Lab", "Validator Lab")
    text = text.replace("JUDGE LAB", "VALIDATOR LAB")
    # alt text / captions may hold "judge-lab" hyphen variants (defensive)
    text = text.replace("judge-lab", "validator-lab")
    if text != orig:
        n = sum(1 for a, b in [(orig, text)] if a != b)
        f.write_text(text, encoding="utf-8")
        print(f"updated {f.name}")
    else:
        print(f"no change: {f.name}")

# verify
for f in FILES:
    t = f.read_text(encoding="utf-8")
    left_judge_lab = len(re.findall(r"Judge Lab|JUDGE LAB|judge-lab", t))
    new_count = len(re.findall(r"Validator Lab", t))
    print(f"{f.name}: leftover old-name={left_judge_lab}, validator-lab={new_count}")
