# Claude Code extension model

Claude Code supports [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents), [MCP servers](https://code.claude.com/docs/en/mcp), [hooks](https://code.claude.com/docs/en/hooks), [LSP servers](https://code.claude.com/docs/en/plugins-reference#lsp-servers), and [plugins](https://code.claude.com/docs/en/plugins).

This repository uses two hooks and ships a third:

* A Claude Code `SessionStart` hook that installs repository dependencies.
* A commit-time `build-on-commit.sh` hook that stages deterministic derived artifacts when their sources change. See the [`tools/README.md`](../../tools/README.md#the-refresh-model) refresh model.
* A `Stop` hook carried by the `portable` plugin, which records the session where a checkout declares a store. It runs in every session that installs the plugin, not only in sessions on this repo, which is the point of putting it there. See [Stop: the session recorder](#stop-the-session-recorder) below.

**Do not assume the `PreToolUse` hook ran** *(observed 2026-07-25, cause found 2026-07-27)*. `git commit` calls completed with `dist/web-tools.js` left stale, while `.claude/hooks/build-on-commit.sh` exited 0 and behaved correctly when piped its JSON payload by hand. The script was sound and the harness did not invoke it.

The cause is **where the session's project root sits**, which is not something this repository controls. A session can open with the repo one level *below* the root: primary working directory `/home/user`, repo at `/home/user/web-tools`, arriving as an additional directory. Claude Code then reads project settings from `/home/user/.claude/settings.json`, which does not exist, so this repo's `.claude/settings.json` is never loaded and none of its hooks are registered. Confirmed three ways: the session transcript is written to `~/.claude/projects/-home-user/`, naming the root; `/home/user/.claude/` is absent; and a probe at line 1 of the hook script never wrote its log, for a `$CLAUDE_PROJECT_DIR`-relative command and an absolute one alike. Repo-side settings edits cannot reach it, because the file holding them is the file that is not read. The tell is cheap: `ls ~/.claude/projects/` names the root the session is using.

Two consequences worth carrying. Any repo whose hooks matter has to treat them as best-effort, not as a guarantee. And a silent guarantee needs a backstop that does not depend on the harness: `tools/test/artifacts-lockstep.test.mjs` re-runs the generators in `--check` mode inside `npm test`, so a stale artifact fails the suite wherever it is run. Regenerating by hand (`npm run build:lib`, `npm run pages-index`) after touching a source is still the fast path; the test is what makes forgetting loud.

## Components

### Skills

A [skill](https://code.claude.com/docs/en/skills) is a directory containing a `SKILL.md` file and optional supporting files. Its description is included in the available-skills listing. Its full contents are loaded when invoked.

Skills may be invoked automatically or explicitly as `/name`. Files under `.claude/commands/` remain supported and are handled as skills, but new extensions should use `.claude/skills/`.

[`CLAUDE.md`](https://code.claude.com/docs/en/memory) contains persistent project instructions loaded at session start.

### Subagents

A [subagent](https://code.claude.com/docs/en/sub-agents) is a separate Claude instance with its own context window, system prompt, tools, and permissions. It receives a bounded task and returns its result to the main session.

### MCP servers

[MCP servers](https://code.claude.com/docs/en/mcp) provide access to external tools and data sources such as APIs, databases, calendars, and issue trackers.

MCP tool definitions consume context. Claude Code can defer loading them through MCP tool search.

### Hooks

[Hooks](https://code.claude.com/docs/en/hooks) run configured actions at Claude Code lifecycle events.

[`SessionStart`](https://code.claude.com/docs/en/hooks#sessionstart) fires at startup, resume, clear, and compaction. Other events cover tool use, file changes, subagents, notifications, and session termination.

#### SessionStart dependency install

`.claude/settings.json` registers `.claude/hooks/session-start.sh` as a `SessionStart` hook.

The script:

1. Exits unless `CLAUDE_CODE_REMOTE=true`.
2. Reads `devDependencies` from `package.json`.
3. Exits if each dependency has a corresponding `node_modules/<package>` directory.
4. Otherwise runs `npm install`.

[`CLAUDE_CODE_REMOTE`](https://code.claude.com/docs/en/env-vars) is set to `true` in Claude Code cloud sessions. The check prevents the hook from installing dependencies in local sessions.

The packages are repository `devDependencies`. They are declared in `package.json` and installed by the hook. They are not supplied as part of the Claude Code environment.

`jsdom`, `alpinejs`, `fake-indexeddb`, and `idb-keyval` support browser-logic tests under Node. `playwright` drives the Chromium installation supplied by the web environment. It is pinned to `1.56.0` to match that browser build. See [capabilities.md](capabilities.md).

The remaining packages are local copies of libraries used by the pages at runtime: `@tailwindcss/browser`, `@tailwindcss/typography`, `daisyui`, `@phosphor-icons/web`, `@alpinejs/collapse`, and `@alpinejs/sort`. The render tools use these copies in place of CDN requests.

The dependencies support:

* `npm run preview <page-path>` through `tools/render/preview.mjs`.
* `npm run shot`, `build`, `bake`, and `verify-build`.
* jsdom and Alpine logic tests.

The preview harness runs the page under jsdom, executes the `gh.load` chain, mounts Alpine, and reports mounted components. Because jsdom does not run module scripts or dynamic imports, the harness rewrites the boot block as an async IIFE and shims the `gh-api.js` import. Failure to mount `kits/cm6.js` is reported but nonfatal. Pixel verification uses `npm run shot`.

The render tools serve the working tree over loopback and replace CDN requests with files from `node_modules`.

The hook runs synchronously. `npm install` requires package-registry access. Claude Code's default [Trusted network configuration](https://code.claude.com/docs/en/claude-code-on-the-web#network-access-and-security) permits access to npm and other common package registries.

A fresh web session normally runs the installation. A resumed session may reuse the existing `node_modules` directory.

A cloud [setup script](https://code.claude.com/docs/en/claude-code-on-the-web#environment-caching) is the cached alternative. Claude Code runs the setup script when building an environment snapshot and reuses the resulting filesystem in later sessions. Repository hooks remain in source control and run at their configured lifecycle events.

The hook applies only to sessions using a branch that contains its configuration.

#### Stop: the session recorder

*Added 2026-07-30.* The `portable` plugin declares a [`Stop`](https://code.claude.com/docs/en/hooks) hook in [`.claude/skills/hooks/hooks.json`](../../.claude/skills/hooks/hooks.json), running [`.claude/skills/hooks/session-record.sh`](../../.claude/skills/hooks/session-record.sh). A marketplace plugin entry accepts any plugin-manifest field, so the entry declares `"hooks": "./hooks/hooks.json"` relative to its `source`; the path is also the default discovery location.

**The distribution channel is the whole point, and the alternative was measured failing.** `mehrlander/web-tools-private` holds a session recorder that writes one JSON record per session. Its own installer writes `~/.claude/settings.json`, correctly avoiding a repo hook for the project-root reason above. But that file is provisioned fresh for every container, carrying the account's marketplace and plugin configuration and nothing else, so a hand-installed hook survives exactly as long as the container. On 2026-07-30 the store held one record, dated 2026-07-29, the session that built the recorder. At least four other sessions ran that day and merged pull requests; none was recorded, and nothing reported the gap. The installed-by-hand hook records the session that installs it and no other.

A plugin install is the only channel that repeats, because the platform performs it at session start. That makes plugin-shipped hooks the right home for anything that must run in *every* session rather than in one repo's sessions.

**Finding the target without naming it.** The hook holds no repo name and no knowledge of the record format. A checkout whose `.web-tools.json` declares `"sessions": "<dir>"` owns the store, and `<store>/tools/on-stop.sh` does the recording and publishing, so the store can change its schema without a plugin release. Discovery is a bounded candidate list, since this runs on every turn: the project root, its children, and its siblings, which are the three shapes a session takes (root above the checkouts, root is the store, root is one checkout beside the store). `SESSIONS_STORE` names a store directly and skips the search.

**Cost, since it fires on every turn of every session.** No store checked out means one `grep` over whatever manifests exist, measured at 10 ms, then exit. With a store, the delegate parses the transcript, measured at roughly 100 ms on a 400 KB transcript and growing with session length. Every path exits 0: a logger that cannot find its store is an ordinary state, not an error to report into someone's session.

Two states are deliberately quiet rather than loud. A checkout can declare the store on a branch that predates the tooling, so a declaration whose `tools/on-stop.sh` is absent is declined rather than reported. And a malformed manifest is skipped, not raised.

Coverage is [`tools/test/session-record-hook.test.mjs`](../../tools/test/session-record-hook.test.mjs): the three discovery shapes, byte-identical payload hand-off, the quiet paths, the override, and the assertion that the plugin still declares the hook. A script present on disk but not wired to the loader is the failure this change exists to fix, so that last one is not ceremony.

**Two things measured while wiring it, both worth knowing before trusting a plugin hook.**

`claude plugin validate` does not read the hooks file. It passed `--strict` with `"hooks"` pointing at a nonexistent path, and passed again with valid JSON of the wrong shape (`"Stop": "not-an-array"`) at the real path. So a passing validation says nothing about whether the hook will load, and the structural check has to live in the repo's own suite. What does report the truth is [`claude plugin details <name>`](https://code.claude.com/docs/en/plugins-reference), which lists the loaded inventory: installing this marketplace from a local path into a scratch `HOME` reported `Hooks (1) Stop (harness-only, no model context cost)` alongside `Skills (9)`. The skill count is the second half of that check, confirming a `hooks/` directory inside the plugin's skills-directory source is not picked up as a tenth skill.

**The delivered copy is not executable.** A plugin is installed by copy into `~/.claude/plugins/cache/<marketplace>/<plugin>/<sha>/`, and the cached files arrive `rw-r--r--`. A hook command written as a bare path would therefore fail on the permission bit, so the declaration invokes the interpreter explicitly (`bash "${CLAUDE_PLUGIN_ROOT}/..."`). Verified by running the cached copy through the declared command line, which recorded a real session.

### LSP servers

[LSP servers](https://code.claude.com/docs/en/plugins-reference#lsp-servers) provide language-aware diagnostics, symbol lookup, references, and code navigation. Claude Code configures them through language-specific plugins. The corresponding language-server executable must be installed in the environment.

### Plugins

A [plugin](https://code.claude.com/docs/en/plugins) is a self-contained package of extension components. It may contain skills, subagents, hooks, MCP servers, LSP servers, monitors, executables, and default settings.

Plugins provide distribution, versioning, installation, and updates. Plugin skills use `/plugin-name:skill-name`.

Plugin skills are namespaced and do not conflict with project or user skills. Ordinary skill precedence is managed, user, then project. Subagent precedence is managed, command-line definition, project, user, then plugin. See [feature layering](https://code.claude.com/docs/en/features-overview#understand-how-features-layer).

## Settings

[`settings.json`](https://code.claude.com/docs/en/settings) configures permissions, environment variables, hooks, model selection, plugins, and MCP servers.

| Scope | Location | Applies to |
| --- | --- | --- |
| Managed | OS policy path (`/etc/claude-code/` on Linux) | Organization or machine |
| User | `~/.claude/settings.json` | User across all projects |
| Project | `.claude/settings.json` | Everyone in the repository |
| Local | `.claude/settings.local.json` | User in this repository |

**Precedence, highest → lowest:** managed → command line → local → project → user.

`permissions` and `hooks` merge across scopes instead of overriding. Precedence otherwise varies by feature: settings prefer project over user; skills prefer user over project.

This setup uses:

- [`.claude/settings.json`](../../.claude/settings.json): denies `AskUserQuestion` and registers the two hooks above.
- `~/.claude/settings.json`: registers the `web-tools` marketplace and enables `portable@web-tools`. *(verified 2026-07-20)*

The Local scope (`.claude/settings.local.json`) is per-user and meant to stay uncommitted, so the repository carries only the project file above.

## Context cost

Skill and agent descriptions consume context even when their full contents are not invoked. Full skill contents enter the conversation when the skill runs and remain there for the session.

The [`claude plugin inspect`](https://code.claude.com/docs/en/plugins-reference#plugin-inspect) command reports the plugin inventory and two cost estimates:

* **Always-on:** listing text included in every session, including skill descriptions, agent descriptions, and command names.
* **On-invoke:** context added when a component runs.

| Component  | Function                                             |
| ---------- | ---------------------------------------------------- |
| Skill      | Instructions and reference material loaded on demand |
| Subagent   | Separate bounded Claude instance                     |
| MCP server | External tools and data                              |
| Hook       | Lifecycle-triggered action                           |
| LSP server | Language diagnostics and navigation                  |
| Plugin     | Installable component package                        |
