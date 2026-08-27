#!/usr/bin/env python3
"""Weekly size-and-churn series for a repo's markdown, as one JSON payload.

Samples the default branch every N days, records every matching file's size in
words at each sample, and folds in per-file commit churn from `git log
--numstat`. Output feeds pages/doc-growth.html.

    python3 scripts/doc-growth.py . -o data/doc-growth/web-tools.json

Words come in two flavours because they answer different questions: `w` counts
every token, `p` skips fenced code and YAML frontmatter. A generated reference
file is mostly code and tables, so the two diverge exactly where the authored /
mechanical line falls.
"""
import argparse, json, re, subprocess, sys, threading, time
from collections import defaultdict
from datetime import datetime, timezone

FENCE = re.compile(r'^\s*(```|~~~)')


def git(repo, *args, binary=False):
    r = subprocess.run(['git', '-C', repo, *args], capture_output=True)
    if r.returncode:
        sys.exit(f"git {' '.join(args)}: {r.stderr.decode()[:400]}")
    return r.stdout if binary else r.stdout.decode('utf-8', 'replace')


def counts(text):
    """(all words, prose words) for one markdown blob."""
    lines = text.split('\n')
    prose, infence, i = [], False, 0
    if lines and lines[0].strip() == '---':          # YAML frontmatter
        for j in range(1, len(lines)):
            if lines[j].strip() == '---':
                i = j + 1
                break
    for ln in lines[i:]:
        if FENCE.match(ln):
            infence = not infence
            continue
        if not infence:
            prose.append(ln)
    return len(text.split()), len('\n'.join(prose).split())


def group_of(path, containers):
    parts = path.split('/')
    if len(parts) == 1:
        return '(root)'
    if parts[0] in containers and len(parts) > 2:
        return '/'.join(parts[:2])
    return parts[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('repo')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--branch', default='main')
    ap.add_argument('--ext', default='.md')
    ap.add_argument('--days', type=int, default=7, help='sampling interval')
    ap.add_argument('--name', default=None, help='owner/repo label for the page')
    ap.add_argument('--containers', default='projects,packages,apps',
                    help='dirs that group by two segments, not one')
    ap.add_argument('--min-edits', type=int, default=1,
                    help='drop files touched in fewer commits than this. A file '
                         'at 1 was committed once and never revised, which in a '
                         'repo carrying generated markdown is most of the tree '
                         'and none of the story.')
    a = ap.parse_args()
    repo, containers = a.repo, set(a.containers.split(','))

    stamps = [int(x) for x in git(repo, 'log', '--format=%ct', a.branch).split()]
    first, last = min(stamps), max(stamps)
    step = a.days * 86400

    # --- churn: which commits touched what, and by how many lines -------------
    touched = defaultdict(list)          # path -> [(ts, added, deleted)]
    ts = None
    for line in git(repo, 'log', '--numstat', '--format=C|%ct',
                    '--no-renames', a.branch).split('\n'):
        if line.startswith('C|'):
            ts = int(line[2:])
        elif line and ts:
            add, dele, path = line.split('\t')
            if path.endswith(a.ext):
                touched[path].append((ts, int(add or 0) if add != '-' else 0,
                                      int(dele or 0) if dele != '-' else 0))

    # --- weekly trees ---------------------------------------------------------
    frames, trees = [], []
    t = first
    while t <= last + step:
        sha = git(repo, 'rev-list', '-1', f'--before=@{min(t, last)}', a.branch).strip()
        if sha:
            snap = {}
            for row in git(repo, 'ls-tree', '-r', '-l', sha).split('\n'):
                if not row:
                    continue
                meta, path = row.split('\t', 1)
                if path.endswith(a.ext):
                    snap[path] = meta.split()[2]      # blob sha
            frames.append(datetime.fromtimestamp(min(t, last), timezone.utc)
                          .strftime('%Y-%m-%d'))
            trees.append(snap)
        t += step

    # --- word counts, one read per distinct blob ------------------------------
    blobs = {s for snap in trees for s in snap.values()}
    sizes = {}
    proc = subprocess.Popen(['git', '-C', repo, 'cat-file', '--batch'],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    # Feed the request list from a thread. Writing it all up front deadlocks the
    # moment the batch outgrows a pipe buffer: git blocks writing blob content
    # nobody is reading yet, so our own write never returns. A repo small enough
    # to fit both sides in 64K (web-tools) runs clean and hides the bug.
    def feed():
        proc.stdin.write(('\n'.join(blobs) + '\n').encode())
        proc.stdin.close()
    writer = threading.Thread(target=feed, daemon=True)
    writer.start()
    for sha in blobs:
        header = proc.stdout.readline().split()
        n = int(header[2])
        sizes[sha] = counts(proc.stdout.read(n).decode('utf-8', 'replace'))
        proc.stdout.read(1)
    writer.join()
    proc.wait()

    # --- assemble -------------------------------------------------------------
    paths = sorted({p for snap in trees for p in snap
                    if len(touched.get(p, [])) >= a.min_edits})

    # Drop leading and trailing samples that hold none of the kept files. A repo
    # that spent its first year as a scratch pad (web-tools was one file named
    # TestNew.txt until April 2026) otherwise ships dozens of empty frames, and
    # a player that opens on one is indistinguishable from a player still
    # loading. Trimming here rather than in the page keeps every consumer honest.
    keep = [k for k, snap in enumerate(trees) if any(p in snap for p in paths)]
    if keep:
        lo, hi = keep[0], keep[-1] + 1
        trees, frames = trees[lo:hi], frames[lo:hi]
        first += lo * step
    groups = sorted({group_of(p, containers) for p in paths})
    gi = {g: i for i, g in enumerate(groups)}
    files = []
    for p in paths:
        w, pr, ed, net = [], [], [], []
        for k, snap in enumerate(trees):
            sha = snap.get(p)
            w.append(sizes[sha][0] if sha else None)
            pr.append(sizes[sha][1] if sha else None)
            lo = first + (k - 1) * step
            hi = first + k * step
            ev = [e for e in touched.get(p, []) if lo < e[0] <= hi]
            ed.append(len(ev))
            net.append(sum(e[1] - e[2] for e in ev))
        live = [i for i, v in enumerate(w) if v is not None]
        files.append({'p': p, 'g': gi[group_of(p, containers)],
                      'w': w, 'r': pr, 'e': ed, 'n': net,
                      'born': live[0] if live else 0,
                      'edits': len(touched.get(p, []))})

    out = {'repo': a.name or repo, 'branch': a.branch, 'ext': a.ext,
           'days': a.days, 'generated': time.strftime('%Y-%m-%d'),
           'frames': frames, 'groups': groups, 'files': files}
    with open(a.out, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f"{a.out}: {len(files)} files (min-edits {a.min_edits}), "
          f"{len(frames)} frames, "
          f"{len(groups)} groups, {first and frames[0]}..{frames[-1]}")


main()
