---
name: concept-index
description: Build or refresh a lightweight semantic index of repository prose, and install the optional GitHub Actions workflow that keeps it current.
---

# Concept index

Use this skill when a session needs to inspect project vocabulary, find potentially overloaded terms, or install/update the repository workflow that refreshes the index.

## Commands

Run from the repository root:

```bash
python "$CLAUDE_PLUGIN_ROOT/.claude/skills/concept-index/index_repo.py"
python "$CLAUDE_PLUGIN_ROOT/.claude/skills/concept-index/install_workflow.py"
```

The indexer scans Markdown and text files, excludes generated and dependency directories, and writes `.concept-index/index.json`.

The installer writes `.github/workflows/concept-index.yml`. It is explicit: do not install or update repository automation unless the user asks. The installed workflow may run manually or when prose on `main` changes. It downloads the current public analyzer from `mehrlander/web-tools`, builds the index, and commits only a changed index.

## Interpretation

The output is evidence, not a verdict. High `context_dispersion` means a term appears in varied lexical neighborhoods; `referential_uses` counts phrases such as “the spine” that present a term as already established; `grounded_uses` counts nearby definitions, links, code spans, or paths. A term may be important and well used, or overloaded and underexplained. Read the passages before changing vocabulary.
