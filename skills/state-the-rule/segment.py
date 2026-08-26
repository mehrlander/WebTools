#!/usr/bin/env python3
"""Segment a markdown range into annotation units with standoff offsets.

Standoff means: the source file is never modified. Each unit is addressed by
(path, char_start, char_end), so annotations live in a separate file and can be
recomputed, discarded, or re-pointed without touching the document.
"""
import re, sys, json, hashlib

# Sentence-ish split that respects markdown structure. Fenced code, tables and
# list bullets are units in their own right; prose splits on sentence enders,
# guarding the abbreviations and the `e.g.`/version-number cases that would
# otherwise shatter a sentence.
GUARD = [(r'\be\.g\.', '\x01'), (r'\bi\.e\.', '\x02'), (r'\betc\.', '\x03'),
         (r'\bvs\.', '\x04'), (r'(\d)\.(\d)', lambda m: m.group(1)+'\x05'+m.group(2))]

def unguard(s):
    for a, b in [('\x01','e.g.'),('\x02','i.e.'),('\x03','etc.'),('\x04','vs.'),('\x05','.')]:
        s = s.replace(a, b)
    return s

def units(text, base_off):
    out = []
    pos = 0
    # split into blocks on blank lines, keeping offsets
    for m in re.finditer(r'(?s)(.+?)(\n\s*\n|\Z)', text):
        block = m.group(1)
        bstart = m.start(1)
        if not block.strip():
            continue
        kind = 'prose'
        if block.lstrip().startswith('```'): kind = 'code'
        elif block.lstrip().startswith('|'): kind = 'table'
        elif re.match(r'\s*#{1,6} ', block): kind = 'heading'
        if kind != 'prose':
            out.append((base_off + bstart, base_off + bstart + len(block), kind, block))
            continue
        g = block
        for pat, rep in GUARD:
            g = re.sub(pat, rep, g)
        cur = 0
        for sm in re.finditer(r'(?s).*?[.!?](?=\s|$)|.+$', g):
            seg = sm.group(0)
            if not seg.strip():
                continue
            s0 = bstart + sm.start(); s1 = bstart + sm.end()
            out.append((base_off + s0, base_off + s1, 'sent', unguard(seg).strip()))
    return out

if __name__ == '__main__':
    path, l0, l1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    raw = open(path, encoding='utf-8').read()
    lines = raw.split('\n')
    base = sum(len(x) + 1 for x in lines[:l0-1])
    chunk = '\n'.join(lines[l0-1:l1])
    tag = re.sub(r'[^a-z]', '', path.lower().split('/')[-1].replace('.md',''))[:6]
    for i, (a, b, k, t) in enumerate(units(chunk, base), 1):
        uid = f'{tag}-{i:03d}'
        print(json.dumps({'uid': uid, 'path': path, 'start': a, 'end': b,
                          'kind': k, 'words': len(t.split()), 'text': t}, ensure_ascii=False))
