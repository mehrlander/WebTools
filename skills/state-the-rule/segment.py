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
# An ORDERED-LIST MARKER is the fifth guard and the one that was missing. `1. `
# is a digit, a period and a space, which the sentence splitter read as a
# sentence ending after "1": every numbered item became a unit holding the
# marker and a unit holding the item. Neither renders. The marker alone is an
# `<ol>` with an empty `<li>`, and the item without its marker is a bare
# paragraph, so a three-step list drew as three empty numbers over three
# unindented sentences. The decimal guard below does not reach it, since that
# one needs a digit on BOTH sides of the period. Same `\d+\.` as BULLET, so the
# splitter and the guard agree on what a marker is.
GUARD = [(r'\be\.g\.', '\x01'), (r'\bi\.e\.', '\x02'), (r'\betc\.', '\x03'),
         (r'\bvs\.', '\x04'), (r'(\d)\.(\d)', lambda m: m.group(1)+'\x05'+m.group(2)),
         (r'(?m)^([ \t]{0,3}\d+)\.(?=[ \t])', lambda m: m.group(1)+'\x05')]

def unguard(s):
    for a, b in [('\x01','e.g.'),('\x02','i.e.'),('\x03','etc.'),('\x04','vs.'),('\x05','.')]:
        s = s.replace(a, b)
    return s

# A block is not always one unit. A heading with no blank line under it, and a
# run of list items with no blank lines between them, are each several units
# that happen to share a block. Splitting them is what lets a section be
# annotated at all: without it a 700-word section arrives as one `heading`.
BULLET = re.compile(r'(?m)^(?=[ \t]{0,3}(?:[-*+]|\d+\.)[ \t])')

def prose_units(block, bstart, base_off, out):
    g = block
    for pat, rep in GUARD:
        g = re.sub(pat, rep, g)
    for sm in re.finditer(r'(?s).*?[.!?](?=\s|$)|.+$', g):
        seg = sm.group(0)
        if not seg.strip():
            continue
        # The sentence ender is matched with a LOOKAHEAD, so the whitespace
        # after it is never consumed and arrives as the next match's leading
        # run. The text was already stripped here; the offsets were not, so a
        # unit's span claimed space its own text disowned. Measured on
        # CONVENTIONS.md: of 35 abutting pairs, 30 had the separator inside the
        # following unit and 5 inside the preceding one, which is a boundary
        # sitting in a different place depending on which sentence you ask.
        # Trim the span to the text, and the space between sentences goes
        # unclaimed exactly as the blank line between paragraphs already does.
        a = sm.start() + (len(seg) - len(seg.lstrip()))
        b = sm.end() - (len(seg) - len(seg.rstrip()))
        out.append((base_off + bstart + a, base_off + bstart + b,
                    'sent', unguard(seg).strip()))

# A fenced region is masked off BEFORE blocks are cut, not recognised as a block
# that happens to start with ```. Two reasons, both found by rolling this
# segmenter up against doc-audit's paragraph segmenter, which has always done it
# this way: a fence can open inside a list item, so its block does not start with
# one; and a fence body can contain blank lines, so the block splitter shreds it
# into pieces that carry no fence marker at all. That is what let the guide-PR
# template's placeholder lines be annotated as though they were rules.
FENCED = re.compile(r'(?ms)^[ \t]*```.*?^[ \t]*```[^\n]*\n?')


def block_units(block, bstart, base_off, out):
    if block.lstrip().startswith('```'):   # an unterminated fence FENCED missed
        out.append((base_off + bstart, base_off + bstart + len(block), 'code', block))
        return
    if block.lstrip().startswith('|'):
        out.append((base_off + bstart, base_off + bstart + len(block), 'table', block))
        return
    # A heading owns its own line only; whatever follows it is segmented on its
    # own terms.
    m = re.match(r'[ \t]*(#{1,6}) [^\n]*', block)
    if m:
        out.append((base_off + bstart, base_off + bstart + m.end(),
                    f'h{len(m.group(1))}', block[:m.end()].strip()))
        rest = block[m.end():]
        if rest.strip():
            block_units(rest, bstart + m.end(), base_off, out)
        return
    parts = [(mm.start(), mm.end()) for mm in
             re.finditer(r'(?s).+?(?=\n(?=[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]))|.+$', block)]
    if len(parts) > 1:
        for a, b in parts:
            if block[a:b].strip():
                prose_units(block[a:b], bstart + a, base_off, out)
        return
    prose_units(block, bstart, base_off, out)

def blocks(text, off, base_off, out):
    # split into blocks on blank lines, keeping offsets
    for m in re.finditer(r'(?s)(.+?)(\n\s*\n|\Z)', text):
        block = m.group(1)
        if not block.strip():
            continue
        # A BLOCK CAN ARRIVE WITH A LEADING NEWLINE, which is what a fence's own
        # trailing newline leaves behind: FENCED consumes it, so the text after
        # a fence opens with the newline that ended it. Every test in
        # block_units anchors at position 0, so a heading immediately after a
        # fence was read as prose. Found by holding the segmenter to the span
        # classifier over a 1,381-unit corpus, where it was the one disagreement.
        lead = len(block) - len(block.lstrip('\n'))
        block_units(block[lead:], off + m.start(1) + lead, base_off, out)


def units(text, base_off):
    out, pos = [], 0
    for m in FENCED.finditer(text):
        blocks(text[pos:m.start()], pos, base_off, out)
        out.append((base_off + m.start(), base_off + m.end(), 'code', m.group(0)))
        pos = m.end()
    blocks(text[pos:], pos, base_off, out)
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
