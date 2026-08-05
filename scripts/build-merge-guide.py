#!/usr/bin/env python3
# Generate docs/MERGE-GUIDE.md from merged PR bodies. The PR body's guide
# region (the managed block delimited by either marker in MARKS below, or, for
# older PRs, the structural ⭐/🥏 Look ... Notes span) is the editable source of
# shipped history; this projects it into one newest-on-top file that survives
# offline.
#
# Portable: python3, stdlib only, zero dependencies.
# Canonical source: mehrlander/web-tools at scripts/build-merge-guide.py
#
# Non-destructive by default: existing MERGE-GUIDE.md entries are preserved,
# and a generated entry is only ADDED for a PR the file does not already
# cover. Pass --refresh to let generated entries overwrite same-PR entries
# (the mode the retroactive backfill will use once old PR bodies carry proper
# guide regions; tracker task 0009). Entries predating any PR (the #TBD /
# branch-keyed ones) are always preserved verbatim.
#
# Two projections, and the choice is a doctrine call the repo makes once:
#
#   --index (web-tools' own mode)  one line per merged PR: date, number, title,
#     link. The PR body stays on GitHub as the authoritative account. Complete
#     by construction, since it needs only fields every PR carries, and stable,
#     since a merged PR's number, title, and merge date do not move.
#
#   default (full entries)  the guide region copied into the file. Gives
#     offline full-text history at the cost of duplicating what GitHub already
#     renders, and it can only cover PRs whose bodies were written to the
#     convention: extract() returns nothing for a terse body and that PR is
#     dropped without a trace. See docs/SURFACING.md, "Merge guide".
#
# Usage:
#   python3 scripts/build-merge-guide.py [owner/repo] [--out FILE]
#           [--from-json FILE] [--since N] [--refresh] [--index]
#
#   owner/repo     default mehrlander/web-tools
#   --out FILE     default docs/MERGE-GUIDE.md; existing entries are merged in
#   --from-json F  read the PR list from F instead of the API (a JSON array of
#                  PR objects shaped like the REST pulls endpoint); lets the
#                  generator run offline or against MCP-fetched data
#   --since N      only consider PRs with number >= N (bounds an API walk)
#   --refresh      regenerate entries for covered PRs, not only missing ones
#                  (full-entry mode only; --index always rewrites wholesale)
#   --index        emit the one-line-per-PR index instead of full entries
#
# API access (live fetch) reads GH_TOKEN / GITHUB_TOKEN from the environment
# for rate limit and private repos; the projection stays a committed file.
#
# In the Claude Code web sandbox the proxy 403s api.github.com, so the live
# fetch cannot run there. That is not a block on regeneration: the GitHub MCP's
# list_pull_requests returns objects of exactly the shape --from-json wants,
# bodies and all. Page it, write the array to a file, and pass --from-json.

import sys, os, re, json, html, urllib.request

OWNER_REPO = 'mehrlander/web-tools'
OUT = 'docs/MERGE-GUIDE.md'

# ── PR fetch ────────────────────────────────────────────────────────────────

def fetch_prs(owner_repo, since=None):
    tok = os.environ.get('GH_TOKEN') or os.environ.get('GITHUB_TOKEN')
    out, page = [], 1
    while True:
        url = (f'https://api.github.com/repos/{owner_repo}/pulls'
               f'?state=closed&per_page=100&page={page}&sort=created&direction=desc')
        req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json'})
        if tok:
            req.add_header('Authorization', 'Bearer ' + tok)
        batch = json.load(urllib.request.urlopen(req, timeout=30))
        if not batch:
            break
        out.extend(batch)
        # Newest-first, so once we pass the --since floor we can stop.
        if since is not None and any((p.get('number') or 0) < since for p in batch):
            break
        page += 1
        if page > 20:  # 2000-PR backstop
            break
    return out

def merged(prs):
    return [p for p in prs if p.get('merged_at')]

# ── Guide-region extraction ─────────────────────────────────────────────────

# The managed region's delimiters, tried in order. The markdown link-label form
# is what new syncs write; the HTML-comment form is what every body written
# before 2026-07-28 carries, and it stays recognized so those regions do not
# orphan. Both are invisible when GitHub renders the body.
#
# Why there are two: reading a PR body back through the GitHub MCP strips HTML
# comments and tags, so an agent syncing a body could not find the region it was
# meant to rewrite, and a sync that cannot find its region appends a second one
# or overwrites hand-written prose. Measured, with the probe and the controls,
# in docs/environment/capabilities.md.
MARKS = (
    ('[//]: # (guide)', '[//]: # (/guide)'),
    ('<!-- guide -->', '<!-- /guide -->'),
)
# A body's trailing session footer, cut before it reaches the guide.
FOOTER_RE = re.compile(
    r'^\s*(?:🤖 Generated with|---\s*$|_Generated by|Co-Authored-By:|Claude-Session:|https://claude\.ai/code/session)',
    re.M)
# The first curated line: a ⭐/🥏/📦 Look/Result, or a **Bold heading:**.
LOOK_RE = re.compile(r'^\s*(?:⭐|🥏|📦)', re.M)
BOLD_RE = re.compile(r'^\s*\*\*[^*]+\*\*', re.M)
# Forward-looking sections that belong to the branch, not shipped history.
DROP_SECTION_RE = re.compile(r'^\s*\*\*(?:Next steps|Follow-ups?|Open threads)\b', re.I)

def _cut_footer(text):
    m = FOOTER_RE.search(text)
    return text[:m.start()] if m else text

def extract(body):
    """Return (lead, region) markdown, or (None, None) if the body has no
    curated content (an old terse PR). lead is the one-line outcome; region is
    the ⭐/Changed/Notes block."""
    body = (body or '').replace('\r\n', '\n')
    for mark_open, mark_close in MARKS:
        if mark_open in body and mark_close in body:
            inner = body.split(mark_open, 1)[1].split(mark_close, 1)[0].strip()
            lead = body.split(mark_open, 1)[0].strip()
            return (_first_para(lead), inner)
    # Structural fallback: lead paragraph, then from the first ⭐/🥏 (or first
    # bold heading) to before the footer.
    trimmed = _cut_footer(body)
    m = LOOK_RE.search(trimmed) or BOLD_RE.search(trimmed)
    if not m:
        return (None, None)
    lead = _first_para(trimmed[:m.start()])
    region = trimmed[m.start():].strip()
    return (lead, region)

def _first_para(text):
    for para in re.split(r'\n\s*\n', text.strip()):
        p = para.strip()
        if p:
            return p
    return ''

def strip_dropped_sections(region):
    """Remove Next steps / Follow-ups blocks: from the heading to the next
    **bold heading** or end."""
    lines = region.split('\n')
    out, skip = [], False
    for ln in lines:
        if DROP_SECTION_RE.match(ln):
            skip = True
            continue
        if skip:
            if BOLD_RE.match(ln):   # next section starts
                skip = False
            else:
                continue
        out.append(ln)
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(out)).strip()

def rewrite_urls(text, head_ref):
    """Point branch blob/tree URLs at main; the branch is deleted after merge."""
    if not head_ref:
        return text
    hr = re.escape(head_ref)
    text = re.sub(r'(/blob/)' + hr + r'(/)', r'\1main\2', text)
    text = re.sub(r'(/tree/)' + hr + r'(/)', r'\1main\2', text)
    return text

# ── Entry model ─────────────────────────────────────────────────────────────

HEADER_RE = re.compile(r'^##\s+(\d{4}-\d{2}-\d{2})?\s*(.*?)\s*(?:\(PR #(\d+)\))?\s*$')

def parse_existing(md):
    """Split an existing MERGE-GUIDE.md into entry blocks. Returns a list of
    {pr, date, text}. The leading preamble (before the first '## ') is dropped;
    a fresh banner is emitted on render."""
    blocks, cur = [], None
    for line in md.split('\n'):
        if line.startswith('## '):
            if cur is not None:
                blocks.append(cur)
            m = HEADER_RE.match(line)
            date = (m.group(1) or '') if m else ''
            pr = int(m.group(3)) if (m and m.group(3)) else None
            cur = {'pr': pr, 'date': date, 'lines': [line]}
        elif cur is not None:
            cur['lines'].append(line)
    if cur is not None:
        blocks.append(cur)
    for b in blocks:
        b['text'] = '\n'.join(b['lines']).rstrip()
        del b['lines']
    return blocks

def build_entry(pr):
    n = pr.get('number')
    date = (pr.get('merged_at') or '')[:10]
    title = html.unescape(pr.get('title') or '').strip()
    head_ref = ((pr.get('head') or {}).get('ref')) or ''
    lead, region = extract(pr.get('body'))
    if region is None:
        return None  # terse body, nothing curated to project
    region = strip_dropped_sections(rewrite_urls(html.unescape(region), head_ref))
    lead = rewrite_urls(html.unescape(lead or ''), head_ref).strip()
    parts = [f'## {date} {title} (PR #{n})']
    if lead:
        parts.append('')
        parts.append(lead)
    if region:
        parts.append('')
        parts.append(region)
    parts.append('')
    parts.append(f'[PR #{n}](https://github.com/{OWNER_REPO}/pull/{n})')
    return {'pr': n, 'date': date, 'text': '\n'.join(parts).rstrip()}

# ── Merge + render ──────────────────────────────────────────────────────────

BANNER = (
    "# Merge guide\n\n"
    "Newest-on-top log of what each session shipped, generated from merged PR\n"
    "bodies by `scripts/build-merge-guide.py`. A PR body's guide region is the\n"
    "editable source; do not hand-edit entries below. Regenerate:\n\n"
    "    python3 scripts/build-merge-guide.py " + OWNER_REPO + " --out " + OUT + "\n\n"
    "Entries predating the generator were hand-authored and are preserved until\n"
    "backfilled (tracker task 0009).\n\n"
    "---\n"
)

def merge_entries(existing, generated, refresh):
    by_pr = {}
    order = []
    for e in existing:
        key = ('pr', e['pr']) if e['pr'] is not None else ('raw', len(order))
        by_pr[key] = e
        order.append(key)
    added = refreshed = 0
    for g in generated:
        key = ('pr', g['pr'])
        if key in by_pr:
            if refresh:
                by_pr[key] = g
                refreshed += 1
            # else: preserve the existing curated entry
        else:
            by_pr[key] = g
            order.append(key)
            added += 1
    entries = [by_pr[k] for k in order]
    # Newest-first by date; stable for equal/blank dates.
    entries.sort(key=lambda e: e['date'] or '0000-00-00', reverse=True)
    return entries, added, refreshed

def render(entries):
    return BANNER + '\n' + '\n\n'.join(e['text'] for e in entries) + '\n'

# ── Index projection ────────────────────────────────────────────────────────

# Merges that never had a PR cannot be derived from the pulls endpoint, so the
# generator keeps whatever a human wrote under this heading and appends it
# unchanged. It is the whole of the "rogue commit" provision: one heading, no
# schema, no synthetic entries.
TAIL_MARK = '## Merges without a pull request'

INDEX_BANNER = (
    "# Merge guide\n\n"
    "Every merged pull request, newest first: the date, the title, and a link to\n"
    "the PR, whose body carries the full account of what shipped. This file is the\n"
    "index; GitHub holds the entries.\n\n"
    "It is an index rather than a copy on purpose. A PR's number, title, and merge\n"
    "date are fixed once it merges, so a line here cannot drift from its subject,\n"
    "and every merged PR gets one whether or not its body was written to the guide\n"
    "convention. Copying the bodies in would duplicate what GitHub already renders,\n"
    "silently drop every PR with a terse body, and carry per-file links that later\n"
    "renames break. See docs/SURFACING.md, \"Merge guide\".\n\n"
    "Generated by `scripts/build-merge-guide.py --index`; do not hand-edit, except\n"
    "under the trailing \"" + TAIL_MARK.lstrip('# ') + "\" heading, which is preserved\n"
    "verbatim. Regenerate:\n\n"
    "    python3 scripts/build-merge-guide.py " + OWNER_REPO + " --index --out " + OUT + "\n\n"
    "The sandbox proxy 403s `api.github.com`, so in a Claude Code web session feed\n"
    "it MCP-fetched PRs instead: page `list_pull_requests` (state closed, fields\n"
    "number/title/merged_at), write the array to a file, and add `--from-json`.\n\n"
    "---"
)

MONTHS = ('January', 'February', 'March', 'April', 'May', 'June', 'July',
          'August', 'September', 'October', 'November', 'December')

def month_title(ym):
    y, m = ym.split('-')
    return f'{MONTHS[int(m) - 1]} {y}'

def render_index(prs, tail=''):
    """One line per merged PR, newest first, grouped by merge month."""
    rows = sorted(
        ((p.get('merged_at') or '')[:10], p.get('number') or 0,
         html.unescape(p.get('title') or '').strip())
        for p in prs)
    rows.reverse()
    out, cur = [INDEX_BANNER], None
    for date, n, title in rows:
        ym = date[:7]
        if ym != cur:
            cur = ym
            out.append(f'\n## {month_title(ym)}\n')
        url = f'https://github.com/{OWNER_REPO}/pull/{n}'
        out.append(f'- {date} [#{n} {title}]({url})')
    text = '\n'.join(out) + '\n'
    if tail:
        text += '\n' + tail.rstrip() + '\n'
    return text

def existing_tail(path):
    """The hand-written PR-less section, if the current file carries one."""
    if not os.path.exists(path):
        return ''
    with open(path) as f:
        md = f.read()
    return md[md.index(TAIL_MARK):].rstrip() if TAIL_MARK in md else ''

# ── Main ────────────────────────────────────────────────────────────────────

def main(argv):
    global OWNER_REPO
    owner_repo = OWNER_REPO
    out = OUT
    from_json = None
    since = None
    refresh = False
    index = False
    rest = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--out': out = argv[i + 1]; i += 2
        elif a == '--from-json': from_json = argv[i + 1]; i += 2
        elif a == '--since': since = int(argv[i + 1]); i += 2
        elif a == '--refresh': refresh = True; i += 1
        elif a == '--index': index = True; i += 1
        else: rest.append(a); i += 1
    if rest:
        owner_repo = rest[0]
    OWNER_REPO = owner_repo

    if from_json:
        with open(from_json) as f:
            prs = json.load(f)
    else:
        prs = fetch_prs(owner_repo, since)
    prs = merged(prs)
    if since is not None:
        prs = [p for p in prs if (p.get('number') or 0) >= since]

    if index:
        text = render_index(prs, existing_tail(out))
        with open(out, 'w') as f:
            f.write(text)
        print(f'merge-guide: {len(prs)} merged PRs indexed -> {out}',
              file=sys.stderr)
        return

    generated = [e for e in (build_entry(p) for p in prs) if e]

    existing = []
    if os.path.exists(out):
        with open(out) as f:
            existing = parse_existing(f.read())

    entries, added, refreshed = merge_entries(existing, generated, refresh)
    text = render(entries)
    with open(out, 'w') as f:
        f.write(text)

    kept = len(entries) - added
    print(f'merge-guide: {len(entries)} entries '
          f'({added} added, {refreshed} refreshed, {kept} preserved) -> {out}',
          file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1:])
