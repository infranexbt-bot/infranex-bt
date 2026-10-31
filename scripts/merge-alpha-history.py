#!/usr/bin/env python3
"""Union-merge two .alpha-price-history.json versions (merge conflict resolution).

Takes the local (ours) and remote (theirs) stage-2/3 blob contents and merges
the `samples` arrays by timestamp `t`. On identical timestamps the local sample
wins (local lineage is the newer one). Output: sorted, deduped samples.
"""
import json
import subprocess
import sys

REPO = "/home/z/my-project"
PATH = ".alpha-price-history.json"


def blob(ref: str):
    out = subprocess.run(
        ["git", "-C", REPO, "show", f"{ref}:{PATH}"],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)


def main() -> None:
    ours = blob(":2")   # stage 2 = ours
    theirs = blob(":3")  # stage 3 = theirs

    merged: dict = {}
    for side in (theirs, ours):  # ours last → wins ties
        for s in side.get("samples", []):
            t = s.get("t")
            if t is None:
                continue
            merged[t] = s

    samples = [merged[t] for t in sorted(merged)]
    out = {"v": ours.get("v", theirs.get("v", 2)), "samples": samples}

    with open(f"{REPO}/{PATH}", "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"ours samples:    {len(ours.get('samples', []))}")
    print(f"theirs samples:  {len(theirs.get('samples', []))}")
    print(f"merged samples:  {len(samples)}")


if __name__ == "__main__":
    sys.exit(main())
