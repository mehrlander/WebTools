---
id: agent-file-retrieval-skill-c5u2jy
title: Build an agent-assisted file-retrieval skill
status: done
project: search-skill
opened: 2026-07-14
closed: 2026-07-15
session: claude/agent-file-retrieval-skill-tv4can
---
# Build an agent-assisted file-retrieval skill

Build a skill that does one thing: "I'm looking for such and such, bring back the relevant
files." Retrieval driven by a small tool with fixed behavior, not improvised `grep`/`Read`.
The design below is inspired by a chat-archive search skill but is meant to stand on its
own; build it fresh against this repo's content.

## Why a tool and not just the built-ins

A strong model can already retrieve with `Grep`/`Read`. The tool earns its place for two
reasons the built-ins do not serve:

- **Small-model consistency.** Raw search forces a chain of choices each run (which glob,
  how much context, when to stop, how to rank, when to broaden). A tool with fixed flags
  collapses that to "pick a pattern and maybe a filter." The tool carries the ranking,
  snippet window, stop condition, and fall-through rule. The tool is the consistency.
- **Legibility and consistent output.** A tool run is one auditable command with a fixed
  output schema, rerunnable and diffable. Improvised search is opaque and varies run to
  run.

## Design

Two commands plus a thin skill.

### corpus_search.py (find)

Scans the configured corpus and prints one hit per document with match snippets. Behavior
to fix in the tool, not leave to the caller:

- **Case-insensitive substring by default**; `--regex` for a pattern, `--case` for
  case-sensitive.
- **Snippet window** of roughly 90 characters on each side of a match, newlines and runs
  of whitespace collapsed, leading/trailing ellipses when clipped.
- **Up to 3 snippets per document**, then a `... N more` line if there are more matches.
- **Stop condition**: `--max` (default 100) documents, with an explicit "stopped at --max"
  note so a truncated run never reads as exhaustive.
- **Output schema**, one block per hit:

  ```
  [<source>] <path-or-id>  <title>  (<n> matches)
      <label>: ...snippet with the match in context...
      ... 2 more
  ```

  End with a final `N documents matched` line. `--meta-only` drops the snippets and prints
  one line per hit.

- **Sources** come from a small `sources.toml`: a list of directories or globs to search,
  so the tool is not hardcoded to one layout.
- **Units seam**: a document is produced by a pluggable "how to turn a source into
  searchable units" function. Ship one built-in, **file-per-document**: a unit is a file,
  its title is the first heading or the filename, no parsing needed. This is the default
  and covers any markdown/text/code repo out of the box.
- Optional filters where the corpus supports them: `--since` / `--until` on a document date
  if documents carry one; skip if they do not.

### read_doc.py (read)

Renders one document by path or id: a header (title, path, size) then the body, plus a
`--meta` one-liner. For the file-per-document default this is a thin wrapper over reading
the file; its value is a uniform "read" verb the model learns once and reuses. It becomes
the place per-format renderers live if the corpus later holds packed containers.

### SKILL.md

Names the exact two commands and fixes the flow, which is where small-model consistency
actually lands:

- Always go through the tool; never improvise `grep`.
- Present results in the fixed shape above.
- Carry four disciplines: prefer a cheap index pass before full text when one exists;
  never load a large container file into context, go one document at a time; a miss in a
  narrow pass is not absence, broaden and retry; log every user-requested search to a
  durable, appendable directory (one file per subject) so past retrievals are a record.

## Phasing

1. Build the core plus the file-per-document extractor plus the skill. Covers this repo and
   most content-heavy repos. Delivers both motivations above.
2. Add container extractors (NDJSON, JSON array, mbox, SQLite) one per format, only if this
   repo actually stores content that way. Each is one function against the units seam.
3. Optional: add a cheap semantic layer (a title/tags/summary index searched before full
   text) for a corpus large enough that scanning full text every time is too slow.

The cost shape is an inverted pyramid: the file-per-document path needs little code; cost
appears only per container format in phase 2.

## Progress log
- 2026-07-14: drafted for hand-off; not yet claimed
- 2026-07-15: Claimed on branch claude/agent-file-retrieval-skill-tv4can. Building the file-per-document phase-1 core (corpus_search.py, read_doc.py, sources.toml, SKILL.md) as a self-contained skill.
- 2026-07-18: Closed. Delivered via PR #218 (merged 2026-07-15); status was left in-progress after the merge and is flipped now in a tracker sweep.
