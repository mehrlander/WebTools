---
id: code-layer-taxonomy-q15jp2
title: Name the code layers and account for tools/
status: backlog
opened: 2026-08-04
---
# Name the code layers and account for tools/

The kit discipline did not rot; the taxonomy under it went incomplete. Measured
2026-08-04 (files; named in any doc; named in any test):

| Layer | Files | Documented | Tested |
| --- | --- | --- | --- |
| lib/kits/ | 21 | 20 | 20 |
| lib/ flat | 26 | 24 | 21 |
| lib/alpineComponents/ | 31 | 20 | 19 |
| scripts/ | 6 | 6 | 2 |
| tools/ (non-test) | 57 | 14 | 7 |

Two named boxes exist (kits: portable capability with a demo and lazy deps;
alpineComponents: UI). A third formed silently in flat lib/: show-repo's domain
modules (branch-survey, repo-checks, portable-align, source-peek and siblings),
well-tested but belonging to no stated category, so new logic lands by
gravity rather than by rule. The genuinely weak layer is tools/, where most
files are named nowhere.

Done means: (1) the taxonomy stated once, in one authoritative carrier (likely
a section beside lib/kits/README.md's per-kit table), naming each layer's
admission rule, including the third category; (2) an advisory unclaimed-code
survey in the data-provenance-survey.sh idiom that lists code files no doc
names, so the tools/ gap and future drift are visible rather than remembered
(heuristic, non-blocking); (3) the docs registry's claims table gains the
taxonomy's carrier row if the statement ends up repeated anywhere.

Context that would otherwise need rebuilding: the measurement method and the
finding live in PR #350's session (the documentation-registry work); the
registry itself (docs/docs.json) is the precedent for how the statement should
be shaped: one owner, gated copies, unchecked declared honestly.

## Progress log
- 2026-08-04: Filed from the docs-registry session at the user's request; measurements above are from that session's survey.
