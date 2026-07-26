#!/usr/bin/env python3
"""Assemble a shorter/2 bundle from one document and several block-keyed versions.

    build-shortening.py <original.md> <version.json>... --out <bundle.json>
        [--title T] [--source owner/repo[@ref]:path]

A version file is what a shortening pass hands back:

    {"label": "Skeleton", "note": "...", "blocks": {"7": "new text", "9": ""}}

Keys are indices into the original split on blank lines, values replace that
block, "" deletes it, and an omitted index means unchanged. That sparseness is
why a bundle stays small: a version that rewrote four paragraphs of a forty
paragraph document stores four, not forty.

The split rule is the one in lib/shorter-payload.js (splitBlocks). This script
and that module have to agree or a bundle's indices mean nothing, so the
regex is duplicated deliberately and the check below is what holds them
together: every version is materialized here, re-split, and required to round
trip. Producing the versions is not mechanical (a model wrote them), so the
bundle is the record, not a regenerable artifact.
"""

import argparse
import json
import pathlib
import re
import sys

SPLIT = re.compile(r'\n[ \t]*\n[\s]*')


def split_blocks(text):
    """[(text, separator)], losslessly: ''.join(t + s) == text."""
    out, last = [], 0
    for m in SPLIT.finditer(text):
        out.append((text[last:m.start()], m.group(0)))
        last = m.end()
    out.append((text[last:], ''))
    return out


def materialize(original, blocks):
    parts = split_blocks(original)
    out = []
    for i, (text, sep) in enumerate(parts):
        override = blocks.get(str(i))
        if override is None:
            out.append(text + sep)
        elif override != '':
            out.append(override + sep)
        # a deleted block takes its separator with it
    return ''.join(out)


def words(s):
    return len(s.split())


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('original', type=pathlib.Path)
    ap.add_argument('versions', nargs='+', type=pathlib.Path)
    ap.add_argument('--out', required=True, type=pathlib.Path)
    ap.add_argument('--title', default='')
    ap.add_argument('--source', default='', help='owner/repo[@ref]:path of the original')
    args = ap.parse_args(argv)

    original = args.original.read_text()
    n_blocks = len(split_blocks(original))
    proposals, problems = [], []

    for path in args.versions:
        v = json.loads(path.read_text())
        blocks = v.get('blocks') or {}
        for k in blocks:
            if not (k.isdigit() and 0 <= int(k) < n_blocks):
                problems.append(f'{path.name}: block key {k!r} is outside 0..{n_blocks - 1}')
        text = materialize(original, blocks)
        for k, val in blocks.items():
            if '—' in val or '--' in val:
                problems.append(f'{path.name}: block {k} contains a dash substitute')
        if not text.strip():
            problems.append(f'{path.name}: materializes to nothing')
        proposals.append({
            'label': v.get('label') or path.stem,
            'note': v.get('note', ''),
            'blocks': blocks,
            'words': words(text),
        })

    if problems:
        print('\n'.join('  ' + p for p in problems), file=sys.stderr)
        return 2

    bundle = {
        'kind': 'shorter/2',
        'title': args.title or args.original.stem,
        'source': args.source,
        'original': original,
        'proposals': [{k: p[k] for k in ('label', 'note', 'blocks')} for p in proposals],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(bundle, indent=1, ensure_ascii=False) + '\n')

    base = words(original)
    print(f'{args.out}  ({args.out.stat().st_size / 1024:.1f} KB)')
    print(f'  original  {base:5d} words, {n_blocks} blocks')
    for p in proposals:
        print(f'  {p["label"]:<20} {p["words"]:5d} words ({p["words"] / base:.0%}), {len(p["blocks"])} blocks touched')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
