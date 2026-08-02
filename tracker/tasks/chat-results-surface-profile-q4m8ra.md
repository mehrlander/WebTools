---
id: chat-results-surface-profile-q4m8ra
title: Fold chat-results into the surface schema, or keep it a sibling
status: done
closed: 2026-08-02
session: claude/web-tools-project-tracker-reo5qo
track: independent
opened: 2026-07-22
---
# Fold chat-results into the surface schema, or keep it a sibling

The content-envelope family (`docs/envelopes/`) now has three carriers: surface, chat-results, and the stage. The stage already converged onto the surface schema (a stage item is a surface item's `target.source` triple with annotations empty). Chat-results has not: it remains a separate schema (`results[]`, `facets[]`, `narrative`; `docs/envelopes/chat-results.md`) designed apart from surface v2, though the two share curated items, per-item annotation, `#gz=`/`?src=` delivery, and live-code rendering.

The question: should chat-results become a **surface profile** (`profile: {name: "chat-results", version: 1}`, the way `branch-review/1` is a profile over the same core), or stay a **third sibling schema** that only shares delivery mechanics?

- **Profile route:** one core schema, chat-results expressed as `type: chat` items with a `chat-results` profile constraining `context` (query, provenance) and item fields (excerpts, transcript, source). Unifies the family under one validator and one item grammar; costs a remodel of `pages/chat-results.html`'s reader and the existing `results/*.json` envelopes in chat-histories.
- **Sibling route:** two peer schemas, shared transport only. Keeps chat-results' shape (tuned to search output) untouched; accepts that the family is a delivery convention, not one schema.

Weigh against the reader cost: `pages/chat-results.html` renders the current shape directly, and chat-histories emits it from the search skill. A profile that forced a rewrite of both for tidiness alone would be make-work; the case for it is real only if a concrete need (a mixed surface holding both files and chats, say) wants one item grammar.

Groundwork this builds on: `stage-surface-convergence-kgtosz` (the stage/surface item convergence) and `integrate-stage-surfacer-format-3bvg2v` (the surfacer `.surface` integration). Contract home: `docs/envelopes/README.md`, which states this as the family's open question.

Done means: a decision recorded in `docs/envelopes/README.md` (profile or sibling, with the reasoning), and, if profile, the `chat-results/1` profile schema under `docs/envelopes/schemas/profiles/` plus the reader and emitter migration targets named.

## Progress log
- 2026-07-22: Filed alongside the envelope-family consolidation (web-tools branch `claude/content-envelope-convention-rz6xvz`, which moved the three contracts under `docs/envelopes/`). The consolidation named this open question in the family README; this task carries it so it survives the branch.
- 2026-08-02: Done on `claude/web-tools-project-tracker-reo5qo` (lands via that branch's PR). Decided: sibling. The reasoning is recorded in docs/envelopes/README.md as the task asked: the shapes differ structurally (message arrays, many-to-many facets), the ref triple is already shared, and no concrete mixed-envelope need is asking; the revisit trigger is named there.
