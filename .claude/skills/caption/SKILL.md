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

The caption is the fixed close on a file-modifying turn. Since 2026-08-26 it
says **where to look** rather than listing what moved: the branch page
enumerates the changed files already, grouped and current on every load, so a
hand-built list restates it and ages against it.

**`docs/SURFACING.md` states the rules; this file is the procedure.** What to
run, what to emit, in what order. The forms and their boundaries belong to the
primitives there (Surfacing caption, Open the branch, Guide pointer, Review the
diff) and are not repeated here. Substitute the current repo into every URL
template. Anything below that restates a rule rather than executing one has
drifted, and the fix is to cut it back to a pointer.

## Sizes

- **closer** (default): the 🌿 line, the render line, the 🧭 tail. What a
  file-modifying reply ends with.
- **files**: the enumerated `[new]/[main]/[diff]` list. The fallback for a
  reader with no stored GitHub token, or a repo whose branch page is not
  deployed. Ask for it by name.
- **recap**: the closer wrapped in the session's story, in the fixed form
  below. For "where are we", "catch me up", or a long gap in the conversation.

A caption can also be requested on a topic, where the user names the file set
and change state is beside the point.

## The closer

```
🌿 [<branch>](…/pages/branch.html#gh=<owner>/<repo>@<branch>) · <N> files · [this turn](…/commit/<sha>)
```

Derive it, do not type it:

| Part | Command |
| --- | --- |
| `<N>` | `git diff origin/main...HEAD --name-only \| wc -l` |
| `<sha>` | `git rev-parse HEAD` |
| drop `this turn`? | yes when `git rev-list --count origin/main..HEAD` is 1 |

Where the branch has a PR, address it as `#gh=<owner>/<repo>&pr=<n>`, which
resolves to the head and base the PR was opened against, and close with both
pointers, 🌿 first, 🧭 on a second line where it runs long on a phone:

```
🌿 [branch](…/pages/branch.html#gh=<owner>/<repo>&pr=<n>) · <N> files · [this turn](…/commit/<sha>) · 🧭 [PR #N](<url>)
```

Two failure modes. The closer **replaces the list, never the prose**: two links
over an unexplained change is the failure this shape invites. And in a repo
whose branches the viewer's token cannot read, drop 🌿 and fall back to the
`files` size, since dropping it otherwise leaves the turn with no account of
what moved.

## Render lines

After the closer, a blank line, then one 🥏, ⭐ or 📦 line per changed
renderable page, link text the page path.

**Do not decide this by reading. Run `npm run showing`** (web-tools;
`python3 scripts/showing.py` anywhere the script has travelled). It reads the
branch's changed files and prints the line ready to paste, or an honest "no
link reaches this" with the reason, and it checks the two things that go wrong
silently: that the SHA it names is pushed, and that `dist/` was rebuilt so
`?use=` carries the lib change rather than last week's bundle. The rules it
runs are data in `docs/routes.json` and `docs/showing-mechanisms.csv`. A wrong
pick does not error, it yields a link that resolves and shows the wrong week,
which is why this is a command and not a paragraph.

Three things the script cannot do, so they stay yours:

- It cannot tell whether the change is **visible**. A refactor gets a valid
  link that shows nothing new.
- It cannot see pixels. Send a screenshot as well for a visual change.
- It cannot choose among the pages it names. Take the one the change is about.

With no preview mechanism and no script, the portable fallback is the 🥏 `#gz=`
toss. A page published as an artifact this session gets a 📦 line, whose URL
also goes somewhere durable (README, PR body, task file) or later sessions
cannot find it.

## The review line (🔍)

A caption with several changed files can add one 🔍 line after the render
lines. Form and boundary: the Review the diff primitive.

## Rows (the `files` size)

One bullet per file, filename plain, link words tappable, rows uniform (no
bullet swaps, no per-row icons), a file's links not repeated within a turn. A
diff link is slashed to the blob anchor it is measured against, so the pair
shows what the diff is a diff of:

```
- <path> ([new](…/blob/<branch>/<path>), [main](…/blob/main/<path>)/[diff](…/commit/<sha>))
```

| File state | Links | Over several branch commits |
| --- | --- | --- |
| Changed | `[new], [main]/[diff]` | `[new]/[diff], [main]/[diff]` |
| New | `[new]` | `[new]/[diff]` |
| Deleted | `[main]/[diff]` | unchanged |

`[new]` is `blob/<branch>/<path>` and `[main]` is `blob/main/<path>`.
`[main]/[diff]` is the net change against main, the reviewer's diff and the
only one most rows need; `[new]/[diff]` is the file's on-branch history.

For `[diff]` itself: where exactly one branch commit touched the file, that
commit is the against-main diff (`git log main..HEAD -1 --format=%h -- <path>`).
Where several did, the true diff is
`compare/main...<branch>#diff-<sha256(path)>`, whose anchor scrolls unreliably,
so the newest commit is an acceptable fallback.

Add `#L120` or `#L120-L145` when a specific region is the point, and an
indented `renders on: [<consumer>](…)` line under a shared component.

Where rows cluster by an owner (a folder, a branch, an author), group them:
one bold or header line per group, members below it, which reads better on a
narrow screen than packing several into one wide cell. The `tasks` skill
applies the same move to tracker tasks grouped by branch.

The slash-joined pair is a **chat** shape. The GitHub MCP write path measures
the two links as one span and kills the pair (see Syncing a guide PR body); a
body never carries this list anyway, so the two rules do not collide.

## Topical captions

When the request names a subject rather than the session's changes ("caption
the portable docs"), select by enumerating the topic, not by git diff. An
unchanged file gets one link, the main blob, since the triple encodes change
state and the other two would be noise:

```
- <path> ([main](…/blob/main/<path>))
```

A changed file caught in a topical caption keeps the full triple.

## The branch line's authored layer

The caption's judgment can ride the branch page instead of being re-typed per
turn. `build-branch-review.mjs` (bundled beside this file) serializes it as a
**branch-review/1 surface**, the authored envelope `pages/branch.html` renders
over its live derived layer. This is the decided format; the plain branch-brief
shape stays accepted by the page's reader only as a hand-authoring convenience.

Write the judgment (the part no API can derive) to a notes file, then:

```
node .claude/skills/caption/build-branch-review.mjs --notes notes.json --link
```

`notes.json`: `{ "intent": "...", "open": ["..."], "omitted": ["..."],
"files": { "<path>": "one-line why" }, "notes": "..." }`. The script derives the
rest from git, validates against both schemas (an invalid surface is an error,
not an artifact), and `--link` prints the 🌿 address with the surface gzipped
into the fragment. Emit it at guide-PR sync or wrap-up; the derived layer stays
live either way, and the envelope only ever adds. Gated by
`tools/test/branch-review-emit.test.mjs`.

**The `&gz=` link is for chat, never for a PR body or a comment.** The payload runs
into the hundreds of characters, so the write path below defangs it, and the
fragment never reaches a server: a defanged link here is lost content rather
than an inconvenient one. For a durable home, write the surface to a file,
commit it, and name it instead of embedding it:

```
node .claude/skills/caption/build-branch-review.mjs --notes notes.json --out <path>
🌿 …/pages/branch.html#gh=<owner>/<repo>@<branch>&base=main&src=<owner>/<repo>@<branch>:<path>
```

## The recap form

The recap wraps the caption in a fixed-form re-entry summary, one screen. The
fixed form is the point: every recap reads the same way, so the user can scan
by section.

1. **Goal:** one sentence: what this session set out to do and why.
2. **Decisions:** the choices settled so far, one line each, in the order they
   were made. State the decision, not the deliberation.
3. **State:** the closer: branch anchor, the 🌿 line with its counts, render
   lines, PRs and tracker tasks touched, the 🧭 tail. Enumerate only at the
   `files` size.
4. **Open:** questions raised but not settled, one line each.
5. **Next:** the immediate next actions, in order.

Plain, dry register. A recap introduces nothing new, so no proposals and no
analysis, and an empty section is written "none" rather than omitted, so the
form stays fixed.

## Syncing a guide PR body

The managed region is delimited by the markdown link labels `[//]: # (guide)` …
`[//]: # (/guide)`. To sync after a push: regenerate the region (⭐ Look line,
change-set paragraph, Next steps / open threads, Notes / Risk), rewrite only
that region via `update_pull_request`, and leave everything outside the
delimiters untouched. Narrative goes in PR comments, not the body. The body
does not enumerate files; SURFACING.md's "The body does not enumerate files"
owns that rule and the shape the body carries instead.

**Read both delimiters, write only the link-label one.** Bodies written before
2026-07-28 carry `<!-- guide -->` … `<!-- /guide -->`. Reading a body back
through the GitHub MCP strips HTML comments, so the older markers are invisible
to the very step that needs them, and a sync that cannot find its region
appends a second one or overwrites hand-written prose. If neither pair is
present, stop and say so rather than guessing at the boundary. Link labels are
reference definitions, so keep each on its own line with blank lines around it.

**Count every URL before writing it to a body or a comment.** At 150 characters
or more the write path stores it as literal text; SURFACING.md carries the
shortening ladder. The slash-joined pair is the trap, because `)/[` does not
end the URL token: two clean 70-character links make one 149-character span,
and one more character kills it. Comma-joining ends the run. Check before
writing:

```
python3 scripts/mcp-link-safe.py --check body.md
```

Add `--unescape-entities` when checking a body read back through the MCP, whose
readback expands `&` into `&amp;` and inflates the count.
