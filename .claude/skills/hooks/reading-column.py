#!/usr/bin/env python3
"""Tailwind classes that narrow text to a reading column (daisy-alpine rule 3).

`max-w-3xl` on a paragraph caps it at 768px whatever the window is doing, so a
sentence wider than the cap breaks mid-phrase beside a full-width page. Measured
2026-09-01 on the Map view's tab gloss: the sentence wanted 842px, the cap gave
768, and `text-balance` then evened the halves to 426 and 412, which is why the
break reads as arbitrary. Rule 8 still wants `text-balance`; the cap is the
defect.

WHY THIS SHIPS WITH THE PLUGIN RATHER THAN LIVING IN scripts/. The class is a
model default, not a repo habit, so it arrives in every repo the same way. The
hook that refuses it (reading-column-guard.sh, beside this file) has to run from
any project root, so its engine has to travel with it. One file serves both the
hook and `npm run reading-column`; a second copy under scripts/ would be the
duplicate the registries doctrine warns about.

Two findings, both mechanical:

  reading column   max-w-prose | max-w-2xl | max-w-3xl | max-w-4xl,
                   or `container mx-auto`
  uncapped prose   a `prose` class run with no `max-w-none`, which is the same
                   cap at 65ch wearing a different name and invisible to a
                   max-w-* grep

Two suppressions. `modal-box` in the same class run is daisyUI component sizing,
not a reading measure. A `reading-column-ok` comment on the line is the explicit
opt-out, greppable so the exceptions stay countable.

The wider sizes are deliberately not here: max-w-5xl..7xl are page shells (25
uses in this repo, 21 centered, none on a text element) and everything xl and
below is components. `max-w-none` is how `prose` gets undone and must never be
flagged.

Advisory by default, in the idiom of dead-opacity.py; `--check` makes it a gate.
"""

import argparse
import os
import re
import sys

# The sizes rule 3 names. Held to the skill's text by
# tools/test/reading-column.test.mjs.
COLUMN_SIZES = ['prose', '2xl', '3xl', '4xl']

COLUMN = re.compile(r'\bmax-w-(?:' + '|'.join(COLUMN_SIZES) + r')\b')
CONTAINER = re.compile(r'\bcontainer\s+mx-auto\b|\bmx-auto\s+container\b')
PROSE = re.compile(r'(?:^|\s)prose(?:\s|$|-)')
OPT_OUT = 'reading-column-ok'

# Only a class attribute counts, never a bare quoted string and never the line.
# Both classes of finding name themselves in ordinary prose: `max-w-3xl` appears
# in code comments explaining why a cap was removed, and `prose` is an English
# word, which cost 161 false positives out of 234 on the first run of this
# scanner. The forms are `class="..."`, Alpine `:class="..."` (whose ternary
# arms come along inside the outer quotes), and a JS `{ class: '...' }` or
# `{ innerClass: '...' }`.
CLASS_ATTR = re.compile(
    r'''(?::|\b)class(?:Name)?\s*[=:]\s*(["'`])(.*?)\1'''
    r'''|\b[A-Za-z]+Class\s*:\s*(["'`])(.*?)\3''',
    re.IGNORECASE,
)

SKIP_DIRS = {'.git', 'node_modules', 'dist', 'archive', '.preview', 'thumbs'}
EXTENSIONS = {'.html', '.js', '.mjs'}

MESSAGE = (
    '{cls} narrows text to a reading column and is not allowed '
    '(daisy-alpine rule 3): the page\'s own layout sets the width. Note that a '
    'reading column is a common tell for explanatory prose (rule 2), and the '
    'fix is often to improve structural clarity so that the text can be removed.'
)

PROSE_MESSAGE = (
    'a `prose` class run with no `max-w-none` keeps Tailwind\'s own 65ch '
    'reading column, which is rule 3 in a form no max-w-* grep finds. Add '
    '`max-w-none`.'
)


def _class_runs(line):
    """Every class-attribute value on the line."""
    runs = []
    for m in CLASS_ATTR.finditer(line):
        # An empty `class=""` makes group 2 falsy but not None, so pick by
        # which branch matched rather than by truthiness.
        runs.append(m.group(2) if m.group(2) is not None else (m.group(4) or ''))
    return runs


def scan_text(text, path):
    """[(path, line_no, class, message)], in line order."""
    out = []
    lines = text.splitlines()
    for i, line in enumerate(lines, 1):
        # On the line, or on the line above, the way a lint disable reads. The
        # line above is not a convenience: markup built inside a JS template
        # literal cannot carry a `//` comment, and an HTML one would render
        # into the page. lib/alpineComponents/viewer.js is that case.
        if OPT_OUT in line or (i > 1 and OPT_OUT in lines[i - 2]):
            continue
        for run in _class_runs(line):
            if 'modal-box' in run:
                continue
            for pattern in (COLUMN, CONTAINER):
                for m in pattern.finditer(run):
                    cls = m.group(0)
                    out.append((path, i, cls, MESSAGE.format(cls=cls)))
            if PROSE.search(run) and 'max-w-none' not in run:
                out.append((path, i, 'prose', PROSE_MESSAGE))
    return out


def walk(roots):
    for root in roots:
        if os.path.isfile(root):
            yield root
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in sorted(filenames):
                if os.path.splitext(name)[1] in EXTENSIONS:
                    yield os.path.join(dirpath, name)


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('roots', nargs='*', default=['lib', 'pages', 'app'],
                    help='files or directories to scan (default: lib pages app)')
    ap.add_argument('--check', action='store_true',
                    help='exit 1 when anything is found, for a gate')
    ap.add_argument('--quiet', action='store_true',
                    help='print nothing; the exit code is the whole answer')
    args = ap.parse_args(argv[1:])
    roots = args.roots or ['lib', 'pages', 'app']

    found = []
    for path in walk(roots):
        try:
            with open(path, encoding='utf-8', errors='replace') as fh:
                text = fh.read()
        except OSError:
            continue
        found.extend(scan_text(text, path))

    if args.quiet:
        return 1 if (found and args.check) else 0

    for path, line, cls, _ in sorted(found):
        print(f'{path}:{line}: {cls}')

    if not found:
        print('reading-column: none; no text is narrowed to a reading column')
        return 0

    files = len({f for f, _, _, _ in found})
    print(f'\nreading-column: {len(found)} in {files} file(s); daisy-alpine rule 3')
    return 1 if args.check else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
