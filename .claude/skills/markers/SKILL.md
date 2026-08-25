---
name: markers
description: >-
  Operate the status system: mark a claim Frozen, Stale, or Wrong; declare a
  path frozen in .paths.json; inventory every marker and declaration in a repo;
  and check that arrow targets resolve and frozen files say so. Use when the
  user asks whether something is frozen or pinned, says "is this frozen", "what
  is frozen here", "mark this stale", "this is out of date but keep it", "flag
  this as wrong", "freeze this page", "what should I not edit", "stale flags",
  "update markers", or invokes /markers. Also use before editing anything in a
  workspace that pins historical material, and when a session opens on a repo
  whose frozen areas it has not seen. Owns the Frozen/Stale/Wrong vocabulary,
  the .paths.json declaration, and status.py; the tasks skill owns tracker
  tasks and the web-tools skill owns PR bodies and surfacing links.
---

# markers

Two carriers, split by subject. Getting the split right is the whole point, so
lead with it.

| | Subject | Says | Covers |
|---|---|---|---|
| **Marker** | a claim, in prose | this passage is preserved, aged, or wrong | markdown only |
| **Declaration** | a file path | this artifact is pinned and must not be edited or rebuilt | any file type |

They are not two spellings of one thing. `Stale` and `Wrong` have no path
analogue: a paragraph can be wrong while its file is perfectly live. Only
`Frozen` overlaps, and only in one direction (below).

A marker cannot carry the declaration's job, and not by preference: a GFM alert
renders in markdown and nowhere else, so `.html`, `.js`, and `.csv` artifacts
can never hold one. That gap is exactly why frozen pages stay illegible until
something outside the prose declares them.

## The vocabulary

- **`Frozen`**: preserved on purpose. Correct as a snapshot; the living version
  has moved on. The arrow points at the living copy.
- **`Stale`**: no longer accurate, aged out of truth.
- **`Wrong`**: flatly incorrect, not merely aged.

## Marking a claim

Inline, for one claim inside a living document:

```markdown
**Stale 2026-07-20 → ../timeline.md:** the dates here predate the reschedule.
```

Whole file or section, as a GFM alert with the flavor in the bold lead-in
(`> [!NOTE]` for `Frozen`, `> [!WARNING]` for `Stale` and `Wrong`):

```markdown
> [!NOTE]
> **Frozen 2026-07-06 (tracker task 0032):** the page deliverables here are
> pinned historical works, existence-checked but no longer rebuilt.
```

Shape: `**Flavor YYYY[-MM[-DD]] [(note)] [→ target]:**`. Flavor, date, and
target hold fixed positions so the set is auditable rather than merely
greppable. The date is when you flagged it, or the snapshot's as-of date for
`Frozen`. The parenthetical is optional and usually cites the task that made
the call. The target is optional and may be a path, a markdown link, or prose
("two successors below"); only path-shaped targets are existence-checked.

A `status: frozen 2026-07-06; note` line in frontmatter is the optional
metadata layer.

**Annotate, do not rewrite.** A dated file stays put as a record. When one of
its claims ages, mark the claim; do not edit the record into agreement with the
present.

## Declaring a path

`.paths.json` may sit at a **repo root or any workspace root**. Entries are
relative to its own directory, and the nearest declaration wins. This is the
`.gitignore` cascade, and it is what lets one repo hold several workspaces with
different regimes without a root file that knows about all of them.

```json
{
  "frozen": [
    "research/budget-dive/dashboard.html",
    { "path": "app/studies/", "since": "2026-07-05", "why": "task 0016: pinned exhibits",
      "except": ["*/tools/*"] },
    { "path": "data/records/", "since": "2026-07-09",
      "except": ["fiscal-note-persistence-drs.csv"] }
  ]
}
```

- A bare string is shorthand for `{ "path": ... }`.
- A trailing `/` makes an entry cover a directory.
- `except` patterns are `fnmatch`, matched against the path *below* the entry,
  and `*` crosses `/`. They are what keeps a guard off the live inputs that sit
  inside frozen folders, which is the failure mode any whole-directory scheme
  walks into.

**Keep entries workspace-relative.** A workspace that gets restructured keeps
its declaration intact; root-relative entries would need rewriting on every
move.

## Running it

`status.py` ships beside this file. From a skill invocation:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/markers/status.py" inventory
python3 "${CLAUDE_PLUGIN_ROOT}/markers/status.py" check
python3 "${CLAUDE_PLUGIN_ROOT}/markers/status.py" is projects/budget-drs/app/spend/data.js
```

| Subcommand | What it does |
|---|---|
| `inventory` | every marker and declaration, as tables, plus findings |
| `declared` | just the declared paths, one per line, for piping |
| `check` | findings only; exit 1 if any |
| `is PATH` | whether that path is frozen, and which file says so |

`--root DIR` scopes it; the default is the git toplevel of the working
directory.

### Calling it from a plain shell

`CLAUDE_PLUGIN_ROOT` is only set inside a skill invocation, so a repo's own
build or verify script resolves the path itself. The install is discoverable in
three places, and this is the order to try:

```bash
plugin_script() {   # $1 = e.g. markers/status.py
  if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "$CLAUDE_PLUGIN_ROOT/$1" ]; then
    echo "$CLAUDE_PLUGIN_ROOT/$1"; return 0
  fi
  local reg="$HOME/.claude/plugins/installed_plugins.json" p
  p=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(d['plugins']['portable@web-tools'][0]['installPath'])" "$reg" 2>/dev/null || true)
  if [ -n "$p" ] && [ -f "$p/$1" ]; then echo "$p/$1"; return 0; fi
  p="$HOME/.claude/plugins/marketplaces/web-tools/.claude/skills/$1"
  if [ -f "$p" ]; then echo "$p"; return 0; fi
  p=".web-tools-scripts/$(basename "$1")"          # no-plugin fetch fallback
  if [ -f "$p" ]; then echo "$p"; return 0; fi
  p="$(dirname "$PWD")/web-tools/.claude/skills/$1"  # attached working clone
  if [ -f "$p" ]; then echo "$p"; return 0; fi
  return 1
}
```

The second path comes from `installed_plugins.json`, which records the exact
`installPath` and its `gitCommitSha`. The third is the marketplace clone, a
plain checkout of `main` at a stable path. Plugins install from **user**
settings rather than project settings, so they are present in sessions where a
repo's own `.claude/settings.json` was never read and its hooks never
registered. That makes the plugin the more dependable of the two channels, and
it is why a check that matters belongs here rather than in a repo hook.

The last entry is ranked last on purpose. A working clone attached beside the
repo makes a cross-repo change testable before it merges, and keeping it below
the installed copies means a normal run never silently exercises unmerged code.

## The cross-check, and why it runs one way

`check` reports:

1. a marker that does not parse, so a malformed one is loud instead of silently skipped;
2. an arrow target that no longer exists;
3. a declared path that does not exist;
4. **a markdown file declared frozen that carries no `Frozen` banner.**

Only (4) crosses between the carriers, and only in that direction. A frozen
markdown file should say so where it is read, since the JSON is invisible to
someone opening the file. The reverse does not hold: a `Frozen` marker inside a
living document annotates one claim and implies nothing about the file, so
requiring a declaration for every marker would be wrong.

## What to do when asked

- **"Is this frozen?"** → `is PATH`. Answer with the declaration and the why,
  not just yes or no.
- **"What is frozen here?"** → `inventory`, and report the declarations. Say
  plainly if the repo declares nothing.
- **"Mark this stale / wrong / frozen"** → write the marker at the claim, or
  the banner at the top for a whole file. Date it today, except a `Frozen`
  snapshot, which takes its as-of date. Point the arrow at the living copy when
  there is one.
- **"Freeze this page"** → add the `.paths.json` entry *and*, if it is
  markdown, the banner. Name the task or the reason in `why`.
- **Before editing** in a repo that declares anything → run `is` on the target
  path. A frozen file is re-anchored deliberately through its builder, never
  hand-edited.

Fix a finding rather than loosening the pattern to hide it, unless the pattern
is what is wrong: this convention has twice dropped markers that people wrote
correctly by any reasonable reading, and both times the fix belonged in the
regex.
