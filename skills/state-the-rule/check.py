#!/usr/bin/env python3
"""Both post-cut checks in one run: the annotation contract, and references.

  check.py <units.jsonl> <annotations.tsv> <original> <rewrite>

Stage one of the contract is a fuzzy match; it over-reports, so every candidate
breach is printed for a stage-two content probe rather than treated as a finding.
"""
import sys, json, csv, re
sys.path.insert(0, sys.path[0] or '.')
from segment import units as seg
from reanchor import resolve

norm = lambda s: re.sub(r'\s+', ' ', s).strip()
uf, af, origf, newf = sys.argv[1:5]
units = {json.loads(l)['uid']: json.loads(l) for l in open(uf)}
ann = {r['uid']: r for r in csv.DictReader(open(af), delimiter='\t')}
orig = open(origf).read(); new = open(newf).read()
# When the annotation covers one section, slice BOTH sides to it. Comparing a
# section against a whole file inverts the size figure and hides losses.
SEC = '## Surfacing primitives'
if SEC in orig and 'CONVENTIONS' not in origf:
    orig = orig.split(SEC)[1].split('\n---')[0]
    if SEC in new: new = new.split(SEC)[1].split('\n---')[0]
nn = norm(new); nu = [(a, b, k, norm(t)) for a, b, k, t in seg(new, 0)]

breach, ghost, honoured = [], [], 0
for uid, d in units.items():
    v = ann[uid]['verdict']
    tier, _, conf = resolve({'exact': norm(d['text']), 'prefix': '', 'suffix': '',
                             'start': 0, 'end': 0}, nn, nu)
    if v == 'KEEP':
        if tier != 'ORPHANED' or conf >= 0.45: honoured += 1
        else: breach.append((d['words'], conf, ann[uid]['label'], d['text']))
    elif v in ('DROP', 'MOVE') and tier in ('EXACT', 'EXACT-CTX'):
        ghost.append((d['words'], ann[uid]['label'], d['text']))

nk = sum(1 for u in units if ann[u]['verdict'] == 'KEEP')
def refs(t):
    # Compare by basename: `surface.md` and `docs/envelopes/surface.md` name the
    # same destination, so a path being made more specific is not a loss.
    return {x.split('/')[-1] for x in
            re.findall(r'`?([\w./-]+\.(?:md|json|csv|py|html|mjs))`?', t)
            if not x.startswith('http') and '//' not in x}
# A reference that lived only inside a unit the annotation sent away goes with
# it legitimately: it was evidence, not a live pointer to an owner. Subtract
# those before reporting, or the check punishes a correct removal.
sent_away = ' '.join(units[k]['text'] for k in units
                     if ann[k]['verdict'] in ('DROP', 'MOVE'))
kept_src = ' '.join(units[k]['text'] for k in units
                    if ann[k]['verdict'] not in ('DROP', 'MOVE'))
lost = sorted((refs(orig) - refs(new)) & refs(kept_src))
excused = sorted((refs(orig) - refs(new)) - refs(kept_src))

print(f'CONTRACT   KEEP honoured {honoured}/{nk}   candidate breaches {len(breach)}   '
      f'not-removed {len(ghost)}')
print(f'REFERENCES lost {len(lost)}: {lost or "none"}'
      + (f'   (excused, lived only in removed units: {excused})' if excused else ''))
print(f'SIZE       {len(orig.split())}w -> {len(new.split())}w  '
      f'({100-round(100*len(new.split())/len(orig.split()))}% cut)')
if breach:
    print('\nCandidate breaches (verify each by content before calling it a loss):')
    for w, c, lab, t in sorted(breach, reverse=True):
        print(f'  {w:>3}w [{lab}] {norm(t)[:100]}')
