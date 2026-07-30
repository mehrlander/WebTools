---
id: skillify-orphan-docs-izv20p
title: Assess the orphan docs for skillification, and boil them down
status: backlog
opened: 2026-07-30
next: start with the duplicated MCP material, which is one rule recorded twice
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
