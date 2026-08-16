# docs

<!-- GENERATED from docs/docs.json by tools/build/docs-readme.mjs; do not hand-edit. -->

Reference docs that don't belong at the repo root. This index is generated
from [`docs.json`](docs.json), the documentation registry, which also renders
live in [the Web Tools app's Map view, Docs tab](https://mehrlander.github.io/web-tools/app/?view=map)
alongside the shared-claims table (statements that live in more than one
place, each with its one authoritative carrier and the check that holds each
copy, or the honest absence of one). A **record** preserves a moment and is
corrected by markers, never rewritten; a **measured** doc carries dated
observations and is corrected by re-probing; everything else is living and
must stay correct.

**Reach** (derived by `tools/build/docs-reach.mjs`, gated against the registry):
2 arrive in every session's context, 26 are named by CLAUDE.md,
5 by a skill, 9 by a page or component. The remaining 15 are
marked *(orphan)* below: nothing points at them except this index.

## docs/

- [`APP.md`](APP.md) — the Web Tools app: mission, durable goals, and the name split
- [`CONSTELLATION.md`](CONSTELLATION.md) — the portable kernel of the what-goes-where doctrine
- [`CONVENTIONS.md`](CONVENTIONS.md) — the portable working conventions: the general-behavior hub
- [`HTML-STYLE.md`](HTML-STYLE.md) — the house style for pages: what to build, as against how
- [`MARKETPLACE.md`](MARKETPLACE.md) *(orphan)* — the plugin marketplace: how the set is published and subscribed to
- [`PORTABLE.md`](PORTABLE.md) — the portable set: what travels, and how to adopt it
- [`README.md`](README.md) — the docs folder's front door: the generated index of this registry
- [`SHARE.md`](SHARE.md) *(orphan)* — the copy-paste prompt that points another session at the portable docs
- [`SNAGS.md`](SNAGS.md) — the friction log: one line per snag, symptom then corrected move
- [`SURFACING.md`](SURFACING.md) — the surfacing system: primitives plus the guide-PR course
- [`TRACKER.md`](TRACKER.md) — the opt-in cross-session project tracker: schema, ids, board
- [`app-routes.json`](app-routes.json) — the show-repo app's own destinations: every address, what it is for, and which files draw it
- [`artifacts.md`](artifacts.md) — Claude Code artifacts and the link-choice matrix
- [`branch-overlay.md`](branch-overlay.md) *(orphan)* — the branch overlay: the takeover, file substitution, the sidebar's second ref, and drop-on-a-branch
- [`code-layers.md`](code-layers.md) — the code layers and the admission rule that sorts a new file into one of them
- [`docs.json`](docs.json) — this registry: the documents census and the shared-claims table
- [`harness.json`](harness.json) — the harness census: every tools/ and scripts/ file's role, invocation route, and derived accounting
- [`headless-vendoring.md`](headless-vendoring.md) — building with CDN libraries and rendering headless where the CDNs are blocked
- [`ios-sheet-drags.md`](ios-sheet-drags.md) — why a drag inside a sheet-presented in-app browser dismisses the sheet, and the two fixes, measured on device
- [`loader.md`](loader.md) — the loader contract: the canonical head block, gh.load, timing rules, and the load-build duality
- [`manifest.json`](manifest.json) *(orphan)* — the field registry for root .web-tools.json: every field's type, consumer, and effect
- [`manifest.md`](manifest.md) — the .web-tools.json manifest: the file's contract and the registry machinery (config cache, mailbox, proposals, editing from the shell)
- [`markdown-in-chat.md`](markdown-in-chat.md) *(measured)* — working visually with markdown in a chat client on a phone
- [`owners.json`](owners.json) — the owners registry: for a statement the coordination layer repeats, its one authoritative carrier and every typed repetition
- [`pdf-structure.md`](pdf-structure.md) — recovering structure from a PDF in the browser: what the kit does and honestly does not
- [`portable.json`](portable.json) — the machine index of the portable set
- [`properties.json`](properties.json) — the properties registry: the declaration table binding each metadata property to its one authoritative registry, mode, and enforcement
- [`registries.md`](registries.md) — the metadata model: targets, scopes, properties, declarations, assertions; ownership not overlay; the census and catalog reduction
- [`routes.json`](routes.json) — how content moves, renders, and gets looked at: grammar, modes, routes, and the showing block
- [`show-repo.md`](show-repo.md) — the show-repo shell: views and transfer
- [`stage.md`](stage.md) — the stage: bench and Saved, intake, the walkable preview and diff, Out, save-as-surface, and the #stage= link grammar
- [`showing.md`](showing.md) — why the showing boundaries sit where they are: the frame and the record behind routes.json
- [`surfacing.json`](surfacing.json) — the machine index of the surfacing primitives
- [`tests.json`](tests.json) — the test registry: every check's kind, what it protects, and its derived counts
- [`text-content.md`](text-content.md) *(measured, orphan)* — the estate's authored text: whether the carriers holding it are organized, and how much never reached one
- [`text-tools.md`](text-tools.md) *(orphan)* — the FAB's Text tab: why it exists, why the join is the path rather than a term, and an assessment of what it is not
- [`tools.json`](tools.json) — the curated Tools gallery manifest
- [`venues.md`](venues.md) *(measured)* — the venue map: where work can run besides the session reading it, what each reaches, and the attended-versus-unattended split

## docs/envelopes/

- [`README.md`](envelopes/README.md) *(orphan)* — the content-envelope family: members, shared grammar, and the sibling decision
- [`chat-results.md`](envelopes/chat-results.md) — the chat-results envelope contract
- [`data-view.md`](envelopes/data-view.md) — the data-view envelope contract
- [`shorter.md`](envelopes/shorter.md) — the shorter envelope contract: a document and a shortening to adjudicate
- [`surface.md`](envelopes/surface.md) — the surface format contract

## docs/envelopes/schemas/

- [`surface-v2.schema.json`](envelopes/schemas/surface-v2.schema.json) *(orphan)* — the surface v2 JSON Schema

## docs/envelopes/schemas/profiles/

- [`branch-review-v1.schema.json`](envelopes/schemas/profiles/branch-review-v1.schema.json) *(orphan)* — the branch-review profile schema
- [`stage-v1.schema.json`](envelopes/schemas/profiles/stage-v1.schema.json) *(orphan)* — the stage profile schema

## docs/environment/

- [`README.md`](environment/README.md) *(orphan)* — the environment docs' front door, and their update discipline
- [`capabilities.md`](environment/capabilities.md) *(measured)* — what the sandbox can run and reach
- [`container.md`](environment/container.md) *(measured)* — what the box is and what persists across sessions
- [`extending.md`](environment/extending.md) — the Claude Code component model and the hooks this repo runs
- [`testing.md`](environment/testing.md) *(measured)* — how to test HTML and JS in the sandbox

## docs/favicons/

- [`README.md`](favicons/README.md) *(orphan)* — the favicon archive: active marks and retired ones

## docs/github/

- [`README.md`](github/README.md) *(orphan)* — the github folder's front door: renderer, git treatment, MCP routing, surfacing
- [`github-surfacing.md`](github/github-surfacing.md) — GitHub-native surfaces for exposing work: branches, compares, drafts, permalinks
- [`markdown.md`](github/markdown.md) *(orphan)* — what GitHub's static renderer turns markdown into
- [`mcp-server-routing.md`](github/mcp-server-routing.md) *(record, orphan)* — two GitHub MCP servers at once: the 2026-07-15 observation, superseded
- [`post-merge-branch-mutation.md`](github/post-merge-branch-mutation.md) — why a merged branch stops being a live workspace: merged means closed

12 shared statements are registered in
[`owners.json`](owners.json), which carries its own scope and schema.
