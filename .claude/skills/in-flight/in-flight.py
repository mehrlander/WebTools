#!/usr/bin/env python3
# in-flight.py: what work is live right now, and does any of it touch mine?
#
# Answers the pre-work question "is something already going on here?" before a
# session starts editing. It reports three things per repo:
#
#   1. Claims      tracker tasks marked in-progress, each with its owning branch
#   2. Live        branches carrying commits that are not on the base branch
#   3. Stale       claims whose branch has already landed, vanished, or gone quiet
#
# The load-bearing measurement is the ahead-count. A branch with zero commits
# not reachable from the base branch cannot be in flight, whatever its name or
# age says, and in a merge-commit repo that retires the overwhelming majority of
# a stale branch estate in one pass. Where a repo squash-merges, the ahead-count
# stays positive after landing, so every live candidate also gets a content
# check: how many of the paths it touched still differ from base. Both signals
# are reported; neither is silently blended into a verdict.
#
# Claims are the trust problem this exists to fix. A tracker task says
# "in-progress" until someone edits it, so a claim outlives the work by default
# and the board quietly starts lying. Reconciling every claim against its branch
# is what keeps the claim layer worth reading.
#
# Portable: python3, stdlib only, zero dependencies, no network.
# Canonical source: mehrlander/web-tools at .claude/skills/in-flight/in-flight.py
# (ships inside the `portable` plugin, beside the `in-flight` skill that drives it)
#
# Usage:
#   python3 .claude/skills/in-flight/in-flight.py [REPO ...] [options]
#
#   REPO ...          repo paths to scan (default: the current directory)
#   --paths P [P ...] report which live branches touch these files or folders
#   --prs FILE        overlay open PRs from a JSON array of objects carrying
#                     number, title, head (branch name), draft, url; lets a
#                     session pass MCP- or API-fetched PRs in without this
#                     script needing network or a token
#   --base REF        base branch (default: origin's HEAD, else origin/main)
#   --quiet-days N    a live branch idle this long is reported quiet (default 7)
#   --fetch           run `git fetch origin --prune` first (the only write)
#   --all-claims      list healthy claims individually, not just as a count
#   --worktree        read tracker tasks from the checked-out files rather than
#                     the base branch (the default; tracker state lives on base)
#   --json            emit the finding as JSON instead of markdown
#
# Exit status is 0 whatever it finds; this is a report, not a gate.

import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date

CLAIM_STATUS = 'in-progress'


# ── git ─────────────────────────────────────────────────────────────────────

def git(repo, *args):
    """Run a git command, returning stdout. Failure yields '' rather than raising:
    every call site here treats absence as a legitimate answer."""
    try:
        r = subprocess.run(['git', '-C', repo, *args],
                           capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return ''
    return r.stdout if r.returncode == 0 else ''


def git_ok(repo, *args):
    """True when the command succeeds. For existence probes."""
    try:
        r = subprocess.run(['git', '-C', repo, *args],
                           capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return False
    return r.returncode == 0


def is_repo(path):
    return git(path, 'rev-parse', '--git-dir').strip() != ''


def default_base(repo):
    """origin's own idea of its default branch, else main, else master."""
    head = git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD').strip()
    if head.startswith('refs/remotes/'):
        return head[len('refs/remotes/'):]
    for cand in ('origin/main', 'origin/master'):
        if git_ok(repo, 'rev-parse', '--verify', '--quiet', cand):
            return cand
    return 'origin/main'


def repo_slug(repo):
    """owner/repo parsed from the origin URL, for links. None when unparseable.

    Not anchored on github.com: a Claude Code web sandbox rewrites origin to a
    local git proxy (`http://local_proxy@127.0.0.1:PORT/git/owner/repo`), so
    insisting on the public host loses the slug in exactly the environment this
    runs in most. The last two path segments are the slug under every form."""
    url = git(repo, 'remote', 'get-url', 'origin').strip()
    if not url:
        return None
    url = re.sub(r'\.git$', '', url)
    url = re.sub(r'^[a-z+]+://[^/]*/', '', url)          # scheme, creds, host
    url = re.sub(r'^[^@]+@[^:]+:', '', url)              # scp-style git@host:
    segs = [s for s in url.split('/') if s and s != 'git']
    return '/'.join(segs[-2:]) if len(segs) >= 2 else None


def fetch_age(repo):
    """Seconds since the last fetch, or None when never fetched. A scan of
    stale refs is a reading of the past, so the age is part of the finding."""
    gitdir = git(repo, 'rev-parse', '--git-dir').strip()
    if not gitdir:
        return None
    if not os.path.isabs(gitdir):
        gitdir = os.path.join(repo, gitdir)
    fh = os.path.join(gitdir, 'FETCH_HEAD')
    try:
        return time.time() - os.path.getmtime(fh)
    except OSError:
        return None


# ── branch classification ───────────────────────────────────────────────────

def classify_branches(repo, base):
    """Every remote branch, sorted into landed / unrelated / live.

    landed     no commits outside base: cannot be in flight
    unrelated  no merge-base with base: a rewritten or foreign history line,
               structurally unable to be current work on today's base
    live       carries commits not reachable from base: the candidate set

    Ordered so the expensive per-branch calls run over the smallest set that
    still needs them. `--merged` settles the landed group in one invocation;
    merge-base then runs only over the remainder, and the ahead-count only over
    what survives that. The merge-base probes run on a thread pool because they
    are independent and spend their time in a subprocess, not in Python.

    The remainder is probed one branch at a time on purpose. Deciding it in bulk
    with `for-each-ref --contains <roots>` is tempting and wrong: a base branch
    with several root commits (this repo has three) makes that filter
    misclassify, and it was measured dropping a genuinely related branch. An
    exact answer over a few hundred refs is worth more than a fast wrong one.
    """
    fmt = '%(committerdate:unix)%09%(committerdate:short)%09%(refname:short)%09%(subject)'
    out = git(repo, 'for-each-ref', 'refs/remotes/origin', '--format', fmt)
    base_short = base.split('/', 1)[-1]
    merged = {r[len('origin/'):] if r.startswith('origin/') else r
              for r in git(repo, 'for-each-ref', 'refs/remotes/origin', '--merged',
                           base, '--format', '%(refname:short)').split('\n') if r}
    now = time.time()
    landed, unrelated, live = [], [], []
    rest = []

    for line in out.splitlines():
        parts = line.split('\t')
        if len(parts) < 3:
            continue
        unix, iso, ref = parts[0], parts[1], parts[2]
        subject = parts[3] if len(parts) > 3 else ''
        name = ref[len('origin/'):] if ref.startswith('origin/') else ref
        if name in ('HEAD', base_short) or ref == base:
            continue
        try:
            days = int((now - int(unix)) // 86400)
        except ValueError:
            days = None

        rec = {'branch': name, 'days': days, 'subject': subject, 'last': iso}
        if name in merged:
            rec['ahead'] = 0
            landed.append(rec)
        else:
            rest.append(rec)

    with ThreadPoolExecutor(max_workers=8) as pool:
        related = list(pool.map(
            lambda r: git_ok(repo, 'merge-base', base, 'origin/' + r['branch']), rest))
        maybe = [r for r, ok in zip(rest, related) if ok]
        unrelated = [r for r, ok in zip(rest, related) if not ok]
        counts = list(pool.map(
            lambda r: git(repo, 'rev-list', '--count',
                          'origin/' + r['branch'], '--not', base).strip(), maybe))

    for rec, ahead in zip(maybe, counts):
        rec['ahead'] = int(ahead) if ahead.isdigit() else None
        (landed if rec['ahead'] == 0 else live).append(rec)

    live.sort(key=lambda r: (r['days'] is None, r['days']))
    return {'live': live, 'landed': landed, 'unrelated': unrelated}


def content_signal(repo, base, branch):
    """For one live branch: paths it touched, and which of those still differ
    from base. Zero unlanded paths on a branch that is ahead means the content
    reached base by another route (a squash), so the ahead-count alone would
    overstate it. Only ever run over the live set, which is small."""
    ref = f'origin/{branch}'
    touched = {p for p in git(repo, 'log', '--no-merges', '--format=',
                              '--name-only', ref, '--not', base).split('\n') if p}
    if not touched:
        return {'touched': [], 'unlanded': []}
    differ = {p for p in git(repo, 'diff', '--name-only', base, ref).split('\n') if p}
    return {'touched': sorted(touched), 'unlanded': sorted(touched & differ)}


SESSION_RE = re.compile(r'https://claude\.ai/code/session_[A-Za-z0-9]+')


def sessions_for(repo, base, branch):
    """The Claude Code session(s) that authored a branch, read from the
    `Claude-Session:` commit trailer.

    That trailer is the only session identity git carries. The commits are
    SSH-signed, but the signing key is Anthropic's and constant: measured across
    41 distinct sessions in one repo it never varied, so the signature
    authenticates the author, not the session. Nothing else in the object,
    author, or committer names a session either.

    The branch's own commits are read first, since that set is exactly its work:
    a count drawn from them is a true "worked across N sessions". Reading a
    window back from the tip instead would run past the branch point into the
    base branch's history and inflate the count with sessions that never touched
    this branch. Merge commits are skipped throughout: GitHub generates them and
    they carry no trailer.

    A merged branch has no own commits, so it falls back to a short window at
    the tip, which still names the session that wrote it. That fallback can
    reach past the branch point, so it yields one session rather than a count.

    Returns the most recent session first.
    """
    def scan(text):
        ordered, seen = [], set()
        for m in SESSION_RE.finditer(text):
            if m.group(0) not in seen:
                seen.add(m.group(0))
                ordered.append(m.group(0))
        return ordered

    own = scan(git(repo, 'log', '--no-merges', '-40', '--format=%B',
                   f'origin/{branch}', '--not', base))
    if own:
        return own
    return scan(git(repo, 'log', '--no-merges', '-3', '--format=%B',
                    f'origin/{branch}'))[:1]


def touches(paths, targets):
    """Which target paths a branch's touched set hits. A target naming a folder
    matches everything beneath it."""
    hits = set()
    for t in targets:
        t = t.rstrip('/')
        for p in paths:
            if p == t or p.startswith(t + '/'):
                hits.add(t)
                break
    return sorted(hits)


# ── tracker claims ──────────────────────────────────────────────────────────

SKIP_DIRS = {'.git', 'node_modules', 'dist', '.venv', '__pycache__', 'archive'}


def find_task_dirs(repo):
    """Every tracker/tasks directory in the repo. A repo may hold several
    trackers, one per workspace."""
    found = []
    for root, dirs, _files in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        if os.path.basename(root) == 'tasks' and os.path.basename(os.path.dirname(root)) == 'tracker':
            found.append(root)
    return sorted(found)


def parse_frontmatter(text):
    """The TRACKER.md parser contract: a leading --- block of flat key: value
    scalars, split on the first colon. Malformed input degrades to fewer keys,
    never to an exception, because task files arrive from channels that never
    ran a YAML validator."""
    if not text.startswith('---'):
        return {}
    lines = text.split('\n')
    if not lines or lines[0].strip() != '---':
        return {}
    fm = {}
    for line in lines[1:]:
        if line.strip() == '---':
            break
        if ':' not in line or line.lstrip().startswith('#'):
            continue
        k, v = line.split(':', 1)
        k = k.strip()
        v = v.split('#')[0].strip() if k == 'status' else v.strip()
        if k:
            fm[k] = v
    return fm


TASK_PATH_RE = re.compile(r'(?:^|/)tracker/tasks/[^/]+\.md$')


def base_task_files(repo, base):
    """Task file paths as the BASE branch has them.

    Tracker state lives on the base branch by design (see TRACKER.md): that is
    what makes it the one place every session checks. Reading the working tree
    instead reads whatever the checked-out branch happens to carry, which is
    stale the moment another session commits a task to base, and which reports a
    task closed on base as still in progress. This was measured on this repo:
    three tasks closed on main went on reading as in-progress from a feature
    branch until the source moved here.
    """
    out = git(repo, 'ls-tree', '-r', '--name-only', base)
    return sorted(p for p in out.split('\n') if p and TASK_PATH_RE.search(p))


def read_claims(repo, base, worktree=False):
    """Tasks marked in-progress, across every tracker in the repo.

    Reads the base branch unless `worktree` is set or the base carries no
    tracker at all (an unadopted repo, or a task dir that only exists on this
    branch), in which case the checked-out files are the only source there is.
    """
    claims, total = [], 0
    source = 'base'
    files = [] if worktree else base_task_files(repo, base)
    if not files:
        source = 'worktree'
        files = [os.path.relpath(os.path.join(d, fn), repo)
                 for d in find_task_dirs(repo)
                 for fn in sorted(os.listdir(d)) if fn.endswith('.md')]

    for path in files:
        if source == 'base':
            text = git(repo, 'show', f'{base}:{path}')
        else:
            try:
                with open(os.path.join(repo, path), encoding='utf-8', errors='replace') as fh:
                    text = fh.read(8192)
            except OSError:
                continue
        fm = parse_frontmatter(text[:8192])
        total += 1
        if fm.get('status') == CLAIM_STATUS:
            claims.append({
                'title': fm.get('title') or os.path.splitext(os.path.basename(path))[0],
                'session': fm.get('session') or '',
                'next': fm.get('next') or '',
                'opened': fm.get('opened') or '',
                'path': path,
            })
    return claims, total, source


# ── reconciliation ──────────────────────────────────────────────────────────

def reconcile(claims, index, quiet_days):
    """Judge each claim against the branch it names. This is the whole point:
    a claim is a statement about the world that decays silently, so it is worth
    only as much as the last time something checked it."""
    for c in claims:
        b = c['session']
        if not b:
            c['verdict'] = 'unverifiable'
            c['why'] = 'claim names no branch'
            continue
        b = b[len('origin/'):] if b.startswith('origin/') else b
        c['session'] = b
        rec = index.get(b)
        if rec is None:
            c['verdict'] = 'stale'
            c['why'] = 'branch no longer exists'
        elif rec['state'] == 'landed':
            c['verdict'] = 'stale'
            c['why'] = 'branch fully merged; close the task'
        elif rec['state'] == 'unrelated':
            c['verdict'] = 'stale'
            c['why'] = 'branch shares no history with the base branch'
        elif rec.get('unlanded') == 0:
            c['verdict'] = 'stale'
            c['why'] = f"ahead {rec['ahead']} but no path differs from base; content landed"
        elif rec['days'] is not None and rec['days'] > quiet_days:
            c['verdict'] = 'quiet'
            c['why'] = f"live, last commit {rec['days']}d ago"
        else:
            c['verdict'] = 'live'
            c['why'] = f"live, last commit {rec['last']}"
    return claims


def scan(repo, args, all_prs):
    base = args.base or default_base(repo)
    slug = repo_slug(repo)
    prs_by_head = prs_for(all_prs, slug)
    groups = classify_branches(repo, base)

    for rec in groups['live']:
        sig = content_signal(repo, base, rec['branch'])
        rec['touched'] = len(sig['touched'])
        rec['unlanded'] = len(sig['unlanded'])
        rec['unlanded_paths'] = sig['unlanded'][:12]
        rec['sessions'] = sessions_for(repo, base, rec['branch'])
        if args.paths:
            rec['hits'] = touches(sig['touched'], args.paths)

    index = {}
    for state in ('live', 'landed', 'unrelated'):
        for rec in groups[state]:
            index[rec['branch']] = {**rec, 'state': state}

    claims, total_tasks, claims_source = read_claims(repo, base, args.worktree)
    reconcile(claims, index, args.quiet_days)

    for rec in groups['live']:
        pr = prs_by_head.get(rec['branch'])
        rec['pr'] = pr
        # The commit trailer is preferred: it is attached to the work and
        # survives the PR being merged or closed. The PR body is the fallback.
        rec['session_from'] = 'commit' if rec['sessions'] else ''
        if not rec['sessions'] and pr and pr.get('session'):
            rec['sessions'] = [pr['session']]
            rec['session_from'] = 'pr'
        rec['claim'] = next((c['title'] for c in claims
                             if c['session'] == rec['branch']), None)

    # An open PR whose branch is not live has nothing left to deliver: it was
    # merged by another route, or its branch was rewritten out from under it.
    orphan_prs = [
        {**pr, 'why': ('branch gone' if pr['head'] not in index
                       else 'branch ' + index[pr['head']]['state'])}
        for head, pr in prs_by_head.items()
        if index.get(head, {}).get('state') != 'live'
    ]

    return {
        'repo': os.path.abspath(repo),
        'slug': slug,
        'base': base,
        'fetch_age': fetch_age(repo),
        'counts': {k: len(v) for k, v in groups.items()},
        'total_branches': sum(len(v) for v in groups.values()),
        'total_tasks': total_tasks,
        'claims_source': claims_source,
        'live': groups['live'],
        'claims': claims,
        'orphan_prs': orphan_prs,
    }


# ── report ──────────────────────────────────────────────────────────────────

def blink(slug, branch):
    if not slug:
        return f'`{branch}`'
    return f'[{branch}](https://github.com/{slug}/tree/{branch})'


def plink(slug, pr):
    url = pr.get('url') or (f"https://github.com/{slug}/pull/{pr['number']}" if slug else '')
    label = f"#{pr['number']}" + (' (draft)' if pr.get('draft') else '')
    return f'[{label}]({url})' if url else label


def slink(sessions, origin):
    """The authoring session as a link. A second session on the same branch is
    reported by count rather than listed: the point is that the branch changed
    hands, and the most recent session is the one to open."""
    if not sessions:
        return '**none**'
    label = 'session' + (f' +{len(sessions) - 1}' if len(sessions) > 1 else '')
    # A PR-sourced link describes the PR's author, which need not be the author
    # of the branch's latest commits. Mark it rather than implying equivalence.
    return f'[{label}]({sessions[0]})' + (' (via PR)' if origin == 'pr' else '')


def humanize(seconds):
    if seconds is None:
        return 'never fetched'
    if seconds < 3600:
        return f'{int(seconds // 60)}m ago'
    if seconds < 86400:
        return f'{int(seconds // 3600)}h ago'
    return f'{int(seconds // 86400)}d ago'


def render(results, args):
    out = [f'# In flight: {date.today().isoformat()}', '']
    out.append('> Generated by `in-flight.py` (read-only). '
               '**Live** means the branch carries commits the base branch does not. '
               'A branch that is not live cannot be in flight, whatever its name says.')
    out.append('')

    any_live = any(r['live'] for r in results)
    any_stale = any(c['verdict'] == 'stale' for r in results for c in r['claims'])

    for r in results:
        name = r['slug'] or os.path.basename(r['repo'])
        c = r['counts']
        out.append(f'## {name}')
        out.append('')
        out.append(f"{r['total_branches']} branches: **{c['live']} live**, "
                   f"{c['landed']} fully merged, {c['unrelated']} on an unrelated "
                   f"history line. Base `{r['base']}`, fetched {humanize(r['fetch_age'])}.")
        out.append('')

        # Claims first: the declared answer, and the one that decays.
        live_claims = [x for x in r['claims'] if x['verdict'] in ('live', 'quiet')]
        bad_claims = [x for x in r['claims'] if x['verdict'] not in ('live', 'quiet')]
        if not r['claims']:
            out.append(f"**Claimed:** nothing. 0 of {r['total_tasks']} tracker tasks "
                       f"on `{r['base']}` are marked `{CLAIM_STATUS}`"
                       + (', so the claim layer is unfed here and says nothing about '
                          'what is live.' if r['total_tasks'] else '.'))
            out.append('')
        else:
            src = 'the working tree' if r['claims_source'] == 'worktree' else f"`{r['base']}`"
            out.append(f"**Claimed:** {len(r['claims'])} of {r['total_tasks']} tasks on {src} "
                       f"marked `{CLAIM_STATUS}`, {len(live_claims)} confirmed against "
                       f"a live branch.")
            out.append('')
            if live_claims or args.all_claims:
                out.append('| Task | Branch | State | Next |')
                out.append('|---|---|---|---|')
                for x in (live_claims if not args.all_claims else r['claims']):
                    nxt = (x['next'][:80] + '...') if len(x['next']) > 80 else (x['next'] or '')
                    out.append(f"| 🎫 {x['title']} | {blink(r['slug'], x['session']) if x['session'] else ''} "
                               f"| {x['verdict']} | {nxt} |")
                out.append('')
            if bad_claims:
                out.append(f'**Stale claims ({len(bad_claims)}).** These say work is in '
                           'progress; the branch says otherwise. Close or re-point them.')
                out.append('')
                out.append('| Task | Names branch | Reality |')
                out.append('|---|---|---|')
                for x in bad_claims:
                    b = blink(r['slug'], x['session']) if x['session'] else '_none_'
                    out.append(f"| 🎫 {x['title']} | {b} | {x['why']} |")
                out.append('')

        if r['live']:
            out.append(f"**Live branches ({len(r['live'])}).**")
            out.append('')
            cols = [('Branch', '---'), ('Ahead', '--:'), ('Last', '---'),
                    ('Unlanded paths', '--:'), ('PR', '---'), ('Session', '---'),
                    ('Claimed', '---')]
            if args.paths:
                cols.append(('Touches', '---'))
            out.append('| ' + ' | '.join(c[0] for c in cols) + ' |')
            out.append('|' + '|'.join(c[1] for c in cols) + '|')
            for x in r['live']:
                unl = x['unlanded']
                cells = [
                    blink(r['slug'], x['branch']),
                    str(x['ahead']),
                    x['last'],
                    f"{unl}/{x['touched']}" + (' ⚠' if unl == 0 else ''),
                    plink(r['slug'], x['pr']) if x.get('pr') else '**none**',
                    slink(x.get('sessions') or [], x.get('session_from')),
                    ('🎫 ' + x['claim']) if x.get('claim') else '**none**',
                ]
                if args.paths:
                    cells.append(', '.join(f'`{h}`' for h in x['hits']) or '—')
                out.append('| ' + ' | '.join(cells) + ' |')
            out.append('')
            if any(x['unlanded'] == 0 for x in r['live']):
                out.append('⚠ Zero unlanded paths on a branch that is ahead: its content '
                           'is already on base, reached by a squash. Treat as landed.')
                out.append('')
        else:
            out.append('**Live branches:** none. Every branch is merged or on an '
                       'unrelated history line.')
            out.append('')

        if r['orphan_prs']:
            out.append(f"**Open PRs with nothing live ({len(r['orphan_prs'])}).** "
                       'Delivered or abandoned; the PR is still open.')
            out.append('')
            for pr in r['orphan_prs']:
                out.append(f"- {plink(r['slug'], pr)} {pr['title']} ({pr['why']})")
            out.append('')

    # The verdict. This is what a session reads before deciding to start.
    out.append('## Read')
    out.append('')
    if args.paths:
        scoped = [(r, x) for r in results for x in r['live'] if x.get('hits')]
        tgt = ', '.join(f'`{p}`' for p in args.paths)
        if scoped:
            out.append(f'**Collision on {tgt}.** Live work touches these paths:')
            out.append('')
            for r, x in scoped:
                out.append(f"- {blink(r['slug'], x['branch'])} "
                           f"({', '.join(x['hits'])}), {x['unlanded']} unlanded paths"
                           + (f", {plink(r['slug'], x['pr'])}" if x.get('pr') else ', no PR'))
            out.append('')
            out.append('Read those branches before starting. Anything not listed above is '
                       'merged or on a dead history line and cannot conflict.')
        else:
            out.append(f'**Clear on {tgt}.** No live branch touches them. '
                       'Safe to start.')
    elif not any_live:
        out.append('Nothing is live in any scanned repo. Any branch you find is history.')
    else:
        out.append('Live work is listed above. Only those branches can conflict with '
                   'new work; everything else in the estate is merged or orphaned.')
    out.append('')
    if any_stale:
        out.append('Stale claims are listed per repo. Each is a tracker task asserting '
                   'work is underway when its branch has landed or vanished. Fixing them '
                   'is a task-file edit committed to the base branch, not branch work.')
        out.append('')
    stale_fetch = [r for r in results if r['fetch_age'] is None or r['fetch_age'] > 3600]
    if stale_fetch and not args.fetch:
        names = ', '.join(r['slug'] or os.path.basename(r['repo']) for r in stale_fetch)
        out.append(f'Refs for {names} were last fetched over an hour ago. Rerun with '
                   '`--fetch` for a current picture.')
        out.append('')
    return '\n'.join(out).rstrip() + '\n'


# ── entry ───────────────────────────────────────────────────────────────────

def load_prs(path):
    """Open PRs as [{number, title, head, draft, url}], keyed by head branch.
    Tolerates the REST shape, where head is an object."""
    if not path:
        return {}
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    if isinstance(data, dict):
        data = data.get('items') or data.get('pull_requests') or []
    out = {}
    for pr in data:
        head = pr.get('head')
        if isinstance(head, dict):
            head = head.get('ref')
        if not head:
            continue
        head = head[len('origin/'):] if head.startswith('origin/') else head
        # Which repo the PR belongs to, so a branch name common to two scanned
        # repos does not pick up the other's PR. Taken from an explicit `repo`,
        # else inferred from the URL. Absent, the PR matches any repo.
        slug = pr.get('repo')
        if not slug:
            m = re.search(r'github\.com/(?:repos/)?([^/]+/[^/]+)/pulls?/', pr.get('url') or
                          pr.get('html_url') or '')
            slug = m.group(1) if m else None
        # The PR body carries the session footer, the fallback for a branch whose
        # commits have no trailer. Accept it pre-extracted or scrape the body.
        sess = pr.get('session')
        if not sess:
            m = SESSION_RE.search(str(pr.get('body') or ''))
            sess = m.group(0) if m else ''
        out.setdefault(head, []).append({
            'number': pr.get('number'),
            'title': (pr.get('title') or '').strip(),
            'head': head,
            'repo': slug,
            'draft': bool(pr.get('draft')),
            'session': sess,
            'url': pr.get('html_url') or pr.get('url') or '',
        })
    return out


def prs_for(prs_by_head, slug):
    """The PR index narrowed to one repo: entries naming another repo drop out."""
    out = {}
    for head, cands in prs_by_head.items():
        match = [p for p in cands if p['repo'] is None or p['repo'] == slug]
        if match:
            out[head] = match[0]
    return out


def main():
    ap = argparse.ArgumentParser(
        description='Report which branches are live and whether any touch your work.')
    ap.add_argument('repos', nargs='*', default=None,
                    help='repo paths to scan (default: current directory)')
    ap.add_argument('--paths', nargs='+', default=[],
                    help='files or folders the coming work will touch')
    ap.add_argument('--prs', help='JSON file of open PRs to overlay')
    ap.add_argument('--base', help='base branch (default: origin HEAD, else origin/main)')
    ap.add_argument('--quiet-days', type=int, default=7)
    ap.add_argument('--fetch', action='store_true', help='git fetch origin --prune first')
    ap.add_argument('--all-claims', action='store_true')
    ap.add_argument('--worktree', action='store_true',
                    help='read tracker tasks from the checked-out files instead of the base branch')
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()

    repos = args.repos or ['.']
    try:
        prs_by_head = load_prs(args.prs)
    except (OSError, ValueError) as e:
        print(f'in-flight: could not read --prs {args.prs}: {e}', file=sys.stderr)
        return 2

    results = []
    for repo in repos:
        if not is_repo(repo):
            print(f'in-flight: not a git repo, skipping: {repo}', file=sys.stderr)
            continue
        if args.fetch:
            subprocess.run(['git', '-C', repo, 'fetch', 'origin', '--prune'],
                           capture_output=True, text=True, timeout=300)
        results.append(scan(repo, args, prs_by_head))

    if not results:
        print('in-flight: no repos scanned', file=sys.stderr)
        return 2

    if args.json:
        json.dump(results, sys.stdout, indent=2)
        sys.stdout.write('\n')
    else:
        sys.stdout.write(render(results, args))
    return 0


if __name__ == '__main__':
    sys.exit(main())
