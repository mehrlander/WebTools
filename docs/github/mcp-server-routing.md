# Two GitHub MCP servers, one allowlist

*(observed 2026-07-15)*

> [!WARNING]
> **Stale 2026-08-05 → ../environment/capabilities.md:** the operative rule
> moved. A better-evidenced measurement two weeks later (logs, controls, and
> upstream issues) reaches the same move from a different account of the cause,
> and that section is now the one owner. This file stays as the record of what
> was observed on 2026-07-15 and is not rewritten to agree with it.

A session can have more than one GitHub MCP server connected at once, and a
call's approval behavior depends on which one it lands on.

**The situation.** This session ran with the stable server `mcp__github__*` and,
after a mid-session reconnect, a second GitHub server under a UUID name
(`mcp__<uuid>__*`). Both expose the same tools (`create_pull_request`,
`update_pull_request`, and the rest).

**The symptom.** Identical operations behaved differently by server.
`create_pull_request` and `update_pull_request` on `mcp__github__*` ran with no
prompt. `update_pull_request` on the UUID server returned "MCP tool call
requires approval," and approving it did not clear the already-errored call, so
it looked like the approval itself was broken.

**The cause.** The permission allowlist is keyed to the *server name*, not the
tool name. The stable `mcp__github__*` server is on the allowlist; a
freshly-reconnected UUID-named server is not, so the same operation prompts
there. Nothing about the approval flow is broken; the call was simply routed to
an un-allowlisted twin.

**Stale 2026-08-05 → ../environment/capabilities.md:** this paragraph is the
part that was superseded. The later measurement puts the split at built-in
versus connector rather than allowlisted versus not, and reports that
allowlisting the connector's tools was tried upstream and failed, which this
account would not predict. The move below is unaffected.

**The move.** Prefer the stable `mcp__github__*` tools. When a GitHub MCP call
unexpectedly requires approval, do not re-approve on the duplicate: reload the
equivalent stable tool with ToolSearch (`select:mcp__github__<tool>`) and
reissue the call there. In this session the body sync that "required approval"
on the UUID server went through untouched on `mcp__github__update_pull_request`.

**The general heuristic.** The reshuffle that spawns a UUID twin is incidental,
but the routing rule recurs whenever a provider has more than one server
connected: a permission surprise on one server is often a routing problem, not a
permission wall. Check for a sibling server exposing the same tool before
treating the wall as real.

**Why an allowlist is not the fix here.** The originally-configured servers
(`mcp__github__*`, `mcp__mehrlander__*`) are trusted by default, with no `allow`
entry in `.claude/settings.json`; the twin that prompts wears a per-connection
UUID name, and permission entries key on the exact server name, so it cannot be
pinned (next session's UUID differs). The durable fix is the routing rule above,
not a settings entry. For prompt friction that *is* addressable, genuinely
repetitive safe Bash/MCP calls, the built-in `/fewer-permission-prompts` skill
scans transcripts and writes a prioritized `allow` list into
`.claude/settings.json`; run it once per repo. In the web sandbox that committed
file is the only allowlist that persists, since the container's `~/.claude` is
ephemeral.
