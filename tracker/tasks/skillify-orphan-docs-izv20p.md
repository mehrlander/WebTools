---
id: skillify-orphan-docs-izv20p
title: Assess the orphan docs for skillification, and boil them down
status: backlog
opened: 2026-07-30
next: split the 17 orphans by cause before converting anything; only 2 or 3 are the condition this task was filed about
---
# Assess the orphan docs for skillification, and boil them down

`docs/` holds 32 markdown files. Two of them (`CONVENTIONS.md`, `SURFACING.md`)
are injected every session. The other 30 are fetch-on-demand, and most are
unreachable in practice.

Measured 2026-07-30:

| | files | words | reachable how |
| --- | --- | --- | --- |
| always loaded | 2 | 3,862 | injected every session |
| owned by a skill | 8 | 32,659 | a skill names the file, so invoking it pulls the doc |
| orphan | 22 | 26,244 | only if the session already knows it exists |

**Stale 2026-08-05 → `docs/docs.json`:** these counts were a hand measurement
carried in a task file, which is exactly the drift PR #352 removed. `reach` is
now a derived field, recomputed by `tools/build/docs-reach.mjs` on every test
run, and the Docs tab filters to orphans in one tap. Read the count there, not
here. As of that PR: 2 injected, 12 project, 8 skill, 3 app, 17 orphan.

A skill carries a `description` in frontmatter, which is the trigger surface the
harness reads at session start. **None of the 30 docs carries frontmatter.** They
have no description and no trigger, so they load only when something already
knows to fetch them. Being catalogued in `PORTABLE.md` does not fix this and is
the same problem one level up: a session has to read the manifest first.

## Why this is worth doing

One session missed two of these docs in a single sitting and paid for both. It
read a shallow clone as a rewritten history (`environment/container.md` records
the shallow flag) and read an MCP routing quirk as a permission wall
(`github/mcp-server-routing.md` gives the rule). Neither doc was wrong or
buried in verbosity. Nothing put either in front of the session, and it did not
go looking.

The orphan set clusters rather than scattering. Three directories have zero skill
coverage and are 61% of the orphan mass: `environment/` (5 files, 8,611 words),
`envelopes/` (5 files, 4,924), `github/` (5 files, 2,578). Meanwhile
`show-repo.md` alone is 13,937 words, 43% of everything a skill can reach. Big
feature documents got owners; small trap notes did not.

## Scope

- **The duplicated MCP material first**, since it proves the general case. The
  same trap is written twice: `github/mcp-server-routing.md` (2026-07-15) and
  `environment/capabilities.md` under "MCP: two servers can share a tool name"
  (2026-07-29). Across 3,597 words the operative rule is three sentences. Collapse
  to one owner and keep one dated record.
- **Assess each orphan against the operating-knowledge test.** A doc a session
  must act on is a skill; a doc consulted deliberately when already doing the
  work is reference and can stay a doc. `envelopes/` looks like the second kind
  (contracts read when building an envelope), so it is lower priority than
  `environment/` and `github/`.
- **Decide what happens to the source after conversion.** The evidence in these
  docs has value the skill does not carry: dated measurements, the
  documented-versus-observed discipline, the worked examples. Retire, trim, or
  keep as the record behind the skill, decided per doc rather than as a policy.
- **Look at the two largest orphans on their own terms.** `pdf-structure.md`
  (4,003) and `loader.md` (3,908) have no owner, and `pdf-structure.md` is not in
  `PORTABLE.md` either. That is the profile of something finished or dead rather
  than something needing a trigger.
- **Do not add prose.** The point is fewer words that are reachable, not more
  words about the words. A conversion that grows the total has failed.

## Definition of done

Every orphan is classified as skill, reference, or retired, with the ones that
became skills carrying a trigger written to the situation rather than the
material. The total word count across `docs/` and the new skills is lower than
26,244 plus the current owned set. `npm test` green.

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
