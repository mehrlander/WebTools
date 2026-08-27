#!/usr/bin/env python3
"""Re-anchor standoff annotations across an edit.

Offsets are a hint, not the anchor. Each unit carries a W3C-style quote
selector (prefix / exact / suffix); resolution walks four tiers and reports
which one caught it, so a run says how much annotation an edit actually cost.
"""
import sys, json, difflib, re
sys.path.insert(0, sys.path[0] or '.')
from segment import units as segment_units

CTX = 48
FUZZ = 0.72

def make_anchors(text):
    out = []
    for a, b, k, t in segment_units(text, 0):
        out.append({'exact': t, 'kind': k,
                    'prefix': text[max(0, a-CTX):a], 'suffix': text[b:b+CTX],
                    'start': a, 'end': b})
    return out

def resolve(anchor, new_text, new_units):
    ex = anchor['exact']
    hits = [m.start() for m in re.finditer(re.escape(ex), new_text)] if ex else []
    if len(hits) == 1:
        return 'EXACT', hits[0], 1.0
    if len(hits) > 1:
        best, bs = None, -1
        for h in hits:
            s = (difflib.SequenceMatcher(None, anchor['prefix'], new_text[max(0,h-CTX):h]).ratio()
                 + difflib.SequenceMatcher(None, anchor['suffix'], new_text[h+len(ex):h+len(ex)+CTX]).ratio())
            if s > bs: best, bs = h, s
        return 'EXACT-CTX', best, 1.0
    best, br = None, 0.0
    for (a, b, k, t) in new_units:
        r = difflib.SequenceMatcher(None, ex, t).ratio()
        if r > br: best, br = a, r
    if br >= FUZZ:
        return 'FUZZY', best, round(br, 3)
    return 'ORPHANED', None, round(br, 3)

if __name__ == '__main__':
    old_text = open(sys.argv[1], encoding='utf-8').read()
    new_text = open(sys.argv[2], encoding='utf-8').read()
    label = sys.argv[3]
    anchors = make_anchors(old_text)
    new_units = segment_units(new_text, 0)
    tally, rows = {}, []
    for an in anchors:
        tier, pos, conf = resolve(an, new_text, new_units)
        tally[tier] = tally.get(tier, 0) + 1
        rows.append((tier, conf, an['exact']))
    n = len(anchors)
    print(f'\n### {label}')
    print(f'    {n} annotated units, re-anchored into the edited file')
    for t in ('EXACT', 'EXACT-CTX', 'FUZZY', 'ORPHANED'):
        c = tally.get(t, 0)
        if c: print(f'      {t:<10} {c:>3}  ({100*c//n}%)')
    survived = n - tally.get('ORPHANED', 0)
    print(f'      -> {survived}/{n} survived ({100*survived//n}%), '
          f'{tally.get("ORPHANED",0)} need re-annotation')
    orph = [r for r in rows if r[0] == 'ORPHANED']
    if orph:
        print('    orphaned:')
        for t, c, ex in orph[:6]:
            print(f'      (best {c}) {" ".join(ex.split())[:110]}')
