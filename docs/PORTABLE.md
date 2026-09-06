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

The machine-readable index of this catalog is [`docs/portable.csv`](portable.csv):
The Web Tools app's **Portable view** renders the set from it (each piece openable in
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
| `/portable:web-tools` | loads the working conventions live (surfacing primitives + the guide-PR course) |
| `/portable:caption` | the surfacing caption, and the guide-PR body sync |
| `/portable:load-skill` | fetch any skill from the [library](../skills/) on demand |
| `/portable:show-repo` | browse any repo and move files across repos |
| `/portable:tree` | render a linked file tree of the repo, table-first for mobile |
| `/portable:tasks` | operate the cross-session project tracker (propose, file, claim, close, assess, refine, regenerate the board), and the filing rules that keep the backlog honest |
| `/portable:repo-review` | read the repo's own state and report what stands out, at three depths (light, deep, sweep) |
| `/portable:in-flight` | check whether a branch, PR, or task is already working on something, and reconcile stale tracker claims |
| `/portable:markers` | what is frozen, stale, or wrong: mark a claim, declare a path in `.paths.json`, inventory both, check that they agree |
| `/portable:sandbox-traps` | the web sandbox's enumerable failures, each of which impersonates a worse one: the test that tells them apart, and the rule. Triggers on the symptom rather than waiting to be asked, since a session hits these while concluding, not while stuck |
| `/portable:content-registry` | the epistemic content registry: classify a repo's artifacts (supplied, mechanical, human-, model-, or hybrid-authored) and their corpus membership in a curated `data/design/content.csv`; scaffold, verify, extract. Bundles `registry.py` the way `tasks` bundles its board generator |
| `/portable:concept-index` | build a repo's declared vocabulary and check a piece of writing against it: which repo files it names without a link, and which terms of art it uses as though the reader already knows them |
| `/portable:drop-link` | mint a link that opens GitHub's new-file form on the working branch with the filename prefilled, so long content lands on the branch without riding through chat context |
| `/portable:edit-review` | hand over an edited file for second-opinion review: stage its before and after into the app's Diff lens, bespoke review prompts riding the link |
| `/portable:file-retrieval` | retrieve files from a configured corpus through a fixed-behavior tool (ranked snippet search, whole-document reads), so retrieval reads the same every run |
| `/portable:scour` | acquisition fan-out: point many agents at the open web to bring back what is said and where, as a corpus rather than a report. Carries the measured constraints (search is the only metered input; lead yield saturates near `n^0.6` within a task; hub pages beat article pages 10x to 93x, predicted by organisational form; naming the null result in the prompt moved unsourced-claim disclosure from 0 of 49 to 32 of 42) and the prior art behind them in a companion `PRIOR-ART.md` (HITS, focused crawling, snowball sampling). Environment numbers live in `docs/environment/capabilities.md` so the two age separately |
| `/portable:gold-set` | measurement fan-out: build a gold set, an independently labeled sample that scores a classifier or extractor for correctness. Blind readers, an adversarial skeptic on every disagreement with a quoted clause on every verdict, a validator each agent runs on its own output, and a scoring script into a dated scorecard; the gold set is precious and the program is untouched until the scorecard says what should change. Environment numbers stay in `docs/environment/capabilities.md` |
| the session recorder | a `Stop` hook that records the session where a checkout declares a `"sessions"` store, and does nothing at all where none does |
| the session dispatcher | a `SessionStart` hook that runs every checkout's own `.claude/hooks/session-*.sh`, in every session, whatever the project root is |
| the PR-subscribe hint | a `PostToolUse` hook on `create_pull_request` that prompts the session to subscribe to the pull request it just opened, carrying the number. Detection is the machinery; the call stays the model's, since no hook can invoke an MCP tool |
| the MCP failure hint | a `PostToolUseFailure` hook that turns an MCP `-32003` approval wall into the `sandbox-traps` connector-vs-builtin diagnosis, at the moment it fires |
| the reading-column guard | a `PreToolUse` hook on `Edit`, `Write` and `MultiEdit` that refuses a class narrowing text to a reading column (daisy-alpine rule 3). It judges the file the edit would produce, not the edit, so a file already carrying one cannot be edited until it is clean. Bundles `reading-column.py`, which is also the `npm run reading-column` scanner |

That is the whole day-to-day set. Everything above the last five rows is invoked;
those five are not. **They are the pieces that run on their own**, which is why
they ship in the plugin rather than being installed per repo: the per-container
settings file they would otherwise live in is provisioned fresh each session, so
a hand-installed copy works for exactly one session and then vanishes.

The recorder is inert without a store, costing one `grep` before it exits, and
it holds no knowledge of the record format. Mechanism, measurements, and the
declaration it looks for:
[environment/extending.md](environment/extending.md#stop-the-session-recorder).

### The session dispatcher

The harness has no glob for session-start scripts. `npm test` finds its whole
suite from `tools/test/**/*.test.mjs`, and git finds its hooks from a folder
once `core.hooksPath` is set, but a Claude Code hook has to be named
individually in `.claude/settings.json`, and that file is read **only when the
session's project root is that repo**. A session spanning several checkouts has
its root above all of them, so none of their session hooks fire, and nothing
reports it. Measured 2026-07-31: a session rooted at `/home/user` ran none of
the four `SessionStart` hooks a checkout below it had registered.

The dispatcher supplies the missing glob at the one layer that can. The plugin
registers it once, at user scope, for every session; discovery is then by
filename, the same contract the test suite already uses:

```
.claude/hooks/session-*.sh   ->  runs at session start
anything else in that folder ->  ignored
```

So a repo adopts it by **naming a file**, with nothing declared anywhere, and
opts a script out the same way, by calling it something else. web-tools' own
`session-start.sh` is picked up and its `build-on-commit.sh` is not, exactly as
`tools/test/bootstrap.mjs` stays out of `node --test`. The name is the whole
declaration, which is why the executable bit is not also required: a lost mode
bit should not quietly turn a script off.

Each script runs with its own checkout as both cwd and `CLAUDE_PROJECT_DIR`, so
a script already written for `.claude/settings.json` moves under the dispatcher
unchanged. Scripts run in parallel under a per-script timeout, so the wall clock
is the slowest one rather than the sum, and a script that hangs is stopped and
named instead of holding the session open. The budget defaults to 120s
(`WEB_TOOLS_SESSION_BUDGET` overrides it), matching the longest internal timeout
the existing scripts already set for themselves, so adopting the dispatcher does
not change what any repo was already willing to wait for.

**Adopting it is a migration, not an addition.** The dispatcher replaces the
declaration mechanism rather than sitting beside it, so a repo renames its
scripts to `session-*.sh` **and drops the `SessionStart` block from its own
`.claude/settings.json`**. Keeping both means each script runs twice whenever
that repo is the project root; keep the `settings.json` entry only where a repo
disables the plugin and so has no dispatcher at all. Parallel execution is the
other thing a migration has to look at: entries that were an ordered list in
`settings.json` no longer have an order, so a script depending on an earlier one
has to do that work itself. home's `session-news-fetch.sh` sets `core.hooksPath`
rather than assuming `session-git-config.sh` won the race.

An inline command has no filename, so it cannot be discovered and needs a file
of its own. That is not a technicality: home's `SessionStart` carried a bare
`git config core.hooksPath .githooks`, and it was the entry whose silent absence
actually cost something, leaving the repo's pre-commit lint and size guard off
for any session rooted above it.

Both mistakes are reported rather than left silent. When a checkout's
`.claude/settings.json` still declares `SessionStart`, the dispatcher says so at
session start, naming which case it is: no `session-*.sh` to discover (so
nothing of that repo's ran) or scripts present alongside the declaration (so they
double-run at that root). The check keys on the repo's own `SessionStart`
declaration, not on an empty hooks folder, because a repo whose only hook is
`PreToolUse` is correct rather than misconfigured.

The dispatcher bounds what a script costs; it does not police it, any more than
`node --test` polices a slow test. **Keeping session start cheap is the script's
job**, and the convention is: gate on file reads, and do expensive work only
when the gate says it is due. A repo whose script genuinely needs minutes should
background it rather than hold the session open.

Every dispatched script gets **`$WEB_TOOLS_HOOKS`**, the directory the plugin's
own hooks live in, so a repo can call something the plugin ships without knowing
where the cache put it or which commit it is pinned at. There is one such script
today, and it is the reason the variable exists.

### Injecting the conventions, with no fetch

The plugin carries the hub's own `CONVENTIONS.md` and `SURFACING.md`, beside the
loader skill that names them, and ships
[`inject-conventions.sh`](../.claude/skills/hooks/inject-conventions.sh) to emit
them into session context. A repo opts in with one line:

```bash
# .claude/hooks/session-conventions.sh
exec bash "$WEB_TOOLS_HOOKS/inject-conventions.sh"
```

That is the whole adoption. Two file reads, no network, no `curl`, no `jq`, and
no interpreter that can be missing, which retires the sharp edge the fetch-based
variant below has to warn about. Freshness rides `claude plugin update`, the
mechanism that already repeats every container; a fetch per session bought
nothing an update does not, at the cost of a round trip at every start.

It is **not** registered as a hook in its own right, and that is the point of
routing it through the dispatcher. Injection puts the full conventions into
every session unconditionally, which is right for a repo whose `CLAUDE.md`
deliberately does not restate them and wrong for a repo that just wants the
skills. Naming a file is the opt-in; deleting it is the opt-out.

The vendored copies are a derived artifact, so they have the two owners this
repo gives every derived artifact: `.claude/hooks/build-on-commit.sh` refreshes
and stages them in the same commit that touches `docs/`, and
[`tools/test/derived-artifacts.test.mjs`](../tools/test/derived-artifacts.test.mjs)
fails if they fall behind, for the sessions where the hook never fires. A stale
copy is the failure worth guarding: it injects confidently and governs the
session with last month's rules.

One script rides inside the plugin: the board
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
| `checks` | show-repo | declared staleness checks, evaluated on sight and surfaced only when failing: in a repo's sidebar **Needs attention** block, and as badges on its estate card. Five kinds, each answerable from the API alone; nothing here runs code, so anything needing execution stays in a test suite |
| `stage` | show-repo | `{ files, targets }`: a durable staged-files list and default transfer destinations |
| `conventions` | session-start nudge | `"optout"` marks a repo that has deliberately not adopted the conventions, so the nudge stops asking |
| `sessions` | the plugin's `Stop` hook | path to the directory holding this repo's session records and their `tools/`, which makes this repo the store the recorder writes to. Declaring it is what turns recording on; at most one checkout in a session should carry it |

Full field semantics for the show-repo fields are in [`docs/show-repo.md`](show-repo.md).

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

Being fail-soft, it degrades to "no auto-loaded conventions this session" rather
than a blocked start. Keep it **synchronous** (the default) so it completes
before skill discovery and the freshly-fetched skill is live in the *same*
session, not the next one. To add a new portable script, add one `fetch` line.
This is a recipe for *consuming* repos; web-tools is the source and doesn't run
it on itself.

### Stronger variant: inject the conventions, don't just fetch them

> [!NOTE]
> **With the plugin, this is one line and no network.** The plugin vendors both
> docs and ships the injector; a repo opts in by dropping
> `exec bash "$WEB_TOOLS_HOOKS/inject-conventions.sh"` into
> `.claude/hooks/session-conventions.sh`. See
> [the session dispatcher](#injecting-the-conventions-with-no-fetch) above. What
> follows is the **no-plugin fallback**, for a host where the marketplace is not
> available.

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
| [`docs/CONVENTIONS.md`](CONVENTIONS.md) | the general-behavior **hub**: prose style, standing decisions, leave-it-nicer, keep-focus, and the session / repository / workstream scope vocabulary. Behavior that applies regardless of whether anything is being surfaced | fetched live by the skill |
| [`docs/SURFACING.md`](SURFACING.md) | the **surfacing system**, split out of CONVENTIONS.md: the universal **surfacing primitives** (the **surfacing caption**'s `[new]/[main]/[diff]` file links plus a 🥏 render line, reference-is-a-link, show-pixels, branch anchor, 🧭 guide pointer, session diff) plus the **surfacing course** (guide-PR lifecycle, wrap-up, handoff), which stays idle until you open a PR. Loaded with CONVENTIONS.md as one set | fetched live by the skill |
| [`docs/venues.md`](venues.md) | the **venue map**: where work can run besides the session reading it (local CLI, Cowork, Dispatch, hosted and self-hosted runners, a Remote environment), what each reaches, and the attended-versus-unattended split that decides where a job belongs. Named in one always-loaded paragraph of CONVENTIONS.md, because a session cannot see past its own sandbox and so does not know to ask | fetched live by the skill |
| [`.claude/skills/load-skill/SKILL.md`](../.claude/skills/load-skill/SKILL.md) | `/load-skill`: fetch a named skill from the library at [`skills/`](../skills/) (or another declared source) and apply it in the current session; discovery via `skills/manifest.csv`. Explicit signal only, never opportunistic | install or hook-fetch |
| [`.claude/skills/show-repo/SKILL.md`](../.claude/skills/show-repo/SKILL.md) | `/show-repo`: use the hosted show-repo shell to browse any repo, mint a 🗂️ `#stage=` fileset link, run a cross-repo transfer, or author a repo's `.web-tools.json`; loads [`docs/show-repo.md`](show-repo.md) | install or hook-fetch |
| [`.claude/skills/in-flight/SKILL.md`](../.claude/skills/in-flight/SKILL.md) | `/in-flight`: before starting work, report which branches carry commits the base branch lacks, which open PRs and [`docs/TRACKER.md`](TRACKER.md) claims sit on them, and which claims have gone stale; `--paths` turns it into a collision check on the files about to change. Runs [`.claude/skills/in-flight/in-flight.py`](../.claude/skills/in-flight/in-flight.py) | install or hook-fetch |
| [`.claude/skills/markers/SKILL.md`](../.claude/skills/markers/SKILL.md) | `/markers`: the status system from [`docs/CONVENTIONS.md`](CONVENTIONS.md#status-frozen-stale-wrong). Mark a claim `Frozen`/`Stale`/`Wrong` in prose, declare a path frozen in a cascading `.paths.json`, inventory both across a repo, and check that arrow targets resolve and frozen files say so where they are read. Runs [`.claude/skills/markers/status.py`](../.claude/skills/markers/status.py) | install or hook-fetch |
| [`.claude/skills/tasks/SKILL.md`](../.claude/skills/tasks/SKILL.md) | `/tasks`: operate the project tracker (propose and file, claim, update, close a task; assess the tracker as a whole; refine it back to scope truth; regenerate `board.md`) per the [`docs/TRACKER.md`](TRACKER.md) schema and the commit-to-`main` rule. Owns the **filing rules**: the bar, the propose-first gate, and the rule against fragmenting one outcome across several tasks | install or hook-fetch |
| [`.claude/skills/repo-review/SKILL.md`](../.claude/skills/repo-review/SKILL.md) | `/repo-review`: read a repo's own state and report what stands out, at one of three depths (light everyday read, deep on-demand audit, parallel sweep fan-out). Probes before impressions; every depth ends in a written report rather than a pile of tracker tasks. Probes, layers, lenses, and destinations are declared per repo in its `CLAUDE.md` | install or hook-fetch |
| [`.claude/skills/tree/SKILL.md`](../.claude/skills/tree/SKILL.md) | `/tree`: render a repo or subtree as a linked markdown table (code-span box art or braille indent, filetype icons, optional gloss); generated by [`scripts/build-tree.py`](../scripts/build-tree.py) | install or hook-fetch |
| [`.claude/skills/sandbox-traps/SKILL.md`](../.claude/skills/sandbox-traps/SKILL.md) | `/sandbox-traps`: the web sandbox's enumerable failures, each of which impersonates a worse one, with the test that tells them apart and the rule. Triggers on the symptom rather than waiting to be asked | install or hook-fetch |
| [`.claude/skills/content-registry/SKILL.md`](../.claude/skills/content-registry/SKILL.md) | `/content-registry`: the epistemic content registry (`data/design/content.csv`): classify what each artifact is and which corpora it belongs to; scaffold, verify, extract. Bundles its `registry.py` | install or hook-fetch |
| [`.claude/skills/concept-index/SKILL.md`](../.claude/skills/concept-index/SKILL.md) | `/concept-index`: build a repo's declared vocabulary and check a piece of writing against it (unlinked file names, terms of art used as if already known). Runs its bundled `vocab.py` | install or hook-fetch |
| [`.claude/skills/drop-link/SKILL.md`](../.claude/skills/drop-link/SKILL.md) | `/drop-link`: mint a link opening GitHub's new-file form on the working branch with the filename prefilled, so long pasted content lands on the branch instead of riding through chat context | install or hook-fetch |
| [`.claude/skills/edit-review/SKILL.md`](../.claude/skills/edit-review/SKILL.md) | `/edit-review`: hand over an edited file for independent review by staging its before and after into show-repo's Diff lens, with bespoke review prompts encoded on the link | install or hook-fetch |
| [`.claude/skills/file-retrieval/SKILL.md`](../.claude/skills/file-retrieval/SKILL.md) | `/file-retrieval`: retrieve files from a configured corpus through a fixed-behavior tool (`corpus_search.py` for ranked snippets, `read_doc.py` for whole documents), one auditable command per retrieval | install or hook-fetch |
| [`.claude/skills/scour/SKILL.md`](../.claude/skills/scour/SKILL.md) | `/scour`: acquisition fan-out, sending agents to bring back source material that does not exist locally and mapping who says what about a subject across the open web. Carries the measured constraints (search is the metered input, lead yield saturates near `n^0.6` within a task, hub pages beat article pages by 10x to 93x predicted by organisational form) and the prior art in a bundled `PRIOR-ART.md`; environment numbers stay in [`docs/environment/capabilities.md`](environment/capabilities.md) so the two age separately | install or hook-fetch |
| [`.claude/skills/gold-set/SKILL.md`](../.claude/skills/gold-set/SKILL.md) | `/gold-set`: measurement fan-out, building an independently labeled sample that scores a classifier or extractor for correctness: a scripted join and seeded stratified sample, blind readers, an adversarial skeptic with the parent context the readers lacked, and a scoring script into a dated scorecard whose figures block regenerates from the CSV. Worked example in budget-wa's proviso gold set; environment numbers stay in [`docs/environment/capabilities.md`](environment/capabilities.md) | install or hook-fetch |
| [`docs/markdown-in-chat.md`](markdown-in-chat.md) | working visually with markdown in a **chat client** (mobile): why nested bullets balloon and tables beat them, which characters survive a table-cell trim, and the file-tree formats that fall out. Companion to [`docs/github/markdown.md`](github/markdown.md) (GitHub's static renderer) | fetch when relevant |
| [`skills/`](../skills/) | the skill **library**: 34 personal skills published as static resources (not registered anywhere); the default source `load-skill` pulls from | fetched per skill by load-skill |
| [`docs/TRACKER.md`](TRACKER.md) | opt-in **project tracker**: cross-session work-tracking, one file per task under `tasks/` plus a generated `board.md`, the slow layer where the plan lives between sessions. Independent of the primitives and the course | fetch when adopting |
| [`docs/CONSTELLATION.md`](CONSTELLATION.md) | the portable **kernel** of the what-goes-where doctrine: the ephemeral-clone constraint, commit discipline, visibility forces repo boundaries, conventions pull from a public hub, bootstrapping equals staying-in-sync, the repo owns its own scope, and documentation has four places with everything else a residual. The theory show-repo's **Map** view applies; the full worked instance stays in the private `home` repo | fetch when relevant |
| [`docs/HTML-STYLE.md`](HTML-STYLE.md) | the **name the style guide is asked for**, pointing at the rules, which live in the `daisy-alpine` skill so they are present when it fires unprompted on page work. No stat cards, no explanatory prose on the page, browsing is a full-viewport takeover, type sized for reading. The composition rules the [daisy-alpine skill](../skills/daisy-alpine/SKILL.md) carries in short form and points here for in full | fetch when building a page |
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
| [`scripts/declared-paths.py`](../scripts/declared-paths.py) | check the addresses a repo publishes about itself in `.web-tools.json` (`landing`, `pages[].path`, `stage.files`), which no link scan can see because they are not markdown. Local paths and `owner/repo[@ref]:path` both resolve, the second against a sibling checkout, and an absent checkout reports as *unverifiable*. `stage.targets` is deliberately unchecked, being a deposit destination rather than an artifact. The point is that it belongs to the **mover**: a repo fails its own suite when it moves something it told the world about, which a consumer can only discover afterwards | `python3 declared-paths.py [ROOT] [--check] [--quiet]` |
| [`scripts/dead-links.py`](../scripts/dead-links.py) | report markdown links that no longer resolve, in three classes: internal, cross-repo (a relative path escaping the repo root into a sibling checkout, which never resolves on github.com), and dead owner URLs at main in either the `github.com/OWNER/REPO/blob` or the `raw.githubusercontent.com/OWNER/REPO/main` form. Owner URLs are also scanned BARE, inside fences and inline code, since a `curl` of a raw URL is a fetch target rather than an illustration and is where a rename does its quietest damage. A link into an absent checkout reports as *unverifiable*, never dead. `--check` gates the cross-repo classes for a verify suite; the internal class is never gated, since a target may have been retired on purpose | `python3 dead-links.py [ROOT] [--owner N] [--cross-repo] [--check]` |
| [`scripts/sunset-scan.py`](../scripts/sunset-scan.py) | report `SUNSET(YYYY-MM-DD)` markers now due for removal (see Sunset markers below); quiet unless something is due, `--all` lists upcoming, `--strict` exits non-zero when due | `python3 sunset-scan.py [--all] [--strict] [root]` |
| [`scripts/unclaimed-code.py`](../scripts/unclaimed-code.py) | report code files that nothing in the repo names, per directory, with two independent signals: named in prose (any `.md`, a docs registry, `CLAUDE.md`, a skill) and exercised by a test. The layer table is the point of the run, since one unnamed file is noise and a column of them is a category nobody has stated. Scope it to the trees you maintain: unscoped it also reports archives and vendored shelves, which are unnamed on purpose. Advisory, never gates, always exits 0 | `python3 unclaimed-code.py [--all] [--ext E] [--root D] [prefix …]` |
| [`scripts/doc-placement.py`](../scripts/doc-placement.py) | count the four documentation slots CONSTELLATION.md names (`docs/` at a workspace root, a folder's `README.md`, a reference beside the files it describes, the agent contract) and list the residual by directory. It sorts on basename shape, which cannot separate the third slot from a file that drifted, so the directory rows carry what else is there and the reader decides: eight capitalised documents beside sixteen CSVs is a data-design folder documenting itself, one beside nothing is a document with nowhere to be. Takes repo paths, so it reads a whole estate in one run. Advisory, never gates, always exits 0 | `python3 doc-placement.py [--list] [repo …]` |
| [`scripts/embedded-prose.py`](../scripts/embedded-prose.py) | count the natural language living inside `.js` and `.html`, split three ways by who the reader is: **commentary** (a comment block, coalescing a `//` run into the one block a person wrote), **text-table** (an object literal whose values are prose, which is content with no data carrier), and **inline** (reader-facing sentences hardcoded in markup or a template). Comments cannot be found with a regex here and the failure is not theoretical, so it walks the source respecting strings, template literals, and regex literals: a glob like `surfaces/*.surface` inside a line comment otherwise opens a block comment that closes 168 KB later. `--weight` adds the gzipped transfer cost of the commentary. Advisory and exits 0, except `--check N` which fails on a comment block over N words. Findings and the proposed carrier: [`docs/text-content.md`](text-content.md) | `python3 embedded-prose.py [ROOT] [prefix …] [--blocks] [--tables] [--inline] [--csv] [--min N] [--check N] [--weight]` |
| [`scripts/stranded-titles.py`](../scripts/stranded-titles.py) | report meaning that lives only in a `title` attribute, which the house style rules against. Three verdicts: **reachable** (the element or an ancestor is a link or a button, so a tap gets there anyway), **echo** (the title repeats or un-truncates the element's own `x-text`), and **stranded**, the only class worth reading. It keeps a tag stack rather than walking back to the nearest `<`, which is not fussiness: a `<span title=…>` inside a `<button>` is reachable, and `<` occurs inside attribute values (`:disabled="i <= 0"`), so the two hand-written passes that preceded it reported 88 and then 37 against a true 32. Advisory, never gates, always exits 0 | `python3 stranded-titles.py [PATH …] [--all]` |
| [`scripts/mcp-link-safe.py`](../scripts/mcp-link-safe.py) | report markdown links the GitHub MCP write path would defang before a PR body or issue comment is written. The trigger is length and only length: a URL of 150 characters or more inside a markdown link is wrapped in backticks and stored as dead literal text, 149 or fewer survives, and the label never counts. The case worth a tool rather than a rule of thumb is the surfacing caption's slash-joined pair: `)/[` does not end the URL token, so the measured span runs from the first URL's first character through the second URL's last with the joining punctuation and the second label inside it, and two clean 70-character links make one 149-character span that a single further character kills. Comma-joining ends the run. `--check` gates; `--unescape-entities` is for a body read BACK through the MCP, whose readback expands `&` into `&amp;` and inflates the count. Every threshold it encodes was written to GitHub and read back (issue #498, PR #499); the evidence is in [`docs/environment/capabilities.md`](environment/capabilities.md) | `python3 mcp-link-safe.py PATH… [--check] [--json] [--unescape-entities]` |
| [`scripts/showing.py`](../scripts/showing.py) | decide which render link, if any, shows what a branch changed, and print it ready to paste. Executes the rules already stated as data in `docs/routes.json`'s `showing.picker` and `docs/showing-mechanisms.csv`: lib or dist → ⭐ `?use=`; a page's own file → 🥏 toss; the renderer → a nested toss; a shell change touching the top-level document (title, favicon, history, navigation) → no link, send a screenshot. Also checks the two things that fail silently: the SHA it names is pushed, and `dist/` was rebuilt so `?use=` carries the change. It exists because the table was complete and rendered and a session still got the call wrong, never having opened it; reading cannot fix a failure whose first symptom is confidence. A repo that serves no pages declares `"showing": {"hosted": false}` in `.web-tools.json` and gets the toss forms instead | `python3 showing.py [--base REF] [--json] [--files a,b]` |
| [`scripts/dead-opacity.py`](../scripts/dead-opacity.py) | report a daisyUI theme colour carrying an opacity step that generates no CSS rule, which the house style rules against. The ramp daisyUI ships is 10 through 90 by tens; every other step, both ends, and the bracket form (`/[25%]`) fall back, a background to transparent and TEXT to full strength, so the thing meant to recede advances and nothing errors. Stock palette colours are compiled by the browser build, take any step, and are never reported: a scan written to the looser "use tens" rule flags working markup, which is why the theme-colour list is the whole classifier. Unlike its advisory siblings this one gates, since there is no judgment in it | `python3 dead-opacity.py [PATH …] [--check]` |
| [`scripts/text-carriers.py`](../scripts/text-carriers.py) | the companion to `embedded-prose.py`, looking at the text that DID reach a data file and asking whether the carrier is in any shape to be relied on. Finds every prose-bearing CSV column and JSON key, splits supplied source material from the repo's own voice (reading `data/design/content.csv` where one exists), and reports which carriers nothing in the repo names. The field-name tally is the point of the run: one concept called `note` in one carrier, `basis` in the next and `why` in a third means nobody can ask the repo for its authored rationale and get an answer, and an unstated vocabulary is the honest measure of how organized the carriers are. Checks names against the estate vocabulary in [`docs/text-fields.csv`](text-fields.csv), resolved beside the script so a repo that fetches one gets both. `--markdown` also reads GFM tables, whose headers report as `label` and are never gated: a table header is a phrase for a reader, not a field name a tool reads. `--check` gates two classes and only two, an authored carrier nothing names and a field name nothing accounts for; an ALIAS passes, since the vocabulary states what the old name means and a carrier conforms by declaration rather than by rename | `python3 text-carriers.py [ROOT] [prefix …] [--fields] [--carriers] [--undeclared] [--offvocab] [--markdown] [--vocab P] [--csv] [--min N] [--check]` |
| [`scripts/build-tree.py`](../scripts/build-tree.py) | render a repo tree as a linked markdown table for chat (code-span box art, braille indent, or plain ascii); tracked-only by default, gloss column left to fill by hand | `python3 build-tree.py <root> [--repo o/r] [--ref R] [--depth N] [--mode M] [--gloss]` |
| [`scripts/ocr-pdf.py`](../scripts/ocr-pdf.py) | OCR a scanned PDF and report how far to trust it: per-page word confidence from tesseract's TSV, and pages that already carry a text layer passed through untouched unless `--force`. Needs the system binaries `tesseract-ocr` and `poppler-utils`, absent from a fresh sandbox | `python3 ocr-pdf.py <pdf> [-o out.txt] [--report r.json] [--dpi N] [--lang L] [--force]` |
| [`scripts/page-strips.py`](../scripts/page-strips.py) | render a PDF page as overlapping horizontal strips a vision model can actually read. The constraint is the harness's roughly 2000 px display cap, not scan resolution: a whole 300 DPI landscape page arrives downscaled past the point where thousands commas survive, while a strip of it keeps full density because the cap applies to the strip's width. The 12% overlap is not a nicety, since without it a reader loses the rows nearest every cut and loses them silently. The companion to `ocr-pdf.py`, and the one to reach for when the mechanical reading is the thing in dispute; PyMuPDF only, no system binaries | `python3 page-strips.py <pdf> [-p N] [-o DIR] [--strips N] [--overlap F] [--width PX] [--stem S]` |

Fetching and running a script is executing hub code, a step beyond fetching and
reading a doc. That is why the hub must stay owned and trusted and the fetch stays
fail-soft: a consumer can audit the script at its raw URL, but there is no
signature or pinning beyond trusting the source repo.

### Sunset markers

Code kept only for backward compatibility (a legacy-name read fallback, a
migration shim) is tagged with a dated marker so it gets removed rather than
lingering:

```js
// SUNSET(2027-01-01): reads the old manifest name too. Remove once consumer
// repos are migrated to the new one.
```

The marker is one greppable token, `SUNSET(YYYY-MM-DD)`, with the date it can
probably be removed. `scripts/sunset-scan.py` finds them: quiet until a marker's
date passes, then it names the file and line. Wire it warn-only into the commit
hook (as web-tools does) so a due marker resurfaces at commit time; run
`npm run sunset` (or `sunset-scan.py --all`) any time to list upcoming ones.
Generated output is skipped even when it is tracked (`dist/` and the rest of
`SKIP_DIRS`), since a marker in a build artifact is a copy of the one in its
source and reporting both doubles the count against a bundled line thousands of
characters wide.

**Prose about a marker that has already been removed spells the date out rather
than writing the token**, since a record of a retired marker would otherwise scan
as a live one.

### Not portable

Web-tools-specific machinery: `docs/loader.md`, `tools/**`, `CLAUDE.md`, `dist/`.
