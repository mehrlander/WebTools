#!/usr/bin/env python3
"""The defect the contract check structurally cannot see.

  seams.py <units.jsonl> <annotations.tsv> <original> <rewrite>

Removing a unit can break the unit next to it, and that neighbour SURVIVED, so
the contract counts it honoured. Three runs found six of these by hand before
this existed. Every check here fires only at a join, where something was
actually removed, which is what keeps an advisory heuristic small enough to read.
"""
import sys, json, csv, re

# A sentence that opens by pointing backwards is fine until the thing it points
# at is deleted. Anchored at the start of the surviving neighbour only.
BACKREF = re.compile(r'''^\W*(?:
    that|this|these|those|it|they|them|such|both|either|neither|each|
    then|so|instead|also|likewise|conversely|
    the\s+(?:remaining|other|same|latter|former|last|second|third|two|four)|
    (?:\w+er)\s+(?:than|and)
)\b''', re.I | re.X)

uf, af, origf, newf = sys.argv[1:5]
units = [json.loads(l) for l in open(uf)]
ann = {r['uid']: r for r in csv.DictReader(open(af), delimiter='\t')}
new = open(newf).read()
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
gone = {u['uid'] for u in units if ann[u['uid']]['verdict'] in ('DROP', 'MOVE')}
found, seen = [], set()

# 1. A neighbour left pointing at nothing.
for i, u in enumerate(units):
    if u['uid'] not in gone:
        continue
    for v in units[i + 1:]:
        if v['uid'] in gone:
            continue
        # One row per broken neighbour, not one per removed predecessor: a run
        # of five removals ahead of one sentence is one seam, not five.
        if (BACKREF.match(v['text']) and norm(v['text'])[:60] in norm(new)
                and v['uid'] not in seen):
            seen.add(v['uid'])
            found.append(('back-reference', v['uid'],
                          f"opens by pointing back, and {u['uid']} was removed",
                          norm(v['text'])[:90]))
        break

# 2. A heading that swallowed the text under it. A removed span can take the
#    newline with it, and markdown then renders the heading plus a sentence.
for n, line in enumerate(new.split('\n'), 1):
    m = re.match(r'#{1,6} +(.*)', line)
    # A heading does not normally end in a full stop, and does not normally run
    # past one. Either tell is enough; requiring both missed a heading that
    # swallowed exactly one sentence.
    if not m:
        continue
    t = m.group(1).strip()
    if (re.search(r'[.!?]$', t)
              or (re.search(r'[.!?]\s+\S', t) and len(t.split()) > 6)):
        found.append(('heading-absorbed', f'line {n}',
                      'a heading line carries prose after it', line[:90]))

# 3. A phrase the rewrite now says twice. A REWRITE that restates the neighbour
#    it was meant to absorb shows up as a shingle repeated in the output that
#    appeared once in the source. The script never sees the new text, so it
#    looks for the symptom rather than comparing versions.
def shingles(t, k=8):
    w = norm(t).lower().split()
    return [' '.join(w[i:i + k]) for i in range(max(0, len(w) - k + 1))]
from collections import Counter
oc = Counter(shingles(open(origf).read()))
for sh, n in Counter(shingles(new)).items():
    if n > 1 and oc[sh] < n:
        found.append(('said-twice', f'x{n}', 'the rewrite repeats a phrase the source said once', sh))

# 4. Indentation lost at a join. A removed span can take the indent of the line
#    after it, which silently drops a nested block out of its list item.
def indent_of(text, probe):
    for line in text.split('\n'):
        if line.strip().startswith(probe):
            return re.match(r'[ \t]*', line).group(0)
    return None
for i, u in enumerate(units):
    if u['uid'] not in gone:
        continue
    for v in units[i + 1:]:
        if v['uid'] in gone:
            continue
        probe = norm(v['text'])[:30]
        if probe:
            a, b = indent_of(open(origf).read(), probe), indent_of(new, probe)
            if a is not None and b is not None and a != b:
                found.append(('indent-changed', v['uid'],
                              f'was {len(a)} spaces, now {len(b)}, after {u["uid"]} went',
                              probe))
        break

print(f'READ       {origf} -> {newf}')
print(f'SEAMS      {len(found)} to look at (advisory: a join is worth a glance, '
      f'not always a fix)')
for kind, where, why, text in found:
    print(f'  [{kind}] {where}: {why}\n      {text}')
