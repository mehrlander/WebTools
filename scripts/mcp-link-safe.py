#!/usr/bin/env python3
"""Report markdown links the GitHub MCP write path would defang.

Writing markdown through the GitHub MCP (a PR body, an issue comment) wraps a
long URL in backticks, so the link is stored as literal text and renders dead on
GitHub and in every downstream reader. The trigger is length and only length:
a URL of 150 characters or more is wrapped, 149 or fewer survives. The label
does not count.

The one construct that surprises people is the surfacing caption's slash-joined
pair. `)/[` does not end the URL token, so the span being measured runs from the
first URL's first character through the second URL's last, joining punctuation
and the second label included:

    span = len(url1) + len(")/[label2](") + len(url2)

Two clean 70-character links therefore make one 149-character span that
survives, and a single character more wraps the pair. Comma-joining ends the run
and puts each URL back on its own count.

Measured 2026-08-25 (issue #498, PR #499); the evidence, with every probe and
its control, is in docs/github/mcp.md. Chat replies are untouched
by any of this, so this checker is about write-path output only.

Usage:
    mcp-link-safe.py BODY.md [MORE.md ...]   report findings
    mcp-link-safe.py -                       read markdown on stdin
    mcp-link-safe.py --check BODY.md         exit 1 if anything would defang
    mcp-link-safe.py --json BODY.md          findings as JSON
"""

import argparse
import html
import json
import re
import sys

# A URL of this many characters or more, inside a markdown link, is wrapped.
# 149 survives. Bracketed one character at a time; see the module docstring.
THRESHOLD = 150

# An inline markdown link. The URL runs to the first closing paren, which is
# what the sanitizer's own tokenizer does on the constructs measured here; a
# URL containing balanced parens is out of scope and would need a real parser.
LINK = re.compile(r'\[(?P<label>[^\]]*)\]\((?P<url>[^)\s]*)\)')

# A URL inside a plain code span. Not a link, so nothing dies, but at the same
# threshold it is stored double-backticked with quotes added around the address.
CODESPAN = re.compile(r'(?<!`)`(?P<url>https?://[^`\s]+)`(?!`)')

# The joining run that fuses the next link into the current span. Matched at the
# current URL's closing paren, so it consumes `)/[label](url)` in one step.
JOIN = re.compile(r'\)/\[(?P<label>[^\]]*)\]\((?P<url>[^)\s]*)\)')


def spans(text):
    """Yield the measured spans in one markdown string.

    Each span is (start, end, urls, labels): the character range the sanitizer
    measures as one URL token, the URLs it fuses, and the second-and-later
    labels that fall inside the run. A lone link yields a span of just its URL.
    """
    pos = 0
    while True:
        m = LINK.search(text, pos)
        if not m:
            return
        start = m.start('url')
        end = m.end('url')
        urls = [m.group('url')]
        labels = []
        # Walk the chain while the next link is slash-joined to this one. JOIN
        # matches at the closing paren, so the span grows to the next URL's last
        # character and the joining punctuation and label fall inside it.
        while True:
            j = JOIN.match(text, end)
            if not j:
                break
            end = j.end('url')
            urls.append(j.group('url'))
            labels.append(j.group('label'))
        yield (start, end, urls, labels)
        pos = max(end, m.end())


def findings(text, path='-', threshold=THRESHOLD, unescape=False):
    # A body read back through the MCP has its HTML entities expanded, so an
    # `&` in a stored URL returns as `&amp;` and inflates the count by four
    # characters per ampersand. Measured on PR #400, whose 148-character URL
    # reads back as 152 and looks over the line while being demonstrably
    # intact. Unescape before measuring readback data; never for a file on
    # disk, where a literal `&amp;` really is five characters of URL.
    if unescape:
        text = html.unescape(text)
    out = []
    line_starts = [0]
    for i, ch in enumerate(text):
        if ch == '\n':
            line_starts.append(i + 1)

    def lineno(off):
        lo, hi = 0, len(line_starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if line_starts[mid] <= off:
                lo = mid
            else:
                hi = mid - 1
        return lo + 1

    for start, end, urls, labels in spans(text):
        # A body read back after the write path already carries its backticks
        # inside the URL token. That is a link already dead, not one at risk,
        # and its measured length includes the backticks the sanitizer added.
        if any(u.startswith('`') or u.endswith('`') for u in urls):
            out.append({
                'path': path,
                'line': lineno(start),
                'kind': 'defanged',
                'length': end - start,
                'over': 0,
                'urls': urls,
                'joined_labels': labels,
                'fix': 'already wrapped in backticks; rewrite the body to restore the link',
            })
            continue
        length = end - start
        if length < threshold:
            continue
        kind = 'pair' if len(urls) > 1 else 'link'
        if kind == 'pair':
            fix = ('separate the links with ", " instead of "/", which ends the '
                   'run and puts each URL back on its own count')
        else:
            fix = 'shorten the URL to 149 characters or fewer'
        out.append({
            'path': path,
            'line': lineno(start),
            'kind': kind,
            'length': length,
            'over': length - threshold + 1,
            'urls': urls,
            'joined_labels': labels,
            'fix': fix,
        })

    for cm in CODESPAN.finditer(text):
        u = cm.group('url')
        if len(u) < threshold:
            continue
        out.append({
            'path': path,
            'line': lineno(cm.start('url')),
            'kind': 'codespan',
            'length': len(u),
            'over': len(u) - threshold + 1,
            'urls': [u],
            'joined_labels': [],
            'fix': ('stays readable, but the write path adds backticks and quotes '
                    'around it; shorten it or move it to the chat reply'),
        })
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('paths', nargs='+', help='markdown files, or - for stdin')
    ap.add_argument('--check', action='store_true',
                    help='exit 1 if anything would be defanged')
    ap.add_argument('--json', action='store_true', help='findings as JSON')
    ap.add_argument('--threshold', type=int, default=THRESHOLD,
                    help=f'span length that wraps (default {THRESHOLD})')
    ap.add_argument('--unescape-entities', action='store_true',
                    help='expand HTML entities first; for bodies read back '
                         'through the MCP, never for a file on disk')
    a = ap.parse_args(argv)

    all_found = []
    for p in a.paths:
        text = sys.stdin.read() if p == '-' else open(p, encoding='utf-8').read()
        all_found += findings(text, p, a.threshold, a.unescape_entities)

    if a.json:
        print(json.dumps(all_found, indent=2))
    elif not all_found:
        print(f'mcp-link-safe: clean, every span under {a.threshold}')
    else:
        for f in all_found:
            noun = {'pair': 'slash-joined pair', 'link': 'link',
                    'codespan': 'code-span URL (rewritten, not killed)',
                    'defanged': 'ALREADY DEFANGED link'}[f['kind']]
            if f['kind'] == 'defanged':
                print(f"{f['path']}:{f['line']}: {noun}")
            else:
                print(f"{f['path']}:{f['line']}: {noun} measures {f['length']} "
                      f"characters, {f['over']} over the limit")
            for u in f['urls']:
                print(f"    {len(u):>4}  {u}")
            print(f"    fix: {f['fix']}")
        n_dead = sum(1 for f in all_found if f['kind'] == 'defanged')
        n_risk = len(all_found) - n_dead
        print(f'\n{n_risk} span(s) would be defanged, {n_dead} already are.')

    return 1 if (a.check and all_found) else 0


if __name__ == '__main__':
    sys.exit(main())
