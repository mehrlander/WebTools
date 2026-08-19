#!/usr/bin/env python3
"""Tailwind opacity modifiers on a daisyUI theme colour that generate no rule.

A class like `bg-primary/25` looks exactly like a class that works, and does
nothing. The failure is silent and, worse, INVERTED: a background falls back to
transparent, so the tint never draws, and text falls back to full strength, so
the thing meant to recede advances. Nothing errors, nothing warns, and on the
machine where the UI was built it simply looks like a taste decision.

MEASURED, not assumed (2026-08-19, headless Chromium against this app's own
stylesheet, reading getComputedStyle on injected elements):

    bg-primary/10 .. /90 by tens   generate
    bg-primary/0, /5, /25, /33,
      /75, /95, /100               DEAD  -> rgba(0, 0, 0, 0)
    bg-primary/[25%]               DEAD  (the bracket escape does not help)
    bg-red-500/<anything>          fine, including /0, /33, /95, /100
    bg-black/<anything>            fine

So the rule is NARROWER than "use tens": it is about daisyUI's THEME COLOURS,
which are CSS variables, and the working set is exactly the ramp daisyUI's own
stylesheet ships. A stock palette colour is compiled by the browser build and
takes any step. A scanner written to the looser rule would flag every
`bg-red-500/25` in the tree and be wrong about all of them, which is why the
colour list below is the whole classifier and is pinned by test.

Advisory by default, in the idiom of dead-links.py and stranded-titles.py: run
it, read the list, fix or shrug. `--check` makes it a gate, which is what
tools/test/dead-opacity.test.mjs uses, because unlike a stranded title this one
has no judgment in it: the class either generates or it does not.
"""

import argparse
import os
import re
import sys

# daisyUI 5's theme colours. Each is a CSS variable, which is what puts it on
# the shipped ramp instead of the browser build's compiler.
THEME_COLOURS = [
    'primary', 'primary-content',
    'secondary', 'secondary-content',
    'accent', 'accent-content',
    'neutral', 'neutral-content',
    'base-100', 'base-200', 'base-300', 'base-content',
    'info', 'info-content',
    'success', 'success-content',
    'warning', 'warning-content',
    'error', 'error-content',
]

# Utilities that take a colour and therefore an opacity modifier.
UTILITIES = [
    'bg', 'text', 'border', 'ring', 'outline', 'decoration', 'divide',
    'from', 'via', 'to', 'fill', 'stroke', 'accent', 'caret', 'placeholder',
    'shadow',
]

GENERATES = {10, 20, 30, 40, 50, 60, 70, 80, 90}

# Longest colour first, so `base-content` is not matched as `base` plus a
# leftover. A trailing `\b` would not save it: `base-100` ends in a digit and
# `content` starts a word.
_COLOURS = '|'.join(sorted(THEME_COLOURS, key=len, reverse=True))
_UTILS = '|'.join(UTILITIES)
PATTERN = re.compile(
    r'\b(?P<util>' + _UTILS + r')-(?P<colour>' + _COLOURS + r')'
    r'/(?P<step>\d{1,3}|\[[^\]\s]*\])'
)

SKIP_DIRS = {'.git', 'node_modules', 'dist', 'archive', '.preview', 'thumbs'}
EXTENSIONS = {'.html', '.js', '.mjs', '.md'}


def nearest_ten(step):
    """The step a reader most likely meant: nearest ten, TIES DOWN, and never
    below 10 since /0 does not generate either.

    Ties down is not a coin flip. It is what the estate's own sweep chose when
    it corrected 193 of these in PR #457: /45 went to /40 forty-seven times
    against /50 nine, /35 to /30 fifty-one against five, /25 to /20 twenty-seven
    against two. A value written between two steps was reaching for a little
    less than the step above it, so the step below is the closer reading of the
    intent. Only /5 and /8 had to go up, because nothing below 10 exists."""
    if step < 10:
        return 10
    if step > 90:
        return 90
    return min(GENERATES, key=lambda g: (abs(g - step), g))


def scan_text(text, path):
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        for m in PATTERN.finditer(line):
            step = m.group('step')
            if step.startswith('['):
                out.append((path, i, m.group(0), None))
                continue
            n = int(step)
            if n in GENERATES:
                continue
            out.append((path, i, m.group(0), nearest_ten(n)))
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

    for path, line, cls, suggestion in sorted(found):
        fix = cls.rsplit('/', 1)[0] + '/' + str(suggestion) if suggestion else '(no step generates)'
        print(f'{path}:{line}: {cls} -> {fix}')

    if not found:
        print('dead-opacity: none; every theme-colour opacity is on the shipped ramp (10..90 by tens)')
        return 0

    files = len({f for f, _, _, _ in found})
    print(f'\ndead-opacity: {len(found)} in {files} file(s); these classes generate no rule')
    return 1 if args.check else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
