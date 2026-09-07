# Environment

What the Claude Code **web environment** is, what it can do, and how it's
extended — split by concern so each page answers one question.

- **[container.md](container.md)** — what the box *is* and what carries across
  sessions: the ephemeral container, the baked-image working tree, resource
  ceilings, and the provenance of state (what persists, what's isolated).
- **[capabilities.md](capabilities.md)** — what the box can *run* and *reach*:
  the toolchain, git transport, network egress, the pre-installed Chromium, and
  the session and subagent mechanics. The lookup you consult when you hit a
  wall. What the **GitHub MCP layer** does to a call and its text moved to
  [`../github/mcp.md`](../github/mcp.md) on 2026-09-07, having grown to half
  this file; look there before adding GitHub-API behavior here.
- **[testing.md](testing.md)** — the sensible way to *test* HTML/JS here:
  choosing the lightest tool that proves the thing, driving Chromium for
  screenshots, rendering a repo page, and the jsdom + Alpine logic recipe.
- **[extending.md](extending.md)** — how Claude Code itself is extended: the
  component model (skills, agents, MCP, hooks, plugins, LSP) and the hooks this
  repo actually runs (the SessionStart install hook).

## Updating these docs

- These are the **single source of truth** for the environment. Don't spawn a
  parallel capabilities doc; edit these.
- Keep them **succinct**: the key facts, not a transcript.
- **Date every claim** (`*(verified YYYY-MM-DD)*`) in `container.md`,
  `capabilities.md`, and `testing.md` — the sandbox shifts under us. When a
  finding changes, **edit it in place** and update the date. Don't stack stale
  entries; git holds the history. (`extending.md` is mostly stable conceptual
  knowledge, so it isn't dated the same way; date only its repo-specific
  inventory.)
- Prefer a **re-runnable probe** over a bare assertion, and observe facts
  directly (`ls` the path, read the env, inspect the header) rather than
  inferring them from a status code or a failed command. See the probing
  discipline at the top of [capabilities.md](capabilities.md).
