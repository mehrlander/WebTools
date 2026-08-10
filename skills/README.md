# skills — Marcus's personal skill library

Static resource. **Not a registered skill folder.** Sits at `web-tools/skills/`, not `web-tools/.claude/skills/`, deliberately: putting anything here under `.claude/skills/` would register it as an auto-fire skill in every web-tools session, which is exactly what the library-load model exists to avoid.

## Two roles this repo plays

| Path | Role | What Claude sees at session start |
|---|---|---|
| `web-tools/.claude/skills/&lt;name&gt;/SKILL.md` | Registered skill | Available and matchable via description |
| `web-tools/skills/&lt;name&gt;/SKILL.md` | Library resource | Not registered anywhere; fetched on demand |

At session start, only `web-tools` and `load-skill` are registered from web-tools itself. Everything under `skills/` is content the `load-skill` mechanism can pull in.

## The library

`manifest.json` lists every available skill. Each entry has:

- `name`: the slug that matches the folder name (`arriving-together`, `xlsx`, etc.)
- `description`: the same description text the skill's own `SKILL.md` carries in its frontmatter, provided so consumers can decide relevance without fetching every body.

The `SKILL.md` inside each folder is the canonical body of the skill. Companion files (`scripts/`, `references/`, `assets/`) live at sibling paths under the same folder.

## How this gets loaded

Via the `load-skill` mechanism at `.claude/skills/load-skill/SKILL.md`. Given a skill name, `load-skill` resolves to `<source>/<name>/SKILL.md` and fetches. `<source>` defaults to `https://raw.githubusercontent.com/mehrlander/web-tools/main/skills`; a caller can pass another source URL to pull from a different published library.

Trigger phrases live in the `load-skill` skill's description. Only fire on explicit signals: `"load skill X"`, `"load-skill X"`, `"/load-skill X"`, `"fetch the X skill"`, `"load my X skill"`. Never on general topic overlap. The library is opt-in per session, not opportunistic.

## Editing skills

Skill bodies are edited in place here. Any repo that loads them picks up the change on next fetch: the URL always points at `main`. No target repo needs to be updated when a body changes.

**That holds for `/load-skill` and not for an account-level install.** A skill also installed at claude.ai account scope has a second copy this library does not reach, and that copy is the one that fires unprompted, while the library's is fetched deliberately. Editing here therefore leaves the stale version in charge. Either drop the account copy and let `/load-skill` be the only route, or re-upload after every edit. Measured 2026-08-10: `apple-shortcuts-actions` was rewritten here while the account copy went on triggering on a renamed shortcut and a superseded payload format.

Adding a new skill: create `web-tools/skills/<name>/SKILL.md` with the standard YAML frontmatter (`name`, `description`), then add an entry to `manifest.json`. That's it. Callers see the new skill on their next manifest fetch.

Removing a skill: delete its folder and remove its manifest entry. Consumers that had already resolved a URL to it will fail on next fetch; that's the intended failure mode.

## Snapshot lineage

The initial population of this library on 2026-07-10 mirrors the set that lived at Marcus's claude.ai account skills at that date. An earlier snapshot of the same set lived in the home repo at `me/claude-skills/` (dated 2026-07-07) and was removed the day this library landed. Going forward, this folder is the source of truth.
