---
name: content-registry
description: Operate a repo's epistemic content registry (data/design/content.csv): classify what each artifact is (supplied, mechanical, human-, model-, or hybrid-authored) and which corpora it belongs to, scaffold draft rows, verify locators, and extract corpora. Use when the user asks to classify repo content, set up or check a content registry, decide what a corpus should include or exclude, distinguish supplied source material from authored analysis, or mentions content.csv, creation_mode, or analysis_use.
---

# Content registry

A repo declares, in a small curated `data/design/content.csv`, the
epistemic origin of its textual artifacts (`creation_mode`) and their
corpus membership (`analysis_use`). Tools consult the declaration first
and fall back to heuristics for undeclared content: the registry is
authoritative for what it covers and owes the repo no inventory.
Columns: `locator, creation_mode, analysis_use, description`.

## Commands

Run from anywhere; pass the repo root:

```bash
python3 "$CLAUDE_PLUGIN_ROOT/content-registry/registry.py" scaffold <root>   # draft rows, judgment TODO
python3 "$CLAUDE_PLUGIN_ROOT/content-registry/registry.py" verify <root>     # advisory findings
python3 "$CLAUDE_PLUGIN_ROOT/content-registry/registry.py" corpus <root> concept-vocabulary --list
```

## Controlled vocabularies (validate hard; everything else is optional)

- `creation_mode`: `supplied` (external source material) | `mechanical`
  (deterministic transformation) | `human-authored` | `model-authored` |
  `hybrid-authored` | `mixed` (separable kinds not yet isolated)
- `analysis_use`: `concept-vocabulary` | `prose-review` |
  `semantic-search` | `source-corpus` | `exclude`

## Authoring rules

1. **Scaffold observes; you judge.** `scaffold` emits mechanical facts
   with `TODO` in both controlling fields. Fill them row by row from
   evidence (git history, READMEs, the user); never infer human vs model
   authorship from style alone. When unsure, use `mixed` or ask.
2. **File-level by default.** A trailing `/` declares a subtree; the most
   specific declaration wins (fragment > file > longer prefix). Prefer a
   handful of subtree rows plus targeted file rows over an inventory.
3. **Fragments only for genuinely mixed files** that cannot be
   restructured: `#heading=<slug>` (Markdown), `#column=<name>` (CSV),
   `#html-id=<id>` (HTML). Measured caveat: a Markdown heading region
   includes its subsections, so a preamble above quoted material cannot
   be isolated by heading; restructure instead.
4. **Verification is advisory.** Run `verify` after edits and at renames;
   report findings, do not block on them.
5. **Consumers.** the private estate's `local-models/instruments/concept-lab/termlab.py` and
   `semsearch.py` read the registry when present: `exclude` drops a
   file, `analysis_use` decides whether content counts as the repo's
   authored voice, undeclared content falls back to heuristics.

The staged design (deferred provenance relations, generated inventory,
comparison layer) follows the Epistemic Content and Provenance Registry
ADR; build later layers only when their operational need appears.
