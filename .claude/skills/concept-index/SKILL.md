---
name: concept-index
description: >-
  Build a repo's declared vocabulary and check a piece of writing against it:
  which repo files it names without a link, and which terms of art it uses as
  though the reader already knows them. Use when the user asks what a reply
  assumed, says "get out of the weeds", asks for a glossary or entity list for a
  repo or a session, wants to know which terms are used but never defined, or
  invokes /concept-index.
---

# Concept index

Two commands over one artifact. `index` reads a repo's prose and writes the
vocabulary it declares. `check` reads a piece of writing and reports what it
named without giving the reader a handle.

The index is cheap enough to build on demand (1.7s over web-tools, 20s over a
1000-file repo), so it is **not committed and there is no workflow**. Build it,
use it, let it go.

```bash
V=.claude/skills/concept-index/vocab.py          # or $CLAUDE_PLUGIN_ROOT/...

python3 $V index . --output /tmp/vocab.json \
  --hub docs/CONVENTIONS.md --hub docs/SURFACING.md --hub CLAUDE.md \
  --exclude skills/

python3 $V check --index /tmp/vocab.json --repo mehrlander/web-tools < reply.md
```

`--hub` takes the **exact repo-relative path** of a governing doc, repeatable.
`--exclude` drops a path prefix from the corpus; use it for a vendored library
whose vocabulary is not this repo's.

## Tiers

A term's tier comes from how the repo declares it, not from how often it appears.

| Tier | Means | Use |
| --- | --- | --- |
| `canonical` | declared in a hub doc | the working vocabulary; what `check` flags by default |
| `local` | declared anywhere, reused across files | a fuller glossary |
| `assumed` | never declared, but referenced as though it were | the risk list: "the X" with no X anywhere |
| `template` | in over 30% of files | frontmatter and template field names, not terms of art |

`assumed` is the one worth reading directly. It is where a term catches on and
starts doing work nobody defined, which is what got `spine`, `backbone`, and
`weld` retired in `mehrlander/home`.

## Why declaration and not statistics

Two statistical rankings were measured against a hand-written target set and
both failed the same way. Context entropy (PR #336) and in-repo TF-IDF each
reward *rare* vocabulary, and a repo's terms of art are its *shared* vocabulary,
spread across files by definition. Under entropy the top of the list was
`asked`, `grounds`, `whole point`; under IDF it was `qpdf`, `textarea`, `docx`
from unrelated bundled skills. Nothing distributional separates "workstream"
from "page": the difference is that the repo defines one of them. So declaration
is ground truth and frequency is only a tiebreak.

## What `check` reports, and what it deliberately does not

Two findings, in confidence order:

1. **Repo files named without a link.** A path-shaped token that resolves to a
   real tracked file and sits outside any `[](…)`. Decidable, so it leads.
2. **Declared terms used without a handle.** A handle is a link, a code span, or
   an immediate parenthetical that *names the term*. Something merely nearby
   does not count: on `docs/SURFACING.md` a 200-character window contains some
   link for 9 of 9 mentions of "toss", so the loose test can never say anything.

Fenced code blocks are stripped before checking, since a block quoting a tool's
output is a demonstration and not prose. Measured on one reply, 7 of 12 flags
came from a single code block before this was fixed.

A single ordinary word is flagged only when used referentially ("the stage
link", not "bare paths"), because nothing here can separate a repurposed common
word from its plain sense without a lexicon. Expect one to three flags on a
dense reply; a run with none is a normal result, not a broken tool.

## Interpretation

The output is evidence, not a verdict. A term can be canonical, used bare, and
perfectly clear in context. Read the passage before changing anything.
