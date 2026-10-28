#!/usr/bin/env python3
"""Patch bt_build.py dispatch + table/caption to route text through nb()."""
import re

P = '/home/z/my-project/scripts/bt_build.py'
src = open(P, encoding='utf-8').read()

pairs = [
    # body
    ("story.append(Paragraph(payload, S['body']))",
     "story.append(Paragraph(nb(payload), S['body']))"),
    # bullets item
    ("story.append(Paragraph('\\u2022\u00a0\u00a0%s' % item,\n                                   S['bullet']))",
     "story.append(Paragraph('\\u2022\u00a0\u00a0%s' % nb(item),\n                                   S['bullet']))"),
    # numbered item
    ("story.append(Paragraph('<b>%d.</b>\u00a0\u00a0%s' % (i, item),\n                                   S['numbered']))",
     "story.append(Paragraph('<b>%d.</b>\u00a0\u00a0%s' % (i, nb(item)),\n                                   S['numbered']))"),
    # quote
    ("quote_block(payload, story)", "quote_block(nb(payload), story)"),
    # table cells
    ("data.append([Paragraph(c, S['td']) for c in row])",
     "data.append([Paragraph(nb(c), S['td']) for c in row])"),
    # captions (both builders)
    ("caption = Paragraph(spec['caption'], S['caption'])",
     "caption = Paragraph(nb(spec['caption']), S['caption'])"),
]

n_applied = 0
for old, new in pairs:
    if old in src:
        src = src.replace(old, new)
        n_applied += 1
    elif new in src:
        n_applied += 1  # already patched
    else:
        print('WARN not found:', old[:60].replace('\n', '\\n'))

open(P, 'w', encoding='utf-8').write(src)
print('applied/verified:', n_applied, 'of', len(pairs))
