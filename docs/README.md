# docs

<!-- GENERATED from docs/docs.json by tools/build/docs-readme.mjs; do not hand-edit. -->

Reference docs that don't belong at the repo root. This index is generated
from [`docs.json`](docs.json), the documentation registry, which also renders
live in [show-repo's Map view, Docs tab](https://mehrlander.github.io/web-tools/pages/show-repo/show-repo.html?view=map)
alongside the shared-claims table (statements that live in more than one
place, each with its one authoritative carrier and the check that holds each
copy, or the honest absence of one). A **record** preserves a moment and is
corrected by markers, never rewritten; a **measured** doc carries dated
observations and is corrected by re-probing; everything else is living and
must stay correct.

**Reach** (derived by `tools/build/docs-reach.mjs`, gated against the registry):
2 arrive in every session's context, 18 are named by CLAUDE.md,
3 by a skill, 5 by a page or component. The remaining 17 are
marked *(orphan)* below: nothing points at them except this index.

## docs/

- [`README.md`](README.md) — the docs folder's front door: the generated index of this registry
- [`docs.json`](docs.json) — this registry: the documents census and the shared-claims table
- [`harness.json`](harness.json) — the harness census: every tools/ and scripts/ file's role, invocation route, and derived accounting
- [`manifest.json`](manifest.json) — the field registry for root .web-tools.json: every field's type, consumer, and effect
- [`tests.json`](tests.json) — the test registry: every check's kind, what it protects, and its derived counts
- [`CONVENTIONS.md`](CONVENTIONS.md) — the portable working conventions: the general-behavior hub
- [`SURFACING.md`](SURFACING.md) — the surfacing system: primitives plus the guide-PR course
- [`surfacing.json`](surfacing.json) — the machine index of the surfacing primitives
- [`PORTABLE.md`](PORTABLE.md) — the portable set: what travels, and how to adopt it
- [`portable.json`](portable.json) — the machine index of the portable set
- [`MARKETPLACE.md`](MARKETPLACE.md) *(orphan)* — the plugin marketplace: how the set is published and subscribed to
- [`TRACKER.md`](TRACKER.md) — the opt-in cross-session project tracker: schema, ids, board
- [`CONSTELLATION.md`](CONSTELLATION.md) — the portable kernel of the what-goes-where doctrine
- [`routes.json`](routes.json) — how content moves, renders, and gets looked at: grammar, modes, routes, and the showing block
- [`showing.md`](showing.md) — why the showing boundaries sit where they are: the frame and the record behind routes.json
- [`show-repo.md`](show-repo.md) — the show-repo shell: views, stage, transfer, and the .web-tools.json manifest
- [`artifacts.md`](artifacts.md) — Claude Code artifacts and the link-choice matrix
- [`HTML-STYLE.md`](HTML-STYLE.md) — the house style for pages: what to build, as against how
- [`SNAGS.md`](SNAGS.md) — the friction log: one line per snag, symptom then corrected move
- [`SHARE.md`](SHARE.md) *(orphan)* — the copy-paste prompt that points another session at the portable docs
- [`loader.md`](loader.md) — the loader contract: the canonical head block, gh.load, timing rules, and the load-build duality
- [`code-layers.md`](code-layers.md) — the code layers and the admission rule that sorts a new file into one of them
- [`headless-vendoring.md`](headless-vendoring.md) — building with CDN libraries and rendering headless where the CDNs are blocked
- [`markdown-in-chat.md`](markdown-in-chat.md) *(measured)* — working visually with markdown in a chat client on a phone
- [`pdf-structure.md`](pdf-structure.md) *(orphan)* — recovering structure from a PDF in the browser: what the kit does and honestly does not
- [`tools.json`](tools.json) — the curated Tools gallery manifest

## docs/envelopes/

- [`README.md`](envelopes/README.md) *(orphan)* — the content-envelope family: members, shared grammar, and the sibling decision
- [`surface.md`](envelopes/surface.md) *(orphan)* — the surface format contract
- [`chat-results.md`](envelopes/chat-results.md) *(orphan)* — the chat-results envelope contract
- [`data-view.md`](envelopes/data-view.md) — the data-view envelope contract
- [`shorter.md`](envelopes/shorter.md) *(orphan)* — the shorter envelope contract: a document and a shortening to adjudicate

## docs/envelopes/schemas/

- [`surface-v2.schema.json`](envelopes/schemas/surface-v2.schema.json) *(orphan)* — the surface v2 JSON Schema

## docs/envelopes/schemas/profiles/

- [`branch-review-v1.schema.json`](envelopes/schemas/profiles/branch-review-v1.schema.json) *(orphan)* — the branch-review profile schema
- [`stage-v1.schema.json`](envelopes/schemas/profiles/stage-v1.schema.json) *(orphan)* — the stage profile schema

## docs/environment/

- [`README.md`](environment/README.md) *(orphan)* — the environment docs' front door, and their update discipline
- [`capabilities.md`](environment/capabilities.md) *(measured)* — what the sandbox can run and reach
- [`container.md`](environment/container.md) *(measured)* — what the box is and what persists across sessions
- [`testing.md`](environment/testing.md) *(measured)* — how to test HTML and JS in the sandbox
- [`extending.md`](environment/extending.md) — the Claude Code component model and the hooks this repo runs

## docs/favicons/

- [`README.md`](favicons/README.md) *(orphan)* — the favicon archive: active marks and retired ones

## docs/github/

- [`README.md`](github/README.md) *(orphan)* — the github folder's front door: renderer, git treatment, MCP routing, surfacing
- [`markdown.md`](github/markdown.md) *(orphan)* — what GitHub's static renderer turns markdown into
- [`github-surfacing.md`](github/github-surfacing.md) *(orphan)* — GitHub-native surfaces for exposing work: branches, compares, drafts, permalinks
- [`mcp-server-routing.md`](github/mcp-server-routing.md) *(record, orphan)* — two GitHub MCP servers at once: the 2026-07-15 observation, superseded
- [`post-merge-branch-mutation.md`](github/post-merge-branch-mutation.md) *(orphan)* — why a merged branch stops being a live workspace: merged means closed

11 shared claims are registered; the registry note in
[`docs.json`](docs.json) carries the schema and the admission rule.
