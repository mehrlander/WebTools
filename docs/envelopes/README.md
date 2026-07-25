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

**Data view** is the plain case, and the only member a caller can skip entirely: a `#data=` toss accepts bare bytes (a CSV, a JSON array, a log) as readily as an `items` envelope, and [`lib/data-payload.js`](../../lib/data-payload.js) tells them apart rather than asking. Its envelope carries no roles, context, or profile, only what bare bytes cannot express: several files at once, and a default view and note per item.

**Shorter** is the newest and the narrowest: two strings rather than a set of items, so it is the one member that is not a collection. It earns its place by following the same rules, which is the point of listing it here: the `owner/repo[@ref]:path` address, the `#gz=`/`?src=` split, and a narrow bare-or-envelope discriminator in [`lib/shorter-payload.js`](../../lib/shorter-payload.js) modeled directly on data-view's. Bare text is the common case and needs no wrapper; the envelope exists only to carry a shortening someone already produced, so a link can open straight into the adjudication view.

## The open question

The stage has already converged onto the surface schema. **Chat-results has not.** It remains a separate schema designed apart from surface v2, though the two share a great deal: curated items, per-item annotation, `#gz=`/`?src=` delivery, and live-code rendering. The unresolved design question for this family is whether chat-results should become a **surface profile** (`profile: {name: "chat-results", version: 1}`, the way `branch-review/1` is a profile over the same core) or stay a **third sibling schema** that merely shares delivery mechanics.

Resolving it decides whether the family has one core schema with profiles or two peer schemas with a shared transport. The tracked task is 🎫 [Fold chat-results into the surface schema, or keep it a sibling](https://github.com/mehrlander/web-tools/blob/main/tracker/tasks/chat-results-surface-profile-q4m8ra.md); the convergence groundwork it builds on is in the "Converge the stage and surface item schemas" and "Integrate the stage with the surfacer's .surface format" tasks.

## Provenance

The surface format originated in the Surfacer desktop app (the private `home` repo, `projects/surfacer/`), which keeps its planning there and defers the format contract to `surface.md` here. The chat-results envelope is authored by the `chat-histories` search skill and stored as `results/*.json` in that repo, which likewise treats this folder as the contract home. Both readers are documented per member; their v1→v2 migration targets live at the end of `surface.md`.
