#!/usr/bin/env python3
"""Advisory survey: meaning that lives only in a `title` attribute.

HTML-STYLE.md's rule is that a tooltip worth having is worth building: a native
`title` reaches no phone and opens nothing, so a fact that earns a hover earns a
real panel. The failure is quiet, because on the machine where the UI is built
the tooltip does appear, so a fact parked there looks shipped. This detector is
mechanical, advisory, and never blocking, in the idiom of link-survey.py,
unclaimed-code-survey.py and duplicated-claims-survey.py: run it, read the
list, fix or shrug. It reports candidates, not findings.

Born 2026-08-19 from the audit behind PR #447, which ran THREE times by hand
over the app's three largest UI files and reported 88, then 37, then 32. The
true answer is 33. Traps 1 and 2 below account for the first two; the third
pass had the tag stack right and still carried the echo bug that this file's
test caught, which was swallowing three real findings. Every one of the four
was mechanical, and every one produced a plausible number rather than an error,
which is the whole argument for a tested tool over a careful reading.

Method, and the two traps:

  1. An element's own tag is not the answer. A `<span title=…>` inside a
     `<button>` is reachable, because tapping the button is what a reader does
     with it. So the classifier keeps a TAG STACK and asks whether the title's
     element or any ancestor is interactive.

  2. `<` occurs inside attribute values (`:disabled="guideIdx <= 0"`), so
     walking backwards to the nearest `<` lands inside an attribute rather than
     at the tag that opens the element. The tokenizer below skips quoted
     regions, which is the whole reason it is a tokenizer and not a regex.

Three verdicts:

  reachable  the element or an ancestor is a link, a button, or carries a
             click handler, so the title is a desktop convenience label
  echo       the title repeats the element's own `x-text`, so it expands a
             truncation and stands in for nothing
  stranded   neither, so this is the only place the fact lives and the panel
             it wanted was never built

Only `stranded` is worth reading. Expect false positives: a decorative mark
whose title is genuinely a nicety reports the same as a caveat nobody can
reach, and the difference is judgment the tool cannot supply.

Usage:
  python3 scripts/title-survey.py [PATH...]      # default: lib/ app/ pages/
  python3 scripts/title-survey.py --all          # every verdict, not just stranded
  npm run title-survey
"""

import re
import sys
from collections import Counter
from pathlib import Path

DEFAULT_ROOTS = ('lib', 'app', 'pages')
SUFFIXES = ('.html', '.js')

# Elements that never nest, so they must not be pushed onto the stack. An
# unclosed `<i>` would otherwise swallow every following title as its child.
VOID = {'br', 'img', 'i', 'input', 'hr', 'meta', 'link', 'path', 'use',
        'circle', 'rect', 'source', 'col', 'area', 'embed', 'track', 'wbr'}

# What a reader can act on. `details`/`summary` are here because a disclosure
# opens on tap, which is the same affordance by another name.
INTERACTIVE = {'a', 'button', 'summary', 'label', 'select', 'input', 'details'}

CLICKISH = re.compile(r'(:?href=|@click|x-on:click)')
TAG = re.compile(r'</?\s*([a-zA-Z][\w:-]*)')
TITLE = re.compile(r'''(:?title)=(["'])(.*?)\2''', re.S)
XTEXT = re.compile(r'''x-text=(["'])(.*?)\1''', re.S)


def tags(src):
    """Yield (closing, name, attrs, offset) for every tag, skipping comments
    and quoted attribute values so a `<` inside an expression is not a tag."""
    i, n = 0, len(src)
    while i < n:
        lt = src.find('<', i)
        if lt < 0:
            return
        if src.startswith('<!--', lt):
            end = src.find('-->', lt)
            i = n if end < 0 else end + 3
            continue
        m = TAG.match(src, lt)
        if not m:
            i = lt + 1
            continue
        j = m.end()
        while j < n:
            ch = src[j]
            if ch in '"\'':
                q, j = ch, j + 1
                while j < n and src[j] != q:
                    j += 1
            elif ch == '>':
                break
            j += 1
        yield src[lt + 1] == '/', m.group(1).lower(), src[m.end():j], lt
        i = j + 1


def survey(path):
    """Classify every title in one file. Returns a list of dicts."""
    src = path.read_text(encoding='utf8', errors='replace')
    out, stack = [], []
    for closing, name, attrs, off in tags(src):
        if closing:
            for k in range(len(stack) - 1, -1, -1):
                if stack[k][0] == name:
                    del stack[k:]
                    break
            continue
        tm = TITLE.search(attrs)
        if tm:
            xm = XTEXT.search(attrs)
            xtext = ' '.join(xm.group(2).split()) if xm else None
            value = ' '.join(tm.group(3).split())
            own = name in INTERACTIVE or bool(CLICKISH.search(attrs))
            up = any(a in INTERACTIVE or CLICKISH.search(at) for a, at in stack)
            if own or up:
                verdict = 'reachable'
            # An echo repeats the element's own text, or is CONTAINED in it:
            # `title="f.path"` beside `x-text="f.path.split('/').pop()"` is the
            # untruncated source of what is already on screen, so it adds
            # nothing that is not reachable. The containment runs one way only.
            # Testing `xtext in value` instead looks equivalent and is not: a
            # short expression like `n` is a substring of nearly every title
            # expression, so `title="n + ' files: ' + list"` beside `x-text="n"`
            # would be filed as a repetition of itself and the finding lost.
            elif xtext and (xtext == value or value in xtext):
                verdict = 'echo'
            else:
                verdict = 'stranded'
            out.append({'file': path, 'line': src.count('\n', 0, off) + 1,
                        'tag': name, 'value': value, 'verdict': verdict})
        if name not in VOID and not attrs.rstrip().endswith('/'):
            stack.append((name, attrs))
    return out


def files_under(roots):
    for r in roots:
        p = Path(r)
        if p.is_file():
            yield p
        elif p.is_dir():
            yield from sorted(q for q in p.rglob('*') if q.suffix in SUFFIXES)


def main(argv):
    show_all = '--all' in argv
    roots = [a for a in argv[1:] if not a.startswith('-')] or list(DEFAULT_ROOTS)
    rows, counts = [], Counter()
    for f in files_under(roots):
        for r in survey(f):
            counts[r['verdict']] += 1
            rows.append(r)
    if not rows:
        print('title-survey: no title attributes found under ' + ', '.join(roots))
        return 0

    wanted = [r for r in rows if show_all or r['verdict'] == 'stranded']
    by_file = {}
    for r in wanted:
        by_file.setdefault(r['file'], []).append(r)
    for f, rs in sorted(by_file.items(), key=lambda kv: -len(kv[1])):
        print(f'\n{f}  ({len(rs)})')
        for r in rs:
            mark = f"[{r['verdict']}] " if show_all else ''
            print(f"  {r['line']:>6}  <{r['tag']}>  {mark}{r['value'][:96]}")

    total = len(rows)
    print(f"\ntitle-survey: {total} titles; "
          f"{counts['reachable']} reachable by tap, {counts['echo']} echo visible text, "
          f"{counts['stranded']} stranded")
    if counts['stranded']:
        print('A stranded title is the only place its fact lives. '
              'HTML-STYLE.md: a tooltip worth having is worth building.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
