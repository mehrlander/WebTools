# Portable set (the to-go bag)

The docs and scripts in `mehrlander/web-tools` that are written to be used **from
any repo**, not just this one. If you want this repo's working conventions, its
recipe for building with a favorite front-end stack and testing it headless, or
its tracker board generator, without adopting the whole library, this is the menu.

The **`portable` plugin** is the front door: one install brings the whole bag
(see [MARKETPLACE.md](MARKETPLACE.md)). This file is the catalog behind it, the
*what* to the plugin's *how*, and it lists the pieces that ride along outside the
plugin (reference docs, scripts, the tracker) to fetch when you use them. The
raw-URL fetch recipes below remain the no-install fallback for environments where
plugins are unavailable.

The machine-readable index of this catalog is [`docs/portable.json`](portable.json):
show-repo's **Portable view** renders the set from it (each piece openable in
the shell's viewer) beside a live per-repo adoption matrix, and
`tools/test/portable-manifest.test.mjs` holds the manifest and this file's
tables consistent so neither drifts.

## How to adopt

Install the `portable` plugin once. One-off, in any session:

```
/plugin marketplace add mehrlander/web-tools
/plugin install portable@web-tools
```

Standing, for a repo (the committed form; cloud sessions install it at session
start): add the `extraKnownMarketplaces` and `enabledPlugins` block to
`.claude/settings.json`, shown in [MARKETPLACE.md](MARKETPLACE.md).

**What one install brings (the bag):**

| Piece | What it gives you |
|---|---|
| `/portable:web-tools` | loads the working conventions live (surfacing primitives + the guide-PR/merge-guide course) |
| `/portable:caption` | the surfacing caption, and the guide-PR body sync |
| `/portable:load-skill` | fetch any skill from the [library](../skills/) on demand |
| `/portable:show-repo` | browse any repo and move files across repos |
| `/portable:tree` | render a linked file tree of the repo, table-first for mobile |
| `/portable:tasks` | operate the cross-session project tracker (file, claim, close, regenerate the board) |
| `/portable:in-flight` | check whether a branch, PR, or task is already working on something, and reconcile stale tracker claims |
| `/portable:markers` | what is frozen, stale, or wrong: mark a claim, declare a path in `.paths.json`, inventory both, check that they agree |

That is the whole day-to-day set. One script rides inside the plugin: the board
generator (`build-board.py`) is bundled with the `tasks` skill, so `/tasks`
regenerates a board with nothing to fetch. The reference docs and the other
scripts below are not in the plugin: they are fetched by raw URL when a task
needs them (the skills that use a script fetch it themselves). The `tasks` skill ships in the
bag, but the tracker it operates (the `docs/TRACKER.md` schema, the task files,
`board.md`) stays per-repo and is fetched or bootstrapped when a repo adopts it. Everything is
reachable directly from
`https://raw.githubusercontent.com/mehrlander/web-tools/main/<path>` (the repo is
public and that host is on the Claude Code web allowlist), which is also the
no-plugin fallback for the whole bag.

## The repo's config file: `.web-tools.json`

A repo's web-tools config lives in one file, root **`.web-tools.json`**, parsed as
data and never executed. It is optional: a repo with none is simply unconfigured.
Top-level fields, not namespaced by consumer, so any web-tools page can read them:

| Field | Read by | What it sets |
|---|---|---|
| `icon` | show-repo | Phosphor class a repo self-declares for its quick-link button (the row's icon actually comes from the registry, below) |
| `quickLinks` | show-repo | registry repo only: the curated header quick-link list `[{repo, icon}]`, read from the private registry repo when the viewer has a token |
| `landing` | show-repo | path to the repo's own landing page (rendered live via toss-render `#gh=`) |
| `scope` | show-repo (Map) | the repo's own account of what it holds and why: inline prose, or a repo path ending in `.md` (a file pointer). The repo owns the story; the Map view stacks the per-repo statements rather than keeping a central list |
| `pins` | show-repo | folders/files surfaced in the sidebar Pinned block |
| `stage` | show-repo | `{ files, targets }`: a durable staged-files list and default transfer destinations |
| `conventions` | session-start nudge | `"optout"` marks a repo that has deliberately not adopted the conventions, so the nudge stops asking |

Full field semantics for the show-repo fields are in [`docs/show-repo.md`](show-repo.md).
The file was formerly `.show-repo.json`; readers fall back to that name so an
unconverted repo keeps working. That fallback is a back-compat shim tagged
`SUNSET(2026-08-15)` (see Sunset markers below); it is removed once repos are
migrated, after which only `.web-tools.json` is read.

## Staying current on the fetch fallback: refresh at session start

The `portable` plugin auto-updates (it declares no `version`, so consumers track
the tip; see [MARKETPLACE.md](MARKETPLACE.md)), so a plugin install needs nothing
here. This section is for the raw-URL fetch fallback only.

The skill fetches `CONVENTIONS.md` live on every run, so the *conventions* never
go stale once the skill is **invoked**. The pieces that can drift are the loader
**skill file** itself (its fetch URL, fallbacks, description) and any portable
**scripts** a consumer runs. A consuming repo that wants these kept current can
re-fetch them each session with a single fail-soft `SessionStart` hook, instead
of re-running the installer by hand whenever anything changes. The hook is the
committed mechanism; the fetched artifacts are gitignored, so they're fresh every
session and never stale copies in the tree.

> [!IMPORTANT]
> **Fetch is not invoke. This hook keeps the skill current; it does not run it.**
> A `SessionStart` hook that writes a skill file to disk makes the skill
> *available*, not *invoked*, and it emits nothing to context. On its own it
> never loads `CONVENTIONS.md`: the loader is model-invocable, so the conventions
> govern a session only if the agent judges the skill relevant, the user types
> `/web-tools`, or the repo's `CLAUDE.md` makes it always-on. **So
> this hook is not self-sufficient: pair it with the always-on CLAUDE.md line**
> (see [the skill's install section](../.claude/skills/web-tools/SKILL.md)),
> or the conventions stay fetched-but-unused: present on disk, absent from
> context, governing nothing. (This is exactly how a downstream adopter's sync
> silently no-op'd: the hook fetched faithfully every session, but nothing ever
> invoked the skill, so the conventions never reached context.) To remove the
> dependency on the agent obeying a CLAUDE.md line, use the stronger variant
> below, which injects the conventions into context directly.

1. `.claude/hooks/web-tools-sync.sh` (`chmod +x`):

```bash
#!/bin/bash
set -uo pipefail
BASE="https://raw.githubusercontent.com/mehrlander/web-tools/main"
ROOT="${CLAUDE_PROJECT_DIR:-.}"

fetch() {
  local url="$1" dest="$2"
  mkdir -p "$(dirname "$dest")" 2>/dev/null || return
  if curl -fsSL --max-time 10 "$url" -o "$dest.tmp" 2>/dev/null; then
    mv "$dest.tmp" "$dest" 2>/dev/null || rm -f "$dest.tmp"
  else
    rm -f "$dest.tmp" 2>/dev/null
  fi
}

# Skills
fetch "$BASE/.claude/skills/web-tools/SKILL.md" \
      "$ROOT/.claude/skills/web-tools/SKILL.md"
fetch "$BASE/.claude/skills/caption/SKILL.md" \
      "$ROOT/.claude/skills/caption/SKILL.md"
fetch "$BASE/.claude/skills/load-skill/SKILL.md" \
      "$ROOT/.claude/skills/load-skill/SKILL.md"

# Portable scripts (these ship in the plugin; a no-plugin repo fetches the
# same files by raw URL from their bundled locations)
fetch "$BASE/.claude/skills/tasks/build-board.py" \
      "$ROOT/.web-tools-scripts/build-board.py"
chmod +x "$ROOT/.web-tools-scripts/build-board.py" 2>/dev/null
fetch "$BASE/.claude/skills/markers/status.py" \
      "$ROOT/.web-tools-scripts/status.py"
chmod +x "$ROOT/.web-tools-scripts/status.py" 2>/dev/null

exit 0
```

2. Gitignore the fetched artifacts, so the hook (not a checked-in copy) is the source of truth:

```
.claude/skills/web-tools/
.claude/skills/caption/
.claude/skills/load-skill/
.web-tools-scripts/
```

3. Register it under `SessionStart` in `.claude/settings.json`, alongside any hook already there:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/web-tools-sync.sh" }
        ]
      }
    ]
  }
}
```

Why it holds: the hook is committed and the fetched artifacts are gitignored
(fresh each session, never stale copies in the tree); it's fail-soft (10s cap
per fetch, errors swallowed, always `exit 0`), so a hiccup or a web-tools outage
degrades to "no auto-loaded conventions this session," not a blocked start; and
it fetches over `raw.githubusercontent.com`, on the web allowlist (see "How to
adopt" above), so no auth. Keep it **synchronous** (the default) so it completes
before skill discovery and the freshly-fetched skill is live in the *same*
session, not the next one. To add a new portable script, add one `fetch` line.
This is a recipe for *consuming* repos; web-tools is the source and doesn't run
it on itself.

### Stronger variant: inject the conventions, don't just fetch them

The hook above still leans on the always-on CLAUDE.md line to close the
fetch→invoke gap. A `SessionStart` hook can instead **emit the conventions
straight into context** via `additionalContext`, collapsing fetch and invoke into
one step and removing the dependency on the agent obeying any CLAUDE.md line: the
text is simply *there* at the start of every session, the same as if the skill
had run. Use this when you want the conventions unconditionally governing every
file-modifying session and don't mind paying their context cost up front.

This hook fetches the conventions themselves (not the skill file) and prints the
SessionStart `additionalContext` JSON the harness reads. The conventions are two
files now, `CONVENTIONS.md` (the hub) and `SURFACING.md` (the surfacing system),
so it fetches and concatenates both; fetching only the hub would inject a session
with no surfacing rules:

```bash
#!/bin/bash
set -uo pipefail
BASE="https://raw.githubusercontent.com/mehrlander/web-tools/main/docs"
BODY=""
for f in CONVENTIONS SURFACING; do
  PART="$(curl -fsSL --max-time 10 "$BASE/$f.md" 2>/dev/null)" || exit 0
  [ -n "$PART" ] || exit 0
  BODY="$BODY$PART"$'\n\n'
done
command -v jq >/dev/null 2>&1 || exit 0
printf '%s' "$BODY" | jq -Rs \
  '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:.}}'
```

Register it under `SessionStart` exactly like the fetch hook (step 3 above). It's
fail-soft on the same principle: a failed fetch, an empty body, or a missing `jq`
each `exit 0` with no output, degrading to "no injected conventions this session"
rather than a blocked start. (No `jq`? Swap the last line for
`python3 -c 'import json,sys; print(json.dumps({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":sys.stdin.read()}}))'`.)

> [!WARNING]
> That fail-soft posture has a sharp edge worth naming, because it's the same
> bug this whole doc is about. If a host has **neither** `jq` nor `python3`, the
> `command -v … || exit 0` guard makes the hook degrade *silently* to
> no-injection: the very fetch-without-invoke no-op the variant exists to
> prevent, now wearing a different hat. That's the right default for a
> *convenience* (a missing interpreter shouldn't block your session), but the
> wrong one if you adopt inject **as your guarantee** that the conventions are
> loaded. In that case make the missing-interpreter case *loud*, not `exit 0`:
> replace the guard with a branch that warns to stderr (and/or emits an
> `additionalContext` note saying "conventions failed to load"), so a
> misconfigured host fails noisily instead of quietly governing nothing.

Trade-offs versus the skill-fetch hook: this injects the conventions into **every**
session unconditionally (always-on context cost, no model judgement), it loads
`CONVENTIONS.md` raw rather than through the skill's à-la-carte "apply" framing,
and it doesn't keep the loader **skill** itself installed (so `/web-tools`
and the model-invocation path won't exist unless you also run the installer). The
two are complementary, not exclusive: a repo can run the skill-fetch hook *and*
this injector, or pick whichever matches how reliably it needs the conventions
present.

## The set

Portability is per-item, not per-directory. Most of `tools/` is web-tools-specific
machinery; most of `docs/` is portable. The tables below list what travels.

### Docs

| Doc | What it's for | How you use it |
|---|---|---|
| [`.claude/skills/web-tools/SKILL.md`](../.claude/skills/web-tools/SKILL.md) | the loader: pulls the conventions into any session, and links here for the rest | **install** (copy in, once) |
| [`docs/CONVENTIONS.md`](CONVENTIONS.md) | the general-behavior **hub**: prose style, standing decisions, leave-it-nicer, make-work, and the session / repository / workstream scope vocabulary. Behavior that applies regardless of whether anything is being surfaced | fetched live by the skill |
| [`docs/SURFACING.md`](SURFACING.md) | the **surfacing system**, split out of CONVENTIONS.md: the universal **surfacing primitives** (the **surfacing caption**'s `[new]/[main]/[diff]` file links plus a 🥏 render line, reference-is-a-link, show-pixels, branch anchor, 🧭 guide pointer, session diff) plus the **surfacing course** (guide-PR/merge-guide lifecycle, wrap-up, handoff), which stays idle until you open a PR. Loaded with CONVENTIONS.md as one set | fetched live by the skill |
| [`.claude/skills/caption/SKILL.md`](../.claude/skills/caption/SKILL.md) | `/caption`: emit the surfacing caption (full, turn, bare, or recap size; recap wraps the full caption in a fixed-form session re-entry) for the current branch; also the sync engine for a guide PR body's managed region | install or hook-fetch |
| [`.claude/skills/load-skill/SKILL.md`](../.claude/skills/load-skill/SKILL.md) | `/load-skill`: fetch a named skill from the library at [`skills/`](../skills/) (or another declared source) and apply it in the current session; discovery via `skills/manifest.json`. Explicit signal only, never opportunistic | install or hook-fetch |
| [`.claude/skills/show-repo/SKILL.md`](../.claude/skills/show-repo/SKILL.md) | `/show-repo`: use the hosted show-repo shell to browse any repo, mint a 🗂️ `#stage=` fileset link, run a cross-repo transfer, or author a repo's `.web-tools.json`; loads [`docs/show-repo.md`](show-repo.md) | install or hook-fetch |
| [`.claude/skills/in-flight/SKILL.md`](../.claude/skills/in-flight/SKILL.md) | `/in-flight`: before starting work, report which branches carry commits the base branch lacks, which open PRs and [`docs/TRACKER.md`](TRACKER.md) claims sit on them, and which claims have gone stale; `--paths` turns it into a collision check on the files about to change. Runs [`.claude/skills/in-flight/in-flight.py`](../.claude/skills/in-flight/in-flight.py) | install or hook-fetch |
| [`.claude/skills/markers/SKILL.md`](../.claude/skills/markers/SKILL.md) | `/markers`: the status system from [`docs/CONVENTIONS.md`](CONVENTIONS.md#status-frozen-stale-wrong). Mark a claim `Frozen`/`Stale`/`Wrong` in prose, declare a path frozen in a cascading `.paths.json`, inventory both across a repo, and check that arrow targets resolve and frozen files say so where they are read. Runs [`.claude/skills/markers/status.py`](../.claude/skills/markers/status.py) | install or hook-fetch |
| [`.claude/skills/tasks/SKILL.md`](../.claude/skills/tasks/SKILL.md) | `/tasks`: operate the project tracker (file, claim, update, close a task; regenerate `board.md`) per the [`docs/TRACKER.md`](TRACKER.md) schema and the commit-to-`main` rule | install or hook-fetch |
| [`.claude/skills/tree/SKILL.md`](../.claude/skills/tree/SKILL.md) | `/tree`: render a repo or subtree as a linked markdown table (code-span box art or braille indent, filetype icons, optional gloss); generated by [`scripts/build-tree.py`](../scripts/build-tree.py) | install or hook-fetch |
| [`docs/markdown-in-chat.md`](markdown-in-chat.md) | working visually with markdown in a **chat client** (mobile): why nested bullets balloon and tables beat them, which characters survive a table-cell trim, and the file-tree formats that fall out. Companion to [`docs/github/markdown.md`](github/markdown.md) (GitHub's static renderer) | fetch when relevant |
| [`skills/`](../skills/) | the skill **library**: 34 personal skills published as static resources (not registered anywhere); the default source `load-skill` pulls from | fetched per skill by load-skill |
| [`docs/TRACKER.md`](TRACKER.md) | opt-in **project tracker**: cross-session work-tracking, one file per task under `tasks/` plus a generated `board.md`, the slow layer where the plan lives between sessions. Independent of the primitives and the course | fetch when adopting |
| [`docs/CONSTELLATION.md`](CONSTELLATION.md) | the portable **kernel** of the what-goes-where doctrine: the ephemeral-clone constraint, commit discipline, visibility forces repo boundaries, conventions pull from a public hub, bootstrapping equals staying-in-sync, and the repo owns its own scope. The theory show-repo's **Map** view applies; the full worked instance stays in the private `home` repo | fetch when relevant |
| [`docs/headless-vendoring.md`](headless-vendoring.md) | build with Tailwind / daisyUI / Alpine / Phosphor and screenshot or test them **headless** in a sandbox that blocks their CDNs (the "Playwright won't load my libraries" problem) | fetch or copy; self-contained |
| [`docs/environment/`](environment/) | dated facts about the Claude Code **web sandbox** itself: network allowlist, what persists, the testing recipes. Sandbox-level, so they apply to a session in any repo | fetch when relevant |
| [`docs/github/markdown.md`](github/markdown.md) | what GitHub's renderer does with markdown (Mermaid, math, alerts, sparklines): GitHub-level, not web-tools-level | fetch when relevant |
| [`docs/github/mcp-server-routing.md`](github/mcp-server-routing.md) | when two GitHub MCP servers are connected at once, an unexpected approval prompt is often a routing artifact, not a permission wall: prefer/retry the stable `mcp__github__*` server before re-approving. Platform-level, applies in any repo | fetch when relevant |
| [`docs/artifacts.md`](artifacts.md) | Claude Code **artifacts**: constraints, the bake-and-publish pipeline, and the 📦 marker's place beside ⭐/🥏 in the link-choice matrix. Platform-level, so it applies in any repo | fetch when relevant |
| [`docs/show-repo.md`](show-repo.md) | the **show-repo** instrument: the hosted shell that browses any repo and moves files between repos (the stage, the 🗂️ `#stage=` link grammar, `gh-transfer`, and the `.web-tools.json` manifest). The reference the `show-repo` skill fetches | fetch when relevant |
| [`docs/envelopes/`](envelopes/) | the **content-envelope family**: JSON documents that carry a curated, annotated set of items for a reader to open, rendered by a web-tools page. [`README.md`](envelopes/README.md) frames the family; [`surface.md`](envelopes/surface.md) is the general `.surface` contract (v2, shared by the Surfacer desktop app and show-repo's estate view; profiles, first `branch-review/1`; v1→v2 migration); [`chat-results.md`](envelopes/chat-results.md) is the chat-search envelope; the stage (`docs/show-repo.md`) is the third carrier. The JSON Schemas in [`envelopes/schemas/`](envelopes/schemas/) are the validation source of truth | fetch when relevant |

### Scripts

Portable scripts live in `scripts/` at the repo root (the board generator
excepted: it ships bundled with the `tasks` skill so the plugin carries it):
fetchable by raw URL, runnable with no dependencies beyond python3 stdlib, and
parameterized by argv so one fetched copy serves many callers.

| Script | What it does | Interface |
|---|---|---|
| [`.claude/skills/tasks/build-board.py`](../.claude/skills/tasks/build-board.py) | regenerate a tracker's `board.md` from `tasks/*.md` frontmatter; bundled in the `portable` plugin, so `/tasks` runs it via `${CLAUDE_PLUGIN_ROOT}` | `python3 build-board.py <tasks_dir> <board_out>` |
| [`.claude/skills/in-flight/in-flight.py`](../.claude/skills/in-flight/in-flight.py) | sort a branch estate into live / merged / unrelated by ahead-count, then reconcile every `in-progress` tracker claim against the branch it names; bundled in the `portable` plugin, so `/in-flight` runs it via `${CLAUDE_PLUGIN_ROOT}` | `python3 in-flight.py <repo…> [--paths P…] [--prs F] [--fetch] [--json]` |
| [`scripts/build-merge-guide.py`](../scripts/build-merge-guide.py) | generate `docs/MERGE-GUIDE.md` from merged PR bodies (the guide region); non-destructive, `--refresh` to regenerate covered PRs | `python3 build-merge-guide.py [owner/repo] --out <file>` |
| [`scripts/sunset-scan.py`](../scripts/sunset-scan.py) | report `SUNSET(YYYY-MM-DD)` markers now due for removal (see Sunset markers below); quiet unless something is due, `--all` lists upcoming, `--strict` exits non-zero when due | `python3 sunset-scan.py [--all] [--strict] [root]` |
| [`scripts/build-tree.py`](../scripts/build-tree.py) | render a repo tree as a linked markdown table for chat (code-span box art, braille indent, or plain ascii); tracked-only by default, gloss column left to fill by hand | `python3 build-tree.py <root> [--repo o/r] [--ref R] [--depth N] [--mode M] [--gloss]` |
| [`scripts/ocr-pdf.py`](../scripts/ocr-pdf.py) | OCR a scanned PDF and report how far to trust it: per-page word confidence from tesseract's TSV, and pages that already carry a text layer passed through untouched unless `--force`. Needs the system binaries `tesseract-ocr` and `poppler-utils`, absent from a fresh sandbox | `python3 ocr-pdf.py <pdf> [-o out.txt] [--report r.json] [--dpi N] [--lang L] [--force]` |

Fetching and running a script is executing hub code, a step beyond fetching and
reading a doc. That is why the hub must stay owned and trusted and the fetch stays
fail-soft: a consumer can audit the script at its raw URL, but there is no
signature or pinning beyond trusting the source repo.

### Sunset markers

Code kept only for backward compatibility (a legacy-name read fallback, a
migration shim) is tagged with a dated marker so it gets removed rather than
lingering:

```js
// SUNSET(2026-08-15): reads the legacy .show-repo.json name. Remove once
// consumer repos are migrated to .web-tools.json.
```

The marker is one greppable token, `SUNSET(YYYY-MM-DD)`, with the date it can
probably be removed. `scripts/sunset-scan.py` finds them: quiet until a marker's
date passes, then it names the file and line. Wire it warn-only into the commit
hook (as web-tools does) so a due marker resurfaces at commit time; run
`npm run sunset` (or `sunset-scan.py --all`) any time to list upcoming ones.

### Not portable

Web-tools-specific machinery: `docs/loader.md`, `tools/**`, `CLAUDE.md`, `dist/`.
And `docs/MERGE-GUIDE.md` travels only as a *format example*: it belongs to
CONVENTIONS.md's opt-in surfacing course, so a repo keeps one of its own only if
it adopts that layer.

## Pointing a session here

To send another Claude Code session to this set, [`docs/SHARE.md`](SHARE.md) is a
ready-to-paste message that hands over the fetch command itself (a session can't
always reach another repo by git or MCP scope, but a raw HTTP GET of these public
files works). It's the pointer *to* this set, not a member of it.
