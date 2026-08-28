#!/usr/bin/env python3
"""Candidate-question extractor over a sessions/ record. Mechanical only."""
import json, re, sys, glob
from collections import Counter

FENCE  = re.compile(r'```.*?```', re.S)
INLINE = re.compile(r'`[^`\n]*`')
URL    = re.compile(r'https?://\S+')
XMLISH = re.compile(r'<[^>\n]{1,80}>')

NOT_HUMAN = re.compile(
    r'^(Base directory for this skill:|Stop hook feedback:|<system-reminder>'
    r'|<command-|Caveat: The messages below|<local-command-|<wake reason=)')

# an ask that carries no question mark
IMPERATIVE = re.compile(
    r'^\s*(let me know|tell me|assess whether|check whether|find out|curious'
    r'|wondering|thoughts on|any thoughts|weigh in|see if|look into|confirm whether'
    r'|i(\'m| am) not sure (whether|if)|worth knowing)\b', re.I)

# a '?' sentence that is not really an ask
RHETORICAL = re.compile(
    r'^(right|no\?|yes\?|ok|okay|yeah|sure|correct)\?*$', re.I)

def strip_noise(t):
    t = FENCE.sub(' ⟦code⟧ ', t)
    t = INLINE.sub(' ⟦c⟧ ', t)
    t = URL.sub(' ⟦url⟧ ', t)
    return t

def sentences(t):
    # split on terminal punctuation, keeping the terminator
    parts = re.split(r'(?<=[.!?])\s+|\n{2,}', t)
    return [p.strip() for p in parts if p.strip()]

def candidates(text):
    out = []
    for s in sentences(strip_noise(text)):
        s1 = ' '.join(s.split())
        if len(s1) > 500: s1 = s1[:500] + '…'
        w = len(s1.split())
        if s1.endswith('?'):
            if RHETORICAL.match(s1) or w < 2: continue
            out.append(('qmark', s1))
        elif IMPERATIVE.match(s1) and w >= 3:
            out.append(('imper', s1))
    return out

def load(path):
    d = json.load(open(path))
    ev = []
    for p in d.get('prompts', []):
        t = p['text'].lstrip()
        if NOT_HUMAN.match(t[:120]): kind = 'inject'
        else: kind = 'user'
        ev.append({'at': p['at'], 'role': kind, 'text': p['text']})
    for r in d.get('replies', []):
        ev.append({'at': r['at'], 'role': 'asst', 'text': r['text']})
    ev.sort(key=lambda e: e['at'])
    return d, ev

def scan(path, show=True):
    d, ev = load(path)
    qs = []
    for i, e in enumerate(ev):
        if e['role'] == 'inject': continue
        for how, s in candidates(e['text']):
            qs.append({'at': e['at'], 'by': 'user' if e['role']=='user' else 'claude',
                       'how': how, 'q': s, 'idx': i})
    if show:
        print(f"# {path.split('/')[-1]}  schema {d.get('schema')}  "
              f"{len(d.get('prompts',[]))} prompts / {len(d.get('replies',[]))} replies")
        print(f"# opening: {d.get('opening_ask','')[:100]}")
        print(f"# candidates: {len(qs)}  "
              f"(user {sum(1 for q in qs if q['by']=='user')}, "
              f"claude {sum(1 for q in qs if q['by']=='claude')})\n")
        for q in qs:
            tag = 'U' if q['by']=='user' else 'A'
            print(f"[{tag} {q['at'][11:16]} {q['how']}] {q['q']}")
    return qs

if __name__ == '__main__':
    for p in sys.argv[1:]:
        scan(p); print()
