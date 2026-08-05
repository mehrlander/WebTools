---
name: file-retrieval
description: >-
  Retrieve files from a configured corpus through a fixed-behavior tool
  instead of improvised grep/Read. Two commands: corpus_search.py (find hits
  with ranked snippets in a fixed schema) and read_doc.py (read one document
  whole). Use when the user says "find the files about X", "search the
  repo/docs/corpus for Y", "look for", "bring back the relevant files", "where
  do we cover Z", "dig up", or otherwise wants documents located and handed
  back. The tool carries the ranking, snippet window, stop condition, and
  broaden-on-miss rule, so retrieval is one auditable command that reads the
  same every run.
---

# file-retrieval

One job: "I'm looking for such and such, bring back the relevant files." Do it
through the tool, not through improvised `grep`/`Read`. The tool fixes the
choices raw search leaves open each run (which glob, how much context, when to
stop, how to rank, when to broaden), so a run is one command with a fixed,
diffable output schema.

Both scripts live beside this file. Paths below assume you invoke them from the
repo; they resolve the corpus root at the git root by default.

## The two commands

**Find** — `corpus_search.py <pattern>`:

```
[<source>] <path-or-id>  <title>  (<n> matches)
    L<line>: ...snippet with the match in context...
    ... N more
```

then a final `N documents matched` line. Hits are ranked most-matches-first,
then by path. Real run:

```
$ python3 .claude/skills/file-retrieval/corpus_search.py "toss-render" --max 6
[docs] docs/showing.md  Showing: which link shows what  (12 matches)
    L44: ...the toss-render address mode reaches a branch page that github.io cannot...
    ... 9 more
[tracker] tracker/tasks/0003.md  Singleton fab with toss-render integration  (8 matches)
    L3: --- id: 0003 title: Singleton fab with toss-render integration status...
    ... 5 more

16 documents matched, showing 6
(stopped at --max=6; results are not exhaustive)
```

Flags: `--regex` (pattern instead of substring), `--case` (case-sensitive;
default is insensitive), `--max N` (stop after N docs, default 100, prints the
"not exhaustive" note when it caps), `--meta-only` (one line per hit, no
snippets), `--source NAME` (restrict to one named source, repeatable),
`--since` / `--until` (date filter for extractors that carry a date; inert for
the file-per-document default, which carries none, so nothing is dropped).

**Read** — `read_doc.py <path-or-id>`: a header (title, path, size) then the
whole body; `--meta` prints just the one-line summary. Use it to open a hit,
never to dump a whole container.

## The flow, fixed

1. **Search through the tool, always.** Never improvise `grep`. Pick a pattern,
   optionally a `--source`, run `corpus_search.py`.
2. **Present results in the schema above.** Do not reshape or re-rank the tool's
   output; hand it back as printed, then read the top hits with `read_doc.py`.
3. **Cheap pass before full text.** Start with `--meta-only` (or a single
   `--source`) to see the shape of the hit set before pulling snippets or bodies.
   If a semantic/title index is added later (phase 3), that is the cheaper pass;
   use it first.
4. **One document at a time.** Open hits with `read_doc.py`, one at a time. Never
   load a large container file into context whole.
5. **A miss in a narrow pass is not absence.** If a scoped run returns nothing,
   broaden before concluding: drop `--source`, drop `--case`, try `--regex` or a
   synonym, widen `--max`. Absence is only credible after the broad pass.
6. **Log the search.** For a user-requested retrieval, append one dated line to
   `searches/<subject>.md` (beside this file): the query, flags, and hit count,
   so past retrievals are a durable record. Format and durability note in
   [`searches/README.md`](searches/README.md).

## Configuration

`sources.toml` (beside this file) lists named sources, each a set of path globs
resolved against the corpus root. Anchor every glob to a real directory; a bare
`**/*.md` would recurse `node_modules/`. Edit it to point at a different corpus.

## What is fixed in the tool vs left to you

Fixed in `corpus_search.py`: the ~90-char snippet window, whitespace collapse,
up to 3 snippets then `... N more`, most-matches-first ranking, the `--max` stop
with its non-exhaustive note, and the output schema. Left to you: the pattern,
and maybe a `--source` or `--regex`. That split is the point: the tool is the
consistency, so a smaller model retrieves the same way every run.

## Extending: the units seam

A "document" is produced by an extractor. The one built-in, **file-per-document**
(`file_per_document` in `corpus_search.py`), treats a file as a document, its
title the first heading or filename. That covers any markdown/text/code repo.
A packed container (NDJSON, JSON array, mbox, SQLite) is a later phase: one more
extractor with the same output shape, and its renderer added to `read_doc.py`.
Do not reach for a container extractor until the corpus actually stores content
that way.
