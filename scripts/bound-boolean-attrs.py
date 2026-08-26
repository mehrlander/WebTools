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

THE LAST OPERAND OF `||` AND `&&`, added 2026-08-23 because the case this
paragraph used to say it was waiting for turned up. `pages/dictate.html` bound
`:disabled="!token || saving"`, where `saving` holds the name of the repo being
written to and '' the rest of the time. `||` returns an OPERAND, not a boolean,
so with a token in hand the expression is '', and bind() writes it: both of the
page's writing destinations were dead buttons with the token sitting right
there, and nothing anywhere said why.

Note what is NOT going on there. Alpine's undefined-to-'' coercion never fired
(the expression has no dot in it) and no key was missing. A plain falsy string
of the author's own making is enough, because bind() removes an attribute only
for null, undefined and false. So this is a wider hole than the one above, not
a corner of it, and it needs no parser to see: `||` and `&&` hand back their
last-evaluated operand, so the expression is boolean only if that operand is.

FLAGGED: the final operand of a top-level `||` or `&&` chain, when it is a bare
identifier or an accessor chain. Not a comparison, a negation, a call with
arguments, or a literal, all of which answer for their own type. Splitting is
by top-level operator only, so a `||` inside brackets, quotes or a call's
arguments does not divide the expression. Measured over lib, pages, app and
popups when it was added: one finding, the one above.

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


# A bare identifier answers for nothing: `saving`, `busy`, `mode`. Together
# with CHAIN this is "a fetch, and only a fetch".
NAME = re.compile(r'^[A-Za-z_$][\w$]*$')


def split_top(expr):
    """The operands of a top-level `||`/`&&` chain, or [expr] when there is none.

    Depth-counted over (), [] and {}, and quote-aware, so an operator inside a
    call's arguments, an index, or a string does not divide the expression.
    Ternaries are left alone: `a ? b : c` has two results and the branch that
    reaches x-bind is not a scan's question.
    """
    parts, buf, depth, quote, i = [], [], 0, '', 0
    while i < len(expr):
        c = expr[i]
        if quote:
            buf.append(c)
            if c == '\\' and i + 1 < len(expr): buf.append(expr[i + 1]); i += 2; continue
            if c == quote: quote = ''
            i += 1
            continue
        if c in '"\'`':
            quote = c; buf.append(c); i += 1; continue
        if c in '([{': depth += 1
        elif c in ')]}': depth -= 1
        if depth == 0 and expr[i:i + 2] in ('||', '&&'):
            parts.append(''.join(buf)); buf = []; i += 2; continue
        buf.append(c); i += 1
    parts.append(''.join(buf))
    return parts


def fetches(expr):
    """A bare fetch: an identifier or an accessor chain, nothing else."""
    expr = expr.strip()
    return bool(NAME.match(expr)) or bool(CHAIN.match(expr))


def exposed(expr):
    """Whether this expression can hand x-bind something that is not a boolean.

    Two ways in, and the second is the wider one.

    A BARE CHAIN can come back undefined, which Alpine turns into '' when the
    expression contains a dot; bind() writes '' because it removes only null,
    undefined and false.

    THE LAST OPERAND of a top-level `||`/`&&` chain IS the value when the chain
    gets that far, since those operators hand back an operand rather than a
    boolean. A falsy string there is enough, so no dot is required and no key
    has to be missing.
    """
    expr = expr.strip()
    if '.' in expr and CHAIN.match(expr):
        return True
    parts = split_top(expr)
    return len(parts) > 1 and fetches(parts[-1])


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
        # A chain takes the `!!` in front of itself; an operator chain has to be
        # wrapped, since `!!a || b` negates the wrong half and reads as a fix.
        fix = f'!!{expr}' if len(split_top(expr)) == 1 else f'!!({expr})'
        print(f'{path}:{line}: :{attr}="{expr}" -> :{attr}="{fix}"')

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
