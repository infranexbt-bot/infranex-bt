#!/usr/bin/env python3
"""Rebuild the BOLD color line in lium-bootstrap.ts — v4, quote-exact.

Target TS line (validating by construction):
    'BOLD="' + E + '[1m"; GREEN="' + E + '[32m"; YELLOW="' + E + '[33m";
    RED="' + E + '[31m"; DIM="' + E + '[2m"; NC="' + E + '[0m"',
All SGR bracket codes built at runtime via code() — no raw patterns in source.
Idempotent via byte-exact comparison of the tail.
"""
PATH = "/home/z/my-project/src/lib/infranex/lium-bootstrap.ts"


def code(n: str) -> str:
    return "[" + n + "m"


def sgr_seg(n: str, nxt: str) -> str:
    # "' + E + '<code(n)>"; <nxt>="'
    return "' + E + '" + code(n) + '"; ' + nxt + '="'


target = "    'BOLD=\""
for n, nxt in [("1", "GREEN"), ("32", "YELLOW"), ("33", "RED"), ("31", "DIM"), ("2", "NC")]:
    target += sgr_seg(n, nxt)
# Final segment must carry the closing bash double-quote: '[0m"'
target += "' + E + '" + code("0") + chr(34) + "',"

# Sanity: even number of single-quotes outside... simple balance check.
assert target.count("'") % 2 == 0, "single-quote imbalance in target"

with open(PATH, "r", encoding="utf-8") as f:
    lines = f.read().split("\n")

hits = [i for i, l in enumerate(lines) if "'BOLD=" in l and "GREEN=" in l]
if len(hits) != 1:
    raise SystemExit(f"expected exactly one BOLD line, found {len(hits)}")

i = hits[0]
if lines[i] == target:
    print("already patched")
else:
    lines[i] = target
    with open(PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("patched OK, line now", len(target), "chars")
