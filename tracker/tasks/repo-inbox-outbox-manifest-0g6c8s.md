---
id: repo-inbox-outbox-manifest-0g6c8s
title: Repo-designated inbox and outbox in .web-tools.json
status: done
project: repo
track: independent
opened: 2026-07-15
closed: 2026-07-28
session: claude/tracker-status-cjogjn
next: done as a first cut; folder-vs-branch settled as a per-repo choice, both fields wired
---
# Repo-designated inbox and outbox in .web-tools.json

Give a repo a designated deposit location (inbox) and a designated staging
location for material it is making available to be pulled (outbox). This joins
the existing repo-designated manifest configs (`landing`, `pins`, `stage`)
rather than introducing a new mechanism: `inbox` and `outbox` are two more
fields the `.web-tools.json` manifest can declare.

Prerequisite context: inbox follows the "unify the deposit destination" work
(the drop-in and the copy-to-repo share one `owner/repo[@ref]:dir` destination
and one repo-first `@` picker, defaulting to root when empty). That default is
the seam inbox extends: root becomes the fallback, a declared inbox the
preferred default.

## Inbox: where an unaddressed deposit lands

- **Designate, with a soft convention fallback.** A repo declares its inbox in
  `.web-tools.json` (e.g. `inbox: "inbox/"`). A deposit that names no dir uses
  it; a repo that declares none falls back to root. Optionally a convention
  default (`inbox/`) sits between the two, so every conventions-following repo
  has a sane default without hand-declaring one. Decide whether the convention
  default is on by default or opt-in when building.
- **The inbox belongs to the destination repo's manifest.** For a cross-repo
  deposit the inbox is the *receiver's* declared location, so the tool must
  fetch the destination repo's `.web-tools.json`; the stager probes only the
  open repo's manifest today. One extra call keyed to the picked repo, plus a
  404/no-manifest branch.
- **Soft, not auto.** Do not have a background action mint the inbox folder.
  Pre-fill the inbox as the destination and let the existing two-tap commit be
  the consent that creates it, matching how the stage's `send()` already guards
  cross-repo writes.

## Outbox: where a repo stages material to be pulled

The corollary of inbox, not a duplicate: inbox is the receiver's declared
landing spot for an incoming deposit; outbox is a sender's declared staging
spot for material it is making available, for another session, tool, or human
to pull from. Symmetric field shape (`outbox: "outbox/"` or an
`@ref`, see below), same soft/not-auto posture as inbox.

**The public-repo case is the reason this is worth building, not just
symmetry for its own sake.** Every cross-repo handoff mechanism documented so
far (`docs/CONVENTIONS.md`'s 🗂️ stage-a-fileset primitive, the `#stage=` /
`#gh=` forms in `docs/show-repo.md`) is token-gated: it authenticates against
a private repo or branch via the viewer's stored token, and fails outright in
a token-less context (the Claude app's in-app browser, a reader with no
authorized token). `docs/show-repo.md`'s roadmap names the gap directly: "a
content-carrying `#gz=`-style stage bundle for token-less contexts" is
"contemplated but not built." For a **public** repo, an outbox sidesteps that
gap instead of closing it: `raw.githubusercontent.com/owner/repo/<ref>/path`
serves with no auth, on any branch, so a session can push to a public repo's
outbox and hand out a plain raw URL that works for anyone, no bundle, no
token. Private repos still need the artifact/bundle route; this is a
public-repo-specific shortcut, not a replacement for the token-gated forms.

## Open design question: folder or branch, for both

Neither field has to be a directory path. `inbox`/`outbox` could instead name
a **branch** (or `owner/repo@ref` style ref), and there's a real case for
leaning that way for both fields, not just one:

- **Reuses addressing that already exists.** show-repo's whole grammar is
  `owner/repo[@ref]:path`. If inbox/outbox name a ref, `gh-api.js`, the stage
  grammar, and toss-render's `#gh=` all handle it with no new plumbing; a
  folder-only design is a second addressing scheme to build and maintain
  alongside the one already there.
- **Keeps transient bulk off main's permanent history.** An inbox or outbox is
  drop-and-pick-up content by nature, not something anyone treats as part of
  the reviewed codebase. This repo already treats generated/transient content
  that way elsewhere (the board is regenerated not appended-to, thumbnails are
  the one deliberate non-deterministic exception, `dist/` stays gitignored
  except the tracked pre-build). A folder on main means that bulk rides main's
  linear history forever; a dedicated branch can be reset or force-pushed with
  no git-archaeology cost, since nothing treats it as citable history the way
  main is.
- **Cost: discoverability.** A folder shows up in normal repo browsing; a
  branch doesn't unless something points at it. Closable the same way
  `landing`/`pins` already are: the manifest names the ref, and show-repo (or
  a raw-fetch instruction) reads the manifest to find it.

Settle this before building either field; it plausibly changes the field's
shape (a bare path string vs. something that can also carry `@ref`).

## Open decisions (settle when building)

- Folder vs. branch for inbox/outbox (new, above) — likely settled first,
  since it shapes the field format for everything below.
- Convention default on by default, or opt-in (for inbox; decide separately,
  or the same way, for outbox).
- Field name and shape: single `inbox`/`outbox` strings, or nested under the
  existing `stage` block (`stage.inbox`, `stage.outbox`). Originally scoped as
  receive-side only, resisting a send-side field "until a second consumer
  needs it" — the public-repo raw-URL case above is that second consumer, so
  build both together now rather than deferring outbox again.

**Not in scope:** folding a dropped local file into the ref-based stage list as
a first-class item (the deferred PR #219 fold). That is the deeper "one deposit
pipeline" change; this task is only about the default *location(s)*.

## Progress log
- 2026-07-15: Filed (as inbox-only) during the stage-copy UX assessment.
- 2026-07-15: Expanded to inbox + outbox during a chat discussion tying
  together the inbox task, show-repo's staging conventions, and the
  token-gating gap in the cross-repo handoff primitives. Added the
  public-repo raw-URL outbox case and the folder-vs-branch design question for
  both fields. Still backlog; no branch claimed.
- 2026-07-28: done on `claude/tracker-status-cjogjn`, landing via web-tools
  PR #302. **The blocking question is settled**: a box spec is a folder on the
  repo's default branch by default, and can name a ref (`"@drop:incoming"`) or
  another repo (`"owner/repo@ref:dir"`) when a repo wants that. So folder
  versus branch stops being a global design fork and becomes a per-repo choice,
  with the discoverable option as the default. Two reasons for that default,
  both practical rather than aesthetic: a folder is visible in ordinary
  browsing while a branch is invisible unless something points at it, so a
  consumer that forgets the ref reads the default branch and silently finds
  nothing; and writing into a branch presumes the branch exists, which needs
  the Git Data API this lib does not carry, while a folder needs nothing.
  The other open decisions went with it. Fields are top-level `inbox` and
  `outbox`, not nested under `stage`, since a box is a location and not a
  staging concern. There is no convention default: absent means the root, so
  nothing changes for a repo that declares nothing.
  Built: `lib/repo-address.js` owns the grammar and the box parser
  (`RepoAddress.box(config, 'inbox'|'outbox', repo)`), 9 tests. Inbox resolves
  on the send side in `stage.js`, one cached read of the destination repo's
  manifest, with the armed button naming the resolved directory so the second
  tap confirms the redirect rather than hiding it. Outbox is a repo-menu row
  that opens the Files view at the folder, read from the config cache the
  estate already holds. Headless evidence:
  `tools/render/scripts/inbox-demo.mjs`.
  Left for later, and deliberately small: the picker does not pre-fill the
  inbox before the send (resolution happens at send time, which is where the
  destination repo is known), and nothing stages an outbox's contents in one
  tap. Both are affordances on a mechanism that now exists.
