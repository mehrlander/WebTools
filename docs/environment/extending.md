# Claude Code extension model

Claude Code supports [skills](https://code.claude.com/docs/en/skills), [subagents](https://code.claude.com/docs/en/sub-agents), [MCP servers](https://code.claude.com/docs/en/mcp), [hooks](https://code.claude.com/docs/en/hooks), [LSP servers](https://code.claude.com/docs/en/plugins-reference#lsp-servers), and [plugins](https://code.claude.com/docs/en/plugins).

This repository uses two hooks:

* A Claude Code `SessionStart` hook that installs repository dependencies.
* A commit-time `build-on-commit.sh` hook that stages deterministic derived artifacts when their sources change. See the [`tools/README.md`](../../tools/README.md#the-refresh-model) refresh model.

**Do not assume the `PreToolUse` hook ran** *(observed 2026-07-25)*. In a Claude Code web session, `git commit` calls completed with `dist/web-tools.js` left stale, while `.claude/hooks/build-on-commit.sh` exited 0 and behaved correctly when piped its JSON payload by hand. So the script is sound and the harness did not invoke it. The failure is silent and the artifact it skips is one nobody reads directly, which is how it goes unnoticed. Until this is understood, run the generator yourself (`npm run build:lib`, `npm run pages-index`) after touching a source it derives from, and verify (`grep -c '<a new symbol>' dist/web-tools.js`) rather than trusting the commit.

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
