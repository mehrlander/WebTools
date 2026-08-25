# Content envelopes

An **envelope** is a JSON document that carries a curated, annotated set of items for a reader to open, rendered by a web-tools page rather than by a bespoke viewer. Files, chats, and diffs stay where they live; the envelope layers selection, arrangement, and commentary over them, travels as one unit, and renders through a shared page. This folder is the family's home: the format contracts, the JSON Schemas that validate them, and this note on how the members relate.

The `schemas/` here are the validation source of truth; the `.md` files carry concepts, conventions, and worked examples. A repo that pulls the portable conventions meets the family through the **envelope primitive** in [`docs/SURFACING.md`](../SURFACING.md) and fetches these docs when it needs the mechanics.

## The members

Five carriers exist today, from the most general to the most specific.

| Member | Contract | Renders through | Carries |
| --- | --- | --- | --- |
| **Surface** | [`surface.md`](surface.md) + [`schemas/surface-v2.schema.json`](schemas/surface-v2.schema.json) | show-repo's estate view; the Surfacer desktop app | a curated, annotated set of cross-repo items for any reason |
| **Chat-results** | [`chat-results.md`](chat-results.md) | [`pages/chat-results.html`](../../pages/chat-results.html) | what a search over the chat archives found |
| **Stage** | [`docs/show-repo.md`](../show-repo.md), `StageLink` | show-repo | a fileset in transit, plus authored review prompts and a mode |
| **Data view** | [`data-view.md`](data-view.md) | [`pages/data-view.html`](../../pages/data-view.html) | data itself: a CSV, a JSON array, a log, or several of them with a view each |
| **Shorter** | [`shorter.md`](shorter.md) | [`pages/shorter.html`](../../pages/shorter.html) | a document and, optionally, a shortening of it to adjudicate against it |

**Surface** is the general substrate: the schema is deliberately light at the core (`role`, `view`, `context` optional and open) and tightens through named, versioned **profiles**, of which `branch-review/1` is the first (its schema is under [`schemas/profiles/`](schemas/profiles/)).

**Chat-results** is the search-archive envelope: `results[]` with excerpts or inline transcripts, optional `facets[]` and a `narrative`. It doubles as the serialization that pulls specific chats' content into another repo.

**Stage** is the transport carrier behind the 🗂️ `#stage=` link. It is no longer a schema of its own: a stage item is a surface item's `target.source` triple (`{repository, ref, path}`) with the annotations empty, so the stage and the surface share one item grammar.

**Data view** is the plain case, and the only member a caller can skip entirely: a `#data=` toss accepts bare bytes (a CSV, a JSON array, a log) as readily as an `items` envelope, and [`lib/kits/data-payload.js`](../../lib/kits/data-payload.js) tells them apart rather than asking. Its envelope carries no roles, context, or profile, only what bare bytes cannot express: several files at once, and a default view and note per item.

**Shorter** is the newest and the narrowest: two strings rather than a set of items, so it is the one member that is not a collection. It earns its place by following the same rules, which is the point of listing it here: the `owner/repo[@ref]:path` address, the `#gz=`/`?src=` split, and a narrow bare-or-envelope discriminator in [`lib/kits/shorter-payload.js`](../../lib/kits/shorter-payload.js) modeled directly on data-view's. Bare text is the common case and needs no wrapper; the envelope exists only to carry a shortening someone already produced, so a link can open straight into the adjudication view.

## The decision: chat-results stays a sibling

The stage converged onto the surface schema; the open question was whether chat-results should follow, as a `chat-results/1` profile over the surface core, or remain a peer schema that shares only delivery mechanics. Decided 2026-08-02: **sibling.** The family is one core schema with profiles for file-shaped curation, plus chat-results as a peer, and the shared layer is the transport conventions (the `owner/repo[@ref]:path` address, the `#gz=`/`?src=` split, live-code rendering) and the ref triple.

Three reasons, in order of weight:

1. **The shapes differ structurally, not cosmetically.** A chat result carries message arrays (`excerpts[]`, `transcript[]`, each `{role, md, ts?}`), which the surface item has no slot for: `content` and `snippet` are strings. And chat-results facets are many-to-many (`members[]`, one result in several groupings) where the surface `facet` is a single section key per item. A profile can constrain the core; it cannot restructure it, so `chat-results/1` would push the entire payload into open `metadata` and buy one validator in name only.
2. **The convergence that matters already happened.** A result's `source {repo, path, ref}` is the same ref triple as the surface's `target.source` and the stage item; that is what lets one carrier's items point where another's do. Nothing further is gained by unifying the wrapper around it.
3. **No concrete need is asking.** The case for a profile was a mixed surface holding both files and chats under one item grammar. If that arrives, the existing posture covers it ("each reader reads every kind, authors the kinds it knows"): a surface can hold a `type: chat` item whose `target.source` addresses the chat file, or the estate view can render a chat-results envelope as generic cards, with no change to either schema. Remodeling `pages/chat-results.html` and the committed `results/*.json` envelopes in chat-histories for tidiness alone would be work nothing is asking for.

The decision is reversible at the same price later, and the trigger for revisiting is named: a real mixed-envelope need that the `type: chat` posture cannot carry.

## Provenance

The surface format originated in the Surfacer desktop app (the private `home` repo, `projects/surfacer/`), which keeps its planning there and defers the format contract to `surface.md` here. The chat-results envelope is authored by the `chat-histories` search skill and stored as `results/*.json` in that repo, which likewise treats this folder as the contract home. Both readers are documented per member; their v1→v2 migration targets live at the end of `surface.md`.
