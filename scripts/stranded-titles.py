#!/usr/bin/env python3
"""Advisory scan: meaning that lives only in a `title` attribute.

The house style's rule is that a tooltip worth having is worth building: a native
`title` reaches no phone and opens nothing, so a fact that earns a hover earns a
real panel. The failure is quiet, because on the machine where the UI is built
the tooltip does appear, so a fact parked there looks shipped. This detector is
mechanical, advisory, and never blocking, in the idiom of dead-links.py,
unclaimed-code.py and duplicated-claims.py: run it, read the
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

  3. A tag named in a JAVASCRIPT comment is not markup, and it never closes, so
     it sits on the stack for the rest of the file and marks every title after
     it reachable. Found 2026-09-01 in home's budget-drs `app/view/app.html`,
     where a prose comment about accessibility mentions `<a>`, `<span>` and
     `<button>`; from that line to the end of the file every one of its 36
     titles was reported reachable, the `tab-divider` note among them. HTML
     comments were already skipped, which is exactly why the gap was quiet: the
     obvious case was handled and looked like the whole case. `mask_js()` below
     blanks JS comments before tokenizing, which needs a small JS lexer, since
     `//` inside a string or a regex literal is not a comment.

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
  python3 scripts/stranded-titles.py [PATH...]      # default: lib/ app/ pages/
  python3 scripts/stranded-titles.py --all          # every verdict, not just stranded
  npm run stranded-titles
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


# A `/` starts a REGEX literal rather than a division when the previous
# significant character cannot end an expression. The classic heuristic, and the
# reason mask_js needs a lexer at all: 944 regex literals across this estate and
# home's budget-drs app, 36 of them containing a quote and 159 an escaped slash,
# so a scanner that ignored them would read `/['"]/` as the start of a string and
# swallow whatever followed.
REGEX_OK_BEFORE = set('=(,:[!&|?{};+-*%~^<>') | {'\n', ''}
KEYWORD_BEFORE = ('return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'yield', 'await')


def mask_js(src, whole_file):
    """Blank JS comments to spaces, keeping every offset and newline in place.

    `whole_file` for a .js file; otherwise only `<script>` bodies are treated as
    JavaScript, since a `//` in page markup is a URL, not a comment.

    Template literals are SKIPPED rather than masked: markup lives in them, and
    that markup is what the tokenizer is here to read. So a comment nested inside
    a `${…}` goes unmasked, which is the behaviour this function replaces and
    therefore no worse than before.
    """
    out = list(src)
    n = len(src)

    def blank(a, b):
        for k in range(a, b):
            if out[k] != '\n':
                out[k] = ' '

    if whole_file:
        regions = [(0, n)]
    else:
        low = src.lower()
        regions = []
        i = 0
        while True:
            m = re.compile(r'<script\b[^>]*>', re.I).search(src, i)
            if not m:
                break
            end = low.find('</script>', m.end())
            end = n if end < 0 else end
            regions.append((m.end(), end))
            i = end + 1

    for a, b in regions:
        i, prev = a, ''
        while i < b:
            c = src[i]
            if c in '"\'':
                q, i = c, i + 1
                while i < b:
                    if src[i] == '\\':
                        i += 2
                        continue
                    if src[i] == q:
                        break
                    i += 1
                i += 1
                prev = 'x'
                continue
            if c == '`':
                i, depth = i + 1, 0
                while i < b:
                    ch = src[i]
                    if ch == '\\':
                        i += 2
                        continue
                    if ch == '`' and depth == 0:
                        break
                    if ch == '$' and src[i + 1:i + 2] == '{':
                        depth += 1
                        i += 2
                        continue
                    if ch == '}' and depth:
                        depth -= 1
                    i += 1
                i += 1
                prev = 'x'
                continue
            if c == '/' and i + 1 < b:
                nxt = src[i + 1]
                # `https://` is not a comment. The one guard that matters, since a
                # masked URL line silently drops every title on it.
                if nxt == '/' and src[i - 1:i] != ':':
                    end = src.find('\n', i)
                    end = b if end < 0 or end > b else end
                    blank(i, end)
                    i = end
                    prev = '\n'
                    continue
                if nxt == '*':
                    end = src.find('*/', i + 2)
                    end = b if end < 0 or end + 2 > b else end + 2
                    blank(i, end)
                    i = end
                    continue
                if nxt != '/':
                    word = re.search(r'([A-Za-z_$][\w$]*)\s*$', src[a:i])
                    starts_regex = (prev in REGEX_OK_BEFORE
                                    or (word and word.group(1) in KEYWORD_BEFORE))
                    if starts_regex:
                        j, cls = i + 1, False
                        while j < b:
                            ch = src[j]
                            if ch == '\\':
                                j += 2
                                continue
                            if ch == '[':
                                cls = True
                            elif ch == ']':
                                cls = False
                            elif ch == '/' and not cls:
                                break
                            elif ch == '\n':
                                break          # an unterminated regex was a division
                            j += 1
                        if j < b and src[j] == '/':
                            i = j + 1
                            prev = 'x'
                            continue
            if not c.isspace():
                prev = c
            i += 1
    return ''.join(out)


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


def scan(path):
    """Classify every title in one file. Returns a list of dicts."""
    src = path.read_text(encoding='utf8', errors='replace')
    # Line numbers and offsets must still point into the real file, so the mask
    # blanks in place rather than deleting: `masked` is the same length as `src`.
    masked = mask_js(src, whole_file=path.suffix == '.js')
    out, stack = [], []
    for closing, name, attrs, off in tags(masked):
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
        for r in scan(f):
            counts[r['verdict']] += 1
            rows.append(r)
    if not rows:
        print('stranded-titles: no title attributes found under ' + ', '.join(roots))
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
    print(f"\nstranded-titles: {total} titles; "
          f"{counts['reachable']} reachable by tap, {counts['echo']} echo visible text, "
          f"{counts['stranded']} stranded")
    if counts['stranded']:
        print('A stranded title is the only place its fact lives. '
              'house style: a tooltip worth having is worth building.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
