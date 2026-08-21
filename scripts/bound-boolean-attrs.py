#!/usr/bin/env python3
"""An Alpine boolean attribute bound to a value that can be undefined, which
turns the attribute ON.

Alpine's x-bind ends with this, in module.esm.js:

    if (result === undefined && typeof expression === 'string'
        && expression.match(/\\./)) result = ''

and bind() removes an attribute only for null, undefined and false. '' is none
of those, so for a BOOLEAN attribute it takes the other branch, sets the value
to the attribute's own name, and writes it. A dotted expression that came back
undefined therefore disables a button, freezes an input, or checks a box. It is
a bug with no error, no warning, and no visible cause: the author reads
`:disabled="row.busy"`, sees a field that is plainly not true, and the attribute
is in the DOM anyway.

MEASURED, not assumed (2026-08-21, this repo, PR #469). Two controls were dead
in the shipped app for exactly this reason and nobody had found the cause:

    fab.js          :disabled="L.sealed"   readLayers stamps `sealed` only on a
                                           sealed row, so every readable row in
                                           the drawer's layer strip was
                                           disabled, the selected one included
    transform-      :disabled="r.fixed"    bundleRows() stamps `fixed` on the
    workbench.js                           meta row alone, so no key row in the
                                           bundle checklist could be toggled

Both had passing tests. A test that calls a method on the component cannot see
an attribute the template put on a button, which is why this is a scan over the
markup rather than more cases in a suite.

WHAT IS FLAGGED, and the line is drawn where the exposure is:

    an ACCESSOR CHAIN, flagged      a.b   a?.b   a[i].b   f().b   a.b.c
    anything with an operator       !a.b   a.b || c   a.b === 'x'   !!a.b

A chain that only fetches is a value that may simply be absent, and every one
of them is one key away from the bug above. An expression carrying an operator
has been through something that returns a real boolean, and `!x` on a missing
key is `true`, never undefined. A call WITH ARGUMENTS also ends the chain: the
author wrote a function to answer this question and its return type is that
function's contract, not a field that might not be there. Flagging those would
have meant 12 findings instead of 12 and a great deal of noise from
`isStaging(row.repo, row.name)` and its kind.

The fix is always the same: `!!`.

WHAT IT CANNOT SEE, said plainly rather than left to be discovered. An
expression with an operator is not scanned at all, so `a.x || b.y` still carries
the bug when `a.x` is falsy and `b.y` is missing. Handling that means reading
which operand can reach the result, which is a parser rather than a scan; the
whole class is worth one more look if a case ever shows up. Nothing in this tree
does today.

Advisory by default, in the idiom of dead-opacity.py and dead-links.py: run it,
read the list, add the `!!`. --check makes it a gate, which is what
tools/test/bound-boolean-attrs.test.mjs uses, because there is no judgment in
it: either the expression can be undefined or it cannot.
"""

import argparse
import os
import re
import sys

# Alpine's own booleanAttributes set (packages/alpinejs/src/utils/bind.js).
# Copied whole rather than trimmed to the ones this repo uses today: the set is
# what decides whether bind() writes the attribute's name or its value, so a
# shorter list here would silently stop covering an attribute the moment
# somebody bound one.
BOOLEAN_ATTRS = [
    'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
    'default', 'defer', 'disabled', 'formnovalidate', 'inert', 'ismap',
    'itemscope', 'loop', 'multiple', 'muted', 'nomodule', 'novalidate', 'open',
    'playsinline', 'readonly', 'required', 'reversed', 'selected',
    'shadowrootclonable', 'shadowrootdelegatesfocus', 'shadowrootserializable',
]

# `:disabled="..."` or `x-bind:disabled='...'`, capturing the expression. The
# quote style is captured so the other one can appear inside the expression,
# which it routinely does.
BINDING = re.compile(
    r'(?::|x-bind:)(?P<attr>' + '|'.join(BOOLEAN_ATTRS) + r')\s*=\s*'
    r'(?P<q>["\'])(?P<expr>.*?)(?P=q)',
    re.S,
)

# An accessor chain and nothing else: an identifier, then only property reads,
# bracket reads and empty calls, ending on a read. `[^\[\]]*` inside a bracket
# keeps the chain from swallowing a nested index, which would let an operator
# through; a nested one is rare enough to leave unflagged rather than to parse.
_STEP = r'(?:\s*\??\.\s*[A-Za-z_$][\w$]*|\s*\[[^\[\]]*\]|\s*\(\s*\))'
_TAIL = r'(?:\s*\??\.\s*[A-Za-z_$][\w$]*|\s*\[[^\[\]]*\])'
CHAIN = re.compile(r'^[A-Za-z_$][\w$]*' + _STEP + r'*' + _TAIL + r'\s*$')

SKIP_DIRS = {'.git', 'node_modules', 'dist', 'archive', '.preview', 'thumbs'}
EXTENSIONS = {'.html', '.js', '.mjs'}
DEFAULT_ROOTS = ['lib', 'pages', 'app', 'popups']


def exposed(expr):
    """Whether this expression can hand x-bind an undefined.

    Two conditions, and both are Alpine's rather than ours: the coercion only
    fires when the expression string contains a dot, and only a fetch can come
    back undefined.
    """
    expr = expr.strip()
    return '.' in expr and bool(CHAIN.match(expr))


def scan_text(text, path):
    out = []
    for m in BINDING.finditer(text):
        expr = m.group('expr')
        if not exposed(expr):
            continue
        line = text[:m.start()].count('\n') + 1
        out.append((path, line, m.group('attr'), expr.strip()))
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
    ap.add_argument('roots', nargs='*', default=DEFAULT_ROOTS,
                    help='files or directories to scan (default: %s)' % ' '.join(DEFAULT_ROOTS))
    ap.add_argument('--check', action='store_true',
                    help='exit 1 when anything is found, for a gate')
    args = ap.parse_args(argv[1:])
    roots = args.roots or DEFAULT_ROOTS

    found = []
    for path in walk(roots):
        try:
            with open(path, encoding='utf-8', errors='replace') as fh:
                text = fh.read()
        except OSError:
            continue
        found.extend(scan_text(text, path))

    for path, line, attr, expr in sorted(found):
        print(f'{path}:{line}: :{attr}="{expr}" -> :{attr}="!!{expr}"')

    if not found:
        print('bound-boolean-attrs: none; every bound boolean attribute '
              'resolves to a real boolean')
        return 0

    files = len({f for f, _, _, _ in found})
    print(f'\nbound-boolean-attrs: {len(found)} in {files} file(s); '
          f'an undefined here SETS the attribute')
    return 1 if args.check else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
