---
name: caption
description: >-
  Emit the surfacing caption for the current branch: the 🌿 branch-page line
  with the file count and the turn's commit, plus ⭐/🥏/📦 render lines and
  the 🧭 guide pointer, at closer (the default), files (the enumerated
  [new]/[main]/[diff] list, for a reader with no GitHub token), or recap (the
  closer wrapped in a fixed-form session re-entry) size. Also the engine for
  syncing a guide PR body's managed region. Use when the user says "caption"
  or asks for the file-link list, when a guide PR body needs a sync after a
  push, or when the user says "reorient", "recap", "catch me up", or "where
  are we".
---

# Caption

The caption is the fixed, predictable close on a file-modifying turn. Since
2026-08-26 it says **where to look** rather than listing what moved: the branch
page enumerates the changed files already, grouped, current on every load, with
each file's diff a tap away, so a hand-built list restates it, ages against it,
and costs a turn's work to make. This skill emits that close.

Formats follow the surfacing conventions (`docs/SURFACING.md` in
`mehrlander/web-tools`, or the copy loaded in this session). Substitute the
current repo into all URL templates.

## Sizes

- **closer** (default): the 🌿 line, the render line, the 🧭 tail. What a
  file-modifying reply ends with.
- **files**: the enumerated `[new]/[main]/[diff]` list. Not the default: it is
  the fallback for a reader with no stored GitHub token, or a repo whose branch
  page is not deployed. Ask for it by name.
- **recap**: the re-entry size: the closer wrapped in the session's story, in
  the fixed form below. For "where are we", "catch me up", or a long gap in the
  conversation.

A caption can also be requested on a topic (see Topical captions), where the
user names the file set and change state is beside the point; a topical caption
is always enumerated, since there is no branch reading to point at.

## The closer

```
🌿 [<branch>](…/pages/branch.html#gh=<owner>/<repo>@<branch>) · <N> files · [this turn](…/commit/<sha>)
```

- `<N>` is `git diff origin/main...HEAD --name-only | wc -l`.
- `<sha>` is `git rev-parse HEAD`, the turn's own commit. It answers the one
  question the page cannot, since the page reads the whole branch. Drop the
  segment where `git rev-list --count origin/main..HEAD` is 1 and the branch and
  the turn are the same thing.
- Where the branch has a PR, address it as `#gh=<owner>/<repo>&pr=<n>` instead,
  which resolves to the head and base the PR was opened against. See Tail.

Two things it does not do. It **replaces the list, never the prose**: a turn
that changed something non-obvious still says so in words, and a closer of two
links over an unexplained change is the failure this shape invites. And it does
not carry the render line, which follows it unchanged and under the same honesty
gate.

**Addressing one file, or one pane.** `&file=<path>` opens the page's file deck
on that file; for a changed file that beats a `[new]` blob, since the slide
carries the diff, the file rendered as itself, and the sidebar's compare bar,
where the blob carries the tip alone. `&pane=files` opens on the file list
rather than the guide. Both ride the standalone page and the in-app takeover
(`app/?view=activity&detail=<owner>/<repo>@<branch>&pane=files&file=<path>`).

## Rows (the `files` size)

The enumerated form, kept because the branch page is token-gated and these are
plain `github.com` links that resolve on any signed-in session. Reach for it
when the reader has no stored token, when the repo has no deployed branch page,
or when the user asks for it; not otherwise.

One bullet per file, filename plain, link words tappable, rows uniform (no
bullet swaps, no per-row icons), a file's links not repeated within a turn. A
diff link is slashed to the blob anchor it is measured against, so the pair
shows what the diff is a diff of:

- `[new]` is the file at the branch tip (`blob/<branch>/<path>`).
- `[main]` is the file at the main baseline (`blob/main/<path>`).
- `[main]/[diff]` is the net change against main (main as base, tip as head):
  the reviewer's diff, and the only diff most rows need.
- `[new]/[diff]` is the file's on-branch history (prior branch state to tip):
  optional, only when more than one branch commit touched the file.

The slash-joined pair is a **chat** shape. Chat renders it correctly; the GitHub
MCP write path measures the two links as one span and kills the pair well before
either URL looks long (see Syncing a guide PR body). A body never carries this
list anyway, so the two rules do not collide in practice.

The changed-file row, with URLs, is:

```
- <path> ([new](https://github.com/<owner>/<repo>/blob/<branch>/<path>), [main](https://github.com/<owner>/<repo>/blob/main/<path>)/[diff](https://github.com/<owner>/<repo>/commit/<sha>))
```

Per file state:

- New file (absent on main): `[new]`. Built over several branch commits:
  `[new]/[diff]`. No `[main]` side.
- Changed file: `[new], [main]/[diff]`. Over several commits:
  `[new]/[diff], [main]/[diff]`.
- Deleted file: `[main]/[diff]` (the removal). No `[new]`.

Diff URLs:

- Exactly one branch commit touched the file: that commit diff is the
  against-main diff, so `[diff]` = `commit/<sha>`
  (`git log main..HEAD -1 --format=%h -- <path>`).
- Several commits touched it: the true against-main diff is
  `compare/main...<branch>#diff-<sha256(path)>`; that anchor is a sha256 of the
  path and scrolls unreliably, so the newest commit is an acceptable fallback.
- The `[new]/[diff]` history link is the newest commit or a commit-range
  compare.

Worked example, one row per state:

```
- README.md      (new, main/diff)       changed in one commit
- CLAUDE.md      (new/diff, main/diff)  changed over several commits
- foo/SKILL.md   (new)                  one-commit new file, no diff
- notes.md       (new/diff)             new file built over several commits
- old-tool.sh    (main/diff)            deleted
```

Add `#L120` or `#L120-L145` to a blob link when a specific change is the point.
Add an indented `renders on: [<consumer>](…)` line under a shared component.

## Dense variant: folder tables (optional)

When a turn's changes cluster under folders, especially several new files in one
folder (a new skill, a component dir), a markdown table can beat the bullet
list: it carries each folder path once, links it to the tree, and drops the
`[new]` scaffolding. Reach for it on that clustered case; for a short or
scattered list the bullets stay clearer. Specials (🥏, ⭐, 🧭) stay outside the
tables as their own lines.

Shape: two tables, `New` and `Changed`. The word is the first header cell, the
second header is blank. Column one is the folder, linked to its tree; column two
lists the files. A filename always links to its `[new]` blob, so a `New` row
stops at `[new]` and a `Changed` row appends `([main]/[diff])` in parens; a
changed row touched by several commits may prepend `[new]/[diff]` before the
`[main]/[diff]` pair.

```
| New | |
|---|---|
| [<dir>/](…/tree/<branch>/<dir>) | [<file>](…/blob/<branch>/<dir>/<file>), … |

| Changed | |
|---|---|
| [<dir>/](…/tree/<branch>/<dir>) | [<file>](…/blob/<branch>/<dir>/<file>) ([main](…/blob/main/<dir>/<file>)/[diff](…/commit/<sha>)) |
```

Worked example (a turn that added a skill folder and edited one doc):

| New | |
|---|---|
| [.claude/skills/task-tracker/](https://github.com/<owner>/<repo>/tree/<branch>/.claude/skills/task-tracker) | [SKILL.md](https://github.com/<owner>/<repo>/blob/<branch>/.claude/skills/task-tracker/SKILL.md) |
| [.claude/skills/file-retrieval/](https://github.com/<owner>/<repo>/tree/<branch>/.claude/skills/file-retrieval) | [SKILL.md](https://github.com/<owner>/<repo>/blob/<branch>/.claude/skills/file-retrieval/SKILL.md), [corpus_search.py](https://github.com/<owner>/<repo>/blob/<branch>/.claude/skills/file-retrieval/corpus_search.py), [read_doc.py](https://github.com/<owner>/<repo>/blob/<branch>/.claude/skills/file-retrieval/read_doc.py), [sources.toml](https://github.com/<owner>/<repo>/blob/<branch>/.claude/skills/file-retrieval/sources.toml) |

| Changed | |
|---|---|
| [docs/](https://github.com/<owner>/<repo>/tree/<branch>/docs) | [TRACKER.md](https://github.com/<owner>/<repo>/blob/<branch>/docs/TRACKER.md) ([main](https://github.com/<owner>/<repo>/blob/main/docs/TRACKER.md)/[diff](https://github.com/<owner>/<repo>/commit/<sha>)) |

A file deeper than its folder carries the sub-path in the link text
(`searches/README.md`). The sizes, render lines, and tail above are unchanged;
only the file list swaps shape.

**Other grouping axes.** Folder-then-files is one instance of a general move:
group by whatever axis clusters the rows, one bold or header line per group,
members below it. The `tasks` skill applies this to tracker tasks grouped by
owning branch (single-column table, bold branch row, `↳`-prefixed task rows),
a longer-not-wider layout that reads better on a narrow screen than packing
several items into one wide cell. Reach for that shape whenever rows cluster
by an owner (branch, folder, author) rather than files under a folder
specifically.

## Topical captions

When the request names a subject rather than the session's changes ("caption
the portable docs"), select by enumerating the topic, not by git diff. An
unchanged file gets one link, the main blob:

```
- <path> ([main](https://github.com/<owner>/<repo>/blob/main/<path>))
```

The `[new]/[main]/[diff]` triple encodes change state, so for an unchanged
file the extra links would be noise; omit them. A changed file caught in a
topical caption keeps the full triple.

## Render lines

After the list, a blank line, then one 🥏 or ⭐ line per changed renderable HTML
page, link text the page path. Honesty gate: a kit, doc, or asset gets none.

**Do not decide this by reading. Run `npm run showing`** (web-tools;
`python3 scripts/showing.py` anywhere the script has travelled). It reads the
branch's own changed files and prints the render line ready to paste, or an
honest "no link reaches this" with the reason, and it checks the two things
that go wrong silently: that the SHA it names is pushed, and that `dist/` was
rebuilt so `?use=` carries the lib change rather than last week's bundle.

The rules it runs are the ones this section used to state: lib or dist change →
⭐ `?use=<sha>` on the deployed page; a page's own file → 🥏 toss
`#gh=<owner>/<repo>@<sha>:<path>` with `?use=` in the renderer's query; the
renderer itself → a nested toss; a shell change acting on the top-level
document (title, favicon, history, navigation) → no link at all, send a
screenshot. They are stated once as data in `docs/routes.json` and
`docs/showing-mechanisms.csv`, and the script is what executes them.

**Why a command rather than a paragraph.** The paragraph was here, correct and
complete, on 2026-08-22 when a session changed `lib/alpineComponents/estate.js`
and reported that no link could show it. It never opened the table, because it
was sure it already knew, and a wrong pick does not error: it yields a link
that resolves and shows the wrong week. Reading cannot fix a failure whose
first symptom is confidence.

Two things the script cannot do, so they stay yours: it cannot tell whether the
change is VISIBLE (a refactor gets a valid link that shows nothing new), and it
cannot see pixels. Where it names several pages, pick the one the change is
about. With no preview mechanism and no script, the portable fallback is the 🥏
`#gz=` toss.

A page published as an artifact this session gets a 📦 line: link text the
page path, URL the claude.ai artifact URL. Pick by where the link opens: the
Claude app's in-app browser has its own storage, so a token is not guaranteed
there and `#gh=` may fail, while 📦 and `#gz=` always work (matrix in
`docs/artifacts.md`). Record an artifact URL
in a durable place (README, PR body, task file) or later sessions cannot
find it.

## The review line (🔍)

A caption with several changed files can add one 🔍 line after the render
lines: a link into the hosted review page, which renders every row's
`[new]/[main]/[diff]` as live views (CM6 diff against the merge base, patch
text, raw content, and the outbound links per file):

```
🔍 [review main...<branch>](https://mehrlander.github.io/web-tools/pages/review.html#gh=<owner>/<repo>@<branch>&base=main)
```

A single file reviews with `#gh=<owner>/<repo>@<branch>:<path>&base=main`.
Same honesty gate as 🥏 `#gh=` and 🗂️ `#stage=`: the link carries refs only
and is token-gated, so it renders only in a browser holding the viewer's
token (possibly absent in the Claude app's in-app browser). It supplements
the rows, never replaces them: the plain GitHub links stay the portable
fallback.

## The branch line (🌿) and its authored layer

The caption's judgment can ride the branch page instead of being re-typed
per turn: `build-branch-review.mjs` (bundled beside this file) serializes it as
a **branch-review/1 surface**, the authored envelope `pages/branch.html`
renders over its live derived layer. This is the decided format: `/caption`
emits branch-review/1, and the plain branch-brief shape stays accepted by the
page's reader only as a hand-authoring convenience.

Write the judgment (the part no API can derive) to a notes file, then:

```
node .claude/skills/caption/build-branch-review.mjs --notes notes.json --link
```

notes.json: `{ "intent": "...", "open": ["..."], "omitted": ["..."],
"files": { "<path>": "one-line why" }, "notes": "..." }`. The script derives
the rest from git (repo, branch, revisions, changed files with statuses),
validates against both schemas (core surface v2 plus the profile; an invalid
surface is an error, not an artifact), and `--link` prints the 🌿 address with
the surface gzipped into the fragment:

```
🌿 [<repo>@<branch>](…/pages/branch.html#gh=<repo>@<branch>&base=main&gz=<payload>)
```

Emit it at guide-PR sync or wrap-up. The derived layer stays live either way;
the envelope only ever adds. Gated by
`tools/test/branch-review-emit.test.mjs` (schema validity, the page reader's
projection, the gz round-trip).

**The `&gz=` link is for chat, never for a PR body or a comment.** The payload
carries the whole surface, so the address runs into the hundreds of characters
(844 for an almost-empty notes file, and it grows with the notes), and anything
at 150 or more is wrapped in backticks by the write path and stored as dead
text. That failure is unusually expensive here: the fragment never reaches a
server, so the link is the instance's only carrier, and a defanged one is lost
content rather than an inconvenient link.

To put the judgment somewhere durable, write the surface to a file instead of a
fragment, commit it, and address it:

```
node .claude/skills/caption/build-branch-review.mjs --notes notes.json --out <path>
🌿 …/pages/branch.html#gh=<owner>/<repo>@<branch>&base=main&src=<owner>/<repo>@<branch>:<path>
```

`&src=` names the committed envelope rather than embedding it, which keeps the
address short enough to survive a body and gives the surface a home that outlives
one link. Count the URL before writing it either way.

## Tail

The 🌿 line IS the caption now rather than a tail after a list, so it carries
the closer's counts. When the branch has a guide PR, close with **both**
pointers, 🌿 first:

```
🌿 [branch](https://mehrlander.github.io/web-tools/pages/branch.html#gh=<owner>/<repo>&pr=<n>) · <N> files · [this turn](…/commit/<sha>) · 🧭 [PR #N](<url>)
```

Break it across two lines where it runs long on a phone, 🧭 on the second.

They name the same PR and are not redundant, because they open different
readings of it:

- **🌿 the branch page** renders the guide body *and* the derived file list as
  diff cards, with the body's file links re-aimed at what can show each file.
  One tap, the whole picture, current at open time. Token-gated like every
  `#gh=` address, so it may fail in an in-app browser.
- **🧭 GitHub** is where the PR is *operated*: the Files tab, comments, checks,
  the merge button. It is also the tokenless fallback when 🌿 will not resolve.

With no PR, 🌿 still works on the branch alone
(`#gh=<owner>/<repo>@<branch>`) and 🧭 is omitted. In a repo whose branches the
viewer's token cannot read, 🌿 is dropped and the caption falls back to the
`files` size, since dropping it otherwise leaves the turn with no account of
what moved.

## The recap form

The recap size wraps the caption in a fixed-form re-entry summary, kept to
one screen. The fixed form is the point: every recap reads the same way, so
the user can scan by section.

1. **Goal:** one sentence: what this session set out to do and why.
2. **Decisions:** the choices settled so far, one line each, in the order
   they were made. State the decision, not the deliberation.
3. **State:** the closer: branch anchor, the 🌿 line with its counts, render
   lines, PRs and tracker tasks touched, the 🧭 tail. Enumerate only at the
   `files` size.
4. **Open:** questions raised but not settled, one line each.
5. **Next:** the immediate next actions, in order.

Rules: plain, dry register; no em dashes; a recap introduces nothing new (no
proposals, no analysis); when a section is empty, write "none" rather than
omitting it, so the form stays fixed.

## Syncing a guide PR body

The guide PR body's managed region is delimited by the markdown link labels
`[//]: # (guide)` … `[//]: # (/guide)`. To sync after a push: regenerate the
region (⭐ Look line, change-set paragraph, Next steps / open threads,
Notes / Risk), rewrite only that region via the GitHub API
(`update_pull_request`), and leave everything outside the delimiters untouched.
Narrative goes in PR comments, not the body.

**The body is not the caption, and this section used to say it was.** Since
2026-08-08 the guide body does not enumerate files at all: GitHub's Files tab
and the branch page's Files pane both derive that list and are current by
construction, so a body row can only restate them and go stale. The body carries
the judgment layer instead, a change-set paragraph in prose naming only the files
with something non-obvious to say, paths plain and no link triplets
(`docs/SURFACING.md`, "The body does not enumerate files"). Chat closes the same
way as of 2026-08-26, so the two are now one rule rather than two; the
enumerated list is the tokenless fallback in both places. Emitting it into a
body also walks the rows straight into the write-path fault below, which is how
the contradiction stayed cheap enough to survive: it produced a body that was
merely redundant most of the time and dead links some of the time.

**Count every URL you write to a body or a comment.** The GitHub MCP write path
wraps a URL of 150 characters or more in backticks, storing the link as literal
text that renders dead on GitHub and everywhere downstream; 149 or fewer
survives, and the label never counts. The slash-joined pair is the trap, because
`)/[` does not end the URL token: the measured span runs from the first URL's
first character through the second URL's last, joining punctuation and the
second label included, so two clean 70-character links make one 149-character
span and a single character more kills the pair. Comma-joining ends the run.
Check a body before writing it:

```
python3 scripts/mcp-link-safe.py --check body.md
```

Add `--unescape-entities` when checking a body read back through the MCP, whose
readback expands `&` into `&amp;` and inflates the count. Evidence, with every
probe and its control, is in `docs/environment/capabilities.md`.

**Read both delimiters, write only the link-label one.** Bodies written before
2026-07-28 carry `<!-- guide -->` … `<!-- /guide -->`, so treat either pair as
the region when locating it, and emit the link-label form when rewriting. The
reason is not cosmetic: reading a body back through the GitHub MCP strips HTML
comments, so the older markers are invisible to the very step that needs them,
and a sync that cannot find its region appends a second one or overwrites
hand-written prose. If neither pair is present, stop and say so rather than
guessing at the boundary. Link labels are reference definitions, so keep each on
its own line with blank lines around it.
