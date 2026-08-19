---
name: show-repo
description: >-
  Use show-repo, the hosted shell that browses any GitHub repo and moves
  files between repos: mint a browse link, mint a stage link (the 🗂️
  #stage= fileset transport), author a repo's .web-tools.json manifest
  (landing, pins, stage.files, stage.targets), or run a cross-repo file
  transfer. Loads docs/show-repo.md from mehrlander/web-tools. Use when the
  user says "show-repo", "the stage", "stage these files", "make a stage
  link", "browse repo X", "send/copy files to another repo", "cross-repo
  transfer", "set up .web-tools.json", or "the show-repo manifest".
---

# show-repo loader

show-repo is one hosted page that browses **any** repo and moves files
**between** repos. It is the cross-repo instrument: a session hands the user a
link into it, or configures a repo so the shell presents it well. The canonical
reference is `docs/show-repo.md` in the public repo `mehrlander/web-tools`; this
skill fetches it fresh so any session in any repo has the current mechanics.

Rendering a page is a different job (`toss-render`); publishing a self-contained
snapshot is a third (artifacts). show-repo *shows and moves* files. The three
markers: 🗂️ a stage link, 🥏 a toss, 📦 an artifact.

## What it enables (before you fetch)

- **Browse link:** `…/app/?repo=owner/repo[&ref=…][&view=files&path=<dir>]`. Public repos need no auth; private repos and branches need the viewer's stored token.
- **Stage link 🗂️:** `…/app/#stage=owner/repo[@ref]:path1,path2;owner2/repo2:path3`, a cross-repo fileset for view, concatenated-bundle copy/download, two-tap transfer into another repo, or a review diff. Refs are pointers (content stays behind the viewer's token); optional `&prompts=<base64url>` (a `{label, ask}` review-prompt list) and `&mode=diff` (open the preview on that diff, run on open) are authored, so they ride the link, and the `?query` too (`StageLink.read`) for a fragment-stripping context.
- **Manifest:** a repo's root `.web-tools.json` (the repo's web-tools config; `landing`, `pins`, `stage.files`, `stage.targets`) configures how the shell presents it.

## The honesty caveat (state it on every stage handoff)

A stage link is **token-gated**, exactly like toss-render's `#gh=`: it works
only for the token owner in a token-bearing browser. The Claude app's in-app
browser keeps its own storage, so the token is not guaranteed there (historically
absent, but it can be entered, after which the link works); treat it as possibly
token-less. The token-less `#gz=`-style bundle form is contemplated, not built.
For a reader you can't count on having a token, download the stage's concatenated
bundle and `SendUserFile` it instead of sending a link.

## Fetch (primary path)

```bash
curl -fsSL https://raw.githubusercontent.com/mehrlander/web-tools/main/docs/show-repo.md
```

For stage work (the bench, the preview and its diff, save-as-surface, the
`#stage=` grammar), fetch the stage's own reference the same way:

```bash
curl -fsSL https://raw.githubusercontent.com/mehrlander/web-tools/main/docs/stage.md
```

`raw.githubusercontent.com` is on the Claude Code web sandbox allowlist, and the
repo is public, so this needs no auth. In `mehrlander/web-tools` itself the files
are local; read `docs/show-repo.md` and `docs/stage.md` directly.

## Fallbacks

If `curl` to `raw.githubusercontent.com` is denied (restrictive network policy),
in order:

1. **GitHub MCP:** add `mehrlander/web-tools` to the session scope if needed
   (`mcp__claude-code-remote__list_repos`, then `add_repo`), then
   `mcp__github__get_file_contents` with owner `mehrlander`, repo `web-tools`,
   path `docs/show-repo.md`.
2. **WebFetch** on the same raw URL.

## Relationship to the conventions

The `#stage=` link is also a surfacing primitive in `docs/SURFACING.md`
("Stage a fileset 🗂️"), loaded by the `web-tools` skill. The
convention carries the marker and the honesty gate; this skill and `show-repo.md`
carry the full instrument (browse, transfer, manifest schema). Load the
conventions for handoff rules; load this for how the shell works.

## Installing this skill into another repo

From a session in the target repo:

```bash
mkdir -p .claude/skills/show-repo
curl -fsSL https://raw.githubusercontent.com/mehrlander/web-tools/main/.claude/skills/show-repo/SKILL.md \
  -o .claude/skills/show-repo/SKILL.md
```

Then commit and push. Skills register at session start, so the skill becomes
invocable in sessions started from a branch that contains it. `mehrlander/web-tools`
holds the canonical copy of both this skill and `show-repo.md`; the reference is
fetched live, so target repos re-run the installer only when the *skill itself*
changes. **Fetch is not invoke:** installing the file makes the skill available,
not run; it governs a session only when actually invoked (model judgement,
`/show-repo`, or an always-on CLAUDE.md line).
