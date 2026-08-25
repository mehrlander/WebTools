---
id: skillify-orphan-docs-izv20p
title: Route the orphan docs by cause, per the 2026-08-05 classification
status: done
closed: 2026-08-16
session: claude/web-tools-docs-assessment-dc9bqv
opened: 2026-07-30
size: S
---
# Route the orphan docs by cause, per the 2026-08-05 classification

Filed as "assess the orphan docs for skillification"; the assessment happened
(2026-08-05 log entry below) and disproved the framing. Orphan is four
conditions, not one, and only two docs carry genuinely unreached operating
knowledge. No new skill is needed. The remaining work is routing, one move per
class:

- **Comment-bound pointers (6 docs).** `pdf-structure.md`,
  `envelopes/chat-results.md`, `envelopes/shorter.md`, `envelopes/surface.md`
  and its two schema profiles have owners that name them only from code
  comments or a tracker task. Move each pointer to where a reader travels (the
  owning doc's prose, or `docs/docs.json` context the Docs tab shows). Cheapest
  class, no skill involved.
- **`github/github-surfacing.md`.** Its added-repo section (a repo added
  mid-session has no create-PR button and must be handed a compare URL) is
  `sandbox-traps` material; fold it in.
- **`github/post-merge-branch-mutation.md`.** The argument behind a rule
  SURFACING.md already injects; link it from that rule rather than giving it a
  trigger.
- **Leave the rest.** The terminal records and the folder front doors are
  correctly unreached; giving them a channel would be the defect.

Open question for the derivation, not this task: whether a link from an
injected doc should count as a channel in `docs-reach.mjs`.

## Definition of done

Each of the eight docs above is reachable by the route named for its class (or
its class is explicitly re-argued in the log), and the orphan count in the Docs
tab drops accordingly. No net new prose. `npm test` green.

## Progress log
- 2026-07-30 filed at the user's request while wrapping up the appendix work
  (PR #324). One conversion already shipped as the worked example:
  `.claude/skills/sandbox-traps/`, which took the operative core of
  `environment/` and `github/` into a 601-word body with a 78-word trigger,
  against 11,189 words of source. Its source docs were deliberately left in
  place, because the claim that a skill replaces them is untested until it
  catches a real failure. Whether it does is the first input to this task.
- 2026-08-05 the first scope item is done, not by this task: PR #352 collapsed
  the duplicated MCP material to one owner (`environment/capabilities.md`) and
  left `github/mcp-server-routing.md` as an annotated record. The reading also
  settled the `loader.md` question the other way: 36 page files use `gh.load`,
  so it is load-bearing rather than finished, and CLAUDE.md now names it. That
  leaves `pdf-structure.md` as the only large orphan still to be read on its
  own terms.
- 2026-08-05 read the 17 against the operating-knowledge test. **Orphan is
  four conditions, not one, and the task treats it as one.** Sorted by cause:
  - **Correctly terminal (2).** `github/mcp-server-routing.md` (`status:
    record`) and `favicons/README.md`'s retired half. A superseded record
    should be unreachable; giving it a channel would be the defect.
  - **Orphan by construction (3).** The folder front doors:
    `github/README.md`, `environment/README.md`, `envelopes/README.md`.
    Nothing links a folder README because the generated `docs/README.md`
    indexes the files directly. Their reach is their folder's reach, and the
    derivation has no way to say so.
  - **Owner exists but points from a comment (6).** `pdf-structure.md`
    (`lib/kits/pdf.js`), `envelopes/chat-results.md`
    (`pages/chat-results.html`), `envelopes/shorter.md`
    (`pages/shorter.html`), plus `envelopes/surface.md` and its two schema
    profiles, named only by a tracker task. `docs-reach.mjs` strips comments
    on purpose and that is right, but the consequence is that these docs are
    not unowned: the pointer just sits where no reader travels. Cheapest
    class to fix and it needs no skill.
  - **Genuinely unreached operating knowledge (2).**
    `github/github-surfacing.md`, whose added-repo section is the only
    statement that a repo added mid-session has no create-PR button and must
    be handed a compare URL; and `github/post-merge-branch-mutation.md`,
    which is the argument behind a rule SURFACING.md already injects. The
    first is `sandbox-traps` material. The second wants a link from the rule
    it explains, not a trigger of its own.

  So `docs/github/` at 5 of 5 is a real signal about the folder and a
  misleading one about the work: one record, one front door, one reference
  gallery, and two that carry something a session would act on. The
  conversion this task was filed to do is two docs' worth, and neither is a
  new skill.

  One limit worth carrying: a link from an injected doc is not counted as a
  channel, so `SURFACING.md` could name `github-surfacing.md` today and the
  field would still read orphan. That is arguably the strongest channel there
  is. Whether to count it is a question for the derivation, not for this task.
- 2026-08-07: refined per the 2026-08-07 assessment (reframe). The 2026-08-05
  investigation had already replaced the filing premise; the body now leads
  with the residual routing work instead of the disproved skillification
  framing, the original measurement tables having been superseded by the
  derived `reach` field they cited. Dropped the stale `next:` tag.
- 2026-08-16 done on `claude/web-tools-docs-assessment-dc9bqv`; lands via PR
  #437's branch (commit e6c3ac0). Every class routed by its named move:
  pdf-structure.md, surface.md, chat-results.md, and
  post-merge-branch-mutation.md are now named from SURFACING.md (project
  reach); shorter.html and chat-results.html link their contracts from their
  own headers (app reach); sandbox-traps absorbed the added-repo compare-URL
  insight and names github-surfacing.md (skill reach). Orphans 20 -> 14 files,
  15% -> 8% of the folder's words. The two schema profiles stay orphan,
  re-arguing the class per the definition of done: they are surface.md's
  declared siblings, reachable through its prose, and neither is loaded by
  anything, so a channel of their own would be filling rows to satisfy a
  number. The open derivation question (should a link from an injected doc
  count as a channel) was answered in practice: it counts as `project`, and
  the routing above leans on it.
