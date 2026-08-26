---
id: surface-schema-commentary-on-stage-hqz0uu
title: Carry commentary on a stage (prompts= link field, seed of a surface schema)
status: done
opened: 2026-07-20
closed: 2026-07-20
session: claude/web-tools-diff-review-s0nrq7
---
# Carry commentary on a stage (prompts= link field, seed of a surface schema)

The stage's Diff lens ships a fixed panel of six general review prompts (`DIFF_PROMPTS` in `lib/alpineComponents/stage.js`). Document-specific prompts do not ride the `#stage=` link yet: the `edit-review` skill hands them over as plain chat text alongside the link. Close that gap by letting the stage carry authored commentary, and shape it so it is the first instance of a richer "surface" object rather than a one-off param.

The framing settled in the PR #257 review discussion:

- **One object, several carriers.** A surface is one shape written into more than one carrier, each with its own lifecycle: the `#stage=` link (ephemeral, one-off), the `.web-tools.json` `stage` block (the repo's standing/default surface, a singleton per repo), and, later, a standalone surface file (named, durable, ad hoc, and the only carrier that could also hold file content). The ref half already proves this works: `stage.files` and `#stage=` groups share the same `owner/repo[@ref]:path` grammar (`StageLink.parseItem`/`fmtItem`).
- **What travels where.** Refs and short authored commentary are yours to expose, so they ride both the link and the config. File content rides only a file carrier, never the token-gated link. So adding commentary is a symmetric extension of the existing `{refs, targets}` object: add a `commentary` (or `prompts`) field beside `stage.files`/`stage.targets`, and a matching field to the link.

First cut (keep it simple, per the conventions' "a simple thing can be a good start"):

- Add a `prompts=` field to the `#stage=` link grammar (`StageLink.mint`/`parse`), a small list of `{label, ask}` items, URL-encoded with a length budget (a long list bloats the link, so cap it and say so).
- Render those bespoke prompts in the Diff lens's prompt panel alongside the six fixed ones, each still one-click-copying both texts + the diff + that ask.
- Have `StageLink` encode/decode a small explicit `{refs, commentary}` object, so the link is a projection of that object and a future config field or surface file deserializes into the same shape.
- Update the `edit-review` skill to fold bespoke prompts into the link instead of pasting them as separate chat text.

Do not design the full surface-file schema here; that carrier arrives when a concrete need for content transport or richer metadata shows up. This task is the shorthand capability plus the object shape that keeps it from being a dead end.

Done means: an author can mint a `#stage=` link that carries bespoke review prompts, they render in the Diff lens panel and copy correctly, the encoding is a projection of an explicit `{refs, commentary}` object, and the `edit-review` skill uses it. Tests cover the new grammar round-trip and the panel merge.

## Progress log
- 2026-07-20: Filed from the PR #257 review of #256, capturing the "one object, several carriers" framing before it scrolled off. Supersedes the loose "encode bespoke prompts onto the #stage= link" follow-up noted in the #256 PR body and the edit-review skill's Known gaps.
- 2026-07-20: Done on branch claude/web-tools-diff-review-s0nrq7 (PR #257, reaches main on merge). Shipped `prompts=` as a base64url'd JSON `{label, ask}` list on the `#stage=` link, `StageLink` now a `{refs, commentary}` object (`mint`/`parseLink`, bare `parse` unchanged), the Diff lens shows link prompts first (sparkle-marked) and round-trips them through Persistent link, and the edit-review skill + docs/show-repo.md document the grammar. Left for the future schema (not built): the content-carrying surface file and a `.web-tools.json` `stage.commentary` field; the object shape is in place for both.

