#!/usr/bin/env python3
"""Update download/infranex-operator-handbook.html:
1. Rename Judge Lab -> Validator Lab everywhere (incl. verbs/chips/captions).
2. Reflect the DEPLOY-2 server-side ticker (lifecycle advances even with the tab closed).
3. Bump cover edition 1 -> 2.
Every replacement is asserted to occur exactly once; aborts without writing on any mismatch.
"""
import sys

PATH = "/home/z/my-project/download/infranex-operator-handbook.html"

REPLACEMENTS = [
    # --- cover ---
    ('<span class="cover-chip">Judge</span>', '<span class="cover-chip">Validate</span>'),
    ("Judge Lab closed loop", "Validator Lab closed loop"),
    ('<div class="cover-edition">Edition 1</div>', '<div class="cover-edition">Edition 2</div>'),
    # --- intro / overview ---
    ("capacity, connecting the node daemon, testing against the Judge Lab, and",
     "capacity, connecting the node daemon, testing against the Validator Lab, and"),
    ("continuously tests each miner against a simulated judge to tell you exactly what to fix.",
     "continuously tests each miner against a simulated validator to tell you exactly what to fix."),
    ("online before you run the Judge Lab&#8217;s Apply step.</b> Mining a judge profile runs on the",
     "online before you run the Validator Lab&#8217;s Apply step.</b> Mining a validator profile runs on the"),
    # --- golden path flow ---
    ('<div class="flow-title">Run the Judge Lab</div>', '<div class="flow-title">Run the Validator Lab</div>'),
    ('<div class="flow-where">Judge Lab</div>', '<div class="flow-where">Validator Lab</div>'),
    ('<div class="flow-where">Judge Lab &#8594; Apply</div>', '<div class="flow-where">Validator Lab &#8594; Apply</div>'),
    ("You touch Judge Lab again only when an alert fires", "You touch Validator Lab again only when an alert fires"),
    ("daemon online &#8594; Judge &#8594; Apply", "daemon online &#8594; Validate &#8594; Apply"),
    ("until an alert tells you to re-judge. If you ever wonder", "until an alert tells you to re-validate. If you ever wonder"),
    ("&#8220;when do I run the Judge Lab?&#8221;", "&#8220;when do I run the Validator Lab?&#8221;"),
    # --- phase 1 / 2 ---
    ("seat counts and emission numbers you are about to judge are current, not cached.",
     "seat counts and emission numbers you are about to evaluate are current, not cached."),
    ("Judge Lab and the Deploy Wizard, so having it in front of you avoids mistakes.",
     "Validator Lab and the Deploy Wizard, so having it in front of you avoids mistakes."),
    ("the Judge Lab in Phase&nbsp;4 will verify", "the Validator Lab in Phase&nbsp;4 will verify"),
    # --- phase 2 lifecycle (DEPLOY-2 server-side ticker) ---
    ("the lifecycle auto-advances while you watch, and when the deployment status flips to",
     "the lifecycle auto-advances on the platform server even if you close the tab, and when the deployment status flips to"),
    # --- phase 3 / 4 ---
    ("Judge Lab&#8217;s <b>Apply</b>", "Validator Lab&#8217;s <b>Apply</b>"),
    ("From this moment, Judge Lab Apply has somewhere real to push to.",
     "From this moment, Validator Lab Apply has somewhere real to push to."),
    ('<div class="section-title">Judge Lab\u00a0— Test, Read the Verdict, Apply</div>',
     '<div class="section-title">Validator Lab\u00a0— Test, Read the Verdict, Apply</div>'),
    ("The Judge Lab is the platform&#8217;s dress rehearsal",
     "The Validator Lab is the platform&#8217;s dress rehearsal"),
    ("Open <b>Judge Lab</b> and pick the <b>same netuid</b> your",
     "Open <b>Validator Lab</b> and pick the <b>same netuid</b> your"),
    ("The judge&#8217;s recommendations are subnet-specific", "The Lab&#8217;s recommendations are subnet-specific"),
    ("for one subnet&#8217;s judge may be wrong for another", "for one subnet&#8217;s validator may be wrong for another"),
    ('<span class="mono">Scoring against judge…</span>', '<span class="mono">Scoring against validator…</span>'),
    ("Availability fixes are deliberately manual; the judge will",
     "Availability fixes are deliberately manual; the Lab will"),
    ("judge-approved configuration.", "validator-approved configuration."),
    ("<b>When should you run the Judge Lab?</b>", "<b>When should you run the Validator Lab?</b>"),
    ("there is nothing to re-judge; spend the time on Monitoring instead.",
     "there is nothing to re-validate; spend the time on Monitoring instead."),
    # --- phase 5 operate ---
    ('<div class="section-title">Operate\u00a0— Monitor, Automate, Re-Judge</div>',
     '<div class="section-title">Operate\u00a0— Monitor, Automate, Re-Validate</div>'),
    ("a slow slide means the judge profile aged.", "a slow slide means the validator profile aged."),
    ("as your &#8220;go re-judge&#8221; signals", "as your &#8220;go re-validate&#8221; signals"),
    ("compare it against what the last Judge apply claimed to set.",
     "compare it against what the last Validator Lab apply claimed to set."),
    # --- troubleshooting table ---
    ("<tr><td>Judge <b>Apply</b> errors</td>", "<tr><td>Validator <b>Apply</b> errors</td>"),
    ("then Re-mine profile + re-run judge", "then Re-mine profile + re-run simulation"),
    # --- rhythms + quick reference ---
    ("daemon online &#8594; judge &#8594; apply the top fixes.",
     "daemon online &#8594; validate &#8594; apply the top fixes."),
    ("Re-run Judge Lab, compare the composite with last week",
     "Re-run Validator Lab, compare the composite with last week"),
    ("<tr><td>Judge</td><td>Judge Lab</td><td>Select subnet",
     "<tr><td>Validate</td><td>Validator Lab</td><td>Select subnet"),
    ("<tr><td>Apply</td><td>Judge Lab</td><td>Apply on a recommendation",
     "<tr><td>Apply</td><td>Validator Lab</td><td>Apply on a recommendation"),
    ("re-judge on UPSTREAM / BENCH REGRESS / weekly",
     "re-validate on UPSTREAM / BENCH REGRESS / weekly"),
    ("the closed Judge&#8594;Apply loop", "the closed Validate&#8594;Apply loop"),
    # --- ending ---
    ('<div class="ending-big">Mine. Judge. Apply.<br>Repeat.</div>',
     '<div class="ending-big">Mine. Validate. Apply.<br>Repeat.</div>'),
    ("let the Judge Lab find", "let the Validator Lab find"),
    ("Daemon online &#8594; Judge &#8594; Apply &#8594; Operate",
     "Daemon online &#8594; Validate &#8594; Apply &#8594; Operate"),
]


def main() -> int:
    with open(PATH, "r", encoding="utf-8") as f:
        html = f.read()

    failures = []
    for old, new in REPLACEMENTS:
        n = html.count(old)
        if n != 1:
            failures.append(f"count={n}: {old[:80]!r}")
            continue
        html = html.replace(old, new)

    if failures:
        print("ABORT — replacement count mismatches:")
        for f_ in failures:
            print("  " + f_)
        return 1

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(html)

    # verify no residual judge wording
    import re
    residual = [(i + 1, ln.rstrip()) for i, ln in enumerate(html.splitlines()) if re.search(r"judge", ln, re.I)]
    if residual:
        print("RESIDUAL judge mentions:")
        for ln, txt in residual:
            print(f"  L{ln}: {txt.strip()[:100]}")
        return 1
    print(f"OK — {len(REPLACEMENTS)} replacements applied, 0 residual 'judge' mentions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
