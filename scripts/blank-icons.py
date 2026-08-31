#!/usr/bin/env python3
"""A Phosphor class naming an icon the installed font does not carry.

`<i class="ph ph-faucet">` looks exactly like a class that works. Phosphor is
an icon FONT, so the class resolves to a `:before` rule keyed by name; a name
with no rule renders a zero-width blank. No console error, no layout complaint,
no fallback glyph. The element is there, sized, and empty.

That failure reads as a logic bug and gets debugged as one, which is the snag
docs/SNAGS.md files under `phosphor-weight-is-a-family`. The nine this scan
first found (PR #555) had shipped unnoticed; one of them was a tab in the Map
view's own strip, blank beside eleven siblings that were not.

TWO WAYS TO GET THE NAME WRONG, and the script names which one it is:

    ph-play-fill        weight as a suffix. Phosphor's weights are font
                        FAMILIES, so the class pair is `{weight} ph-{name}`:
                        `ph-fill ph-play`, never `ph-play-fill`.
    ph-git-compare      a name from a different icon family. Octicons has
                        git-compare and repo, Font Awesome has
                        arrow-down-to-bracket. All three are plausible and
                        none of them are Phosphor.

THE VALID SET IS READ FROM THE INSTALLED FONT, not from a list committed here.
`node_modules/@phosphor-icons/web` is a devDependency at a RANGE, and
package-lock.json is gitignored, so the set a reader gets is whatever npm
resolved this run. A committed list would be a second copy of that set, free to
drift from it in either direction: stale enough to flag a name the font now
carries, or generous enough to pass a name it dropped. Reading the stylesheet
means the scan cannot be wrong about the font, only about the tree.

Only text inside a quoted string is scanned. Every real use is inside one (a
class attribute, an Alpine `:class` expression, a JS class string), and prose is
not, so a comment that mentions `ph-faucet` while explaining this bug is not
itself a finding.

Advisory by default, in the idiom of dead-opacity.py. `--check` makes it a gate,
which is what tools/test/blank-icons.test.mjs uses: there is no judgment in it,
since the font either carries the name or it does not.
"""

import argparse
import difflib
import os
import re
import sys

# Phosphor ships one stylesheet per weight and the six carry the same names, so
# the regular sheet is the whole set. `.ph.ph-acorn:before { ... }`.
SHEET = os.path.join(
    'node_modules', '@phosphor-icons', 'web', 'src', 'regular', 'style.css')
SHEET_RULE = re.compile(r'\.ph\.ph-([a-z0-9-]+)')

# A weight is a family, not a name: `ph-fill ph-play`. These share the `ph-`
# prefix and are never icons.
WEIGHTS = {'bold', 'fill', 'duotone', 'thin', 'light', 'regular'}

# Single, double, and backtick strings, one line at a time. A quoted string is
# where every real use lives, and prose is where the false positives live.
QUOTED = re.compile(r'"([^"\n]*)"|\'([^\'\n]*)\'|`([^`\n]*)`')
TOKEN = re.compile(r'\bph-([a-z0-9][a-z0-9-]*)\b')

SKIP_DIRS = {'.git', 'node_modules', 'dist', 'archive', '.preview', 'thumbs'}
EXTENSIONS = {'.html', '.js', '.mjs'}


def load_names(repo_root):
    """Every icon name the installed Phosphor carries, or None when it is absent.

    None is not an empty set. An uninstalled font would make every name in the
    tree unresolvable, so the caller skips rather than reporting 1500 findings
    that are all about node_modules.
    """
    path = os.path.join(repo_root, SHEET)
    try:
        with open(path, encoding='utf-8') as fh:
            names = set(SHEET_RULE.findall(fh.read()))
    except OSError:
        return None
    return names or None


def suggest(name, names):
    """The likely intent, and which of the two mistakes this is.

    Weight-as-suffix is checked first and exactly, because it is mechanical: if
    stripping a trailing weight leaves a real name, that is the answer and no
    guess is involved. Only then does it fall back to a nearest-name guess,
    which is a guess and is labelled as one.
    """
    for weight in WEIGHTS:
        if name.endswith('-' + weight):
            stem = name[: -len(weight) - 1]
            if stem in names:
                return f'ph-{weight} ph-{stem}', 'weight is a family, not a suffix'
    near = difflib.get_close_matches(name, sorted(names), n=1, cutoff=0.75)
    if near:
        return f'ph-{near[0]}', 'nearest name in the font'
    return None, 'no near name; pick one from the font'


def scan_text(text, path, names):
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        for quoted in QUOTED.finditer(line):
            body = next(g for g in quoted.groups() if g is not None)
            for m in TOKEN.finditer(body):
                name = m.group(1)
                if name in WEIGHTS or name in names:
                    continue
                fix, why = suggest(name, names)
                out.append((path, i, f'ph-{name}', fix, why))
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
    ap.add_argument('--repo-root', default=os.getcwd(),
                    help='where to find node_modules (default: cwd)')
    args = ap.parse_args(argv[1:])
    roots = args.roots or ['lib', 'pages', 'app']

    names = load_names(args.repo_root)
    if names is None:
        print(f'blank-icons: skipped; no icon set at {SHEET} (npm install first)')
        return 0

    found, seen = [], 0
    for path in walk(roots):
        try:
            with open(path, encoding='utf-8', errors='replace') as fh:
                text = fh.read()
        except OSError:
            continue
        for line in text.splitlines():
            for quoted in QUOTED.finditer(line):
                body = next(g for g in quoted.groups() if g is not None)
                seen += sum(1 for m in TOKEN.finditer(body)
                            if m.group(1) not in WEIGHTS)
        found.extend(scan_text(text, path, names))

    for path, line, cls, fix, why in sorted(found):
        print(f'{path}:{line}: {cls} -> {fix or "?"}  ({why})')

    if not found:
        print(f'blank-icons: none; {seen} icon uses, all carried by the '
              f'installed Phosphor ({len(names)} names)')
        return 0

    files = len({f for f, _, _, _, _ in found})
    print(f'\nblank-icons: {len(found)} in {files} file(s); these render as '
          f'nothing at all')
    return 1 if args.check else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
