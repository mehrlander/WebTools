# Reaching GitHub through the MCP server

How the GitHub MCP server treats a call, and the text it carries each way: not
GitHub's rendering of stored markdown ([markdown.md](markdown.md)), not the
sandbox itself ([capabilities.md](../environment/capabilities.md)). Supersedes
[mcp-server-routing.md](mcp-server-routing.md) (2026-07-15) on the routing
section below. Findings below come from testing in a Claude Code web session;
chat text is unaffected by all of it, since these are write- and read-path
faults, not markdown's.

## False permission walls

A direct `curl` to `api.github.com` with the session's `GITHUB_TOKEN` fails
before GitHub ever sees it: the agent proxy returns 403 `GitHub access is not
enabled for this session`, and an account-wide path gets `sessions are bound to
their configured repositories`. `GET /user` returns 200 and identifies the
account, so the token reaches identity only. A working `/user` call is not
proof the API works, and a 403 here means "unreachable from this shell," not
"missing permission."

The same illusion recurs one layer up. A session carries built-in MCP servers
and claude.ai connectors that can expose identical tool names; a connector's
own approval check runs before Claude Code's permission logic does, and no
approval UI is reachable from here.

| Server | Log directory | `update_pull_request` |
| --- | --- | --- |
| `mcp__github__` (built-in) | `mcp-logs-github` | completed in 1s |
| a GitHub connector | `mcp-logs-<id>` | `MCP error -32003: requires approval` |

Besides `-32003`, a connector can answer a plain `403 Resource not accessible by
integration`, GitHub's own wording for a missing app permission.
`create_pull_request` failed that way on three repos straight through the
connector and succeeded on the built-in server for all three (reads were
unaffected), indistinguishable from write access withheld. A confirming `curl`
also returned 403: the same proxy refusal as above, not a scope answer. Neither
403 was about permissions.

**Tell them apart by the log, not the error.** A connector's name is an opaque
UUID, but `mcp-logs-<id>/` under `~/.cache/claude-cli-nodejs/<root>/` is filed
under the server's real name. ("No token data found" shows up in a working
server's log too; it is not the tell.)

**Fix:** on `-32003` or an unexplained 403, reload the built-in tool explicitly
(`ToolSearch`, `select:mcp__github__<tool>`) rather than reissuing whatever
discovery handed you, and don't re-approve the connector: approving doesn't
clear a call that already failed. A capability that exists only on a connector
(`add_repo`, say) has no in-session workaround; attach repos when the session is
created instead.

**Past GitHub:** wherever a provider has more than one server connected, a
permission surprise is usually a routing problem; check for a sibling server
before trusting the wall. Allowlisting will not save you: entries key on the
exact server name, and a connector's name is a fresh UUID every session, so
nothing can be pinned. Upstream reports the same failure even where the server
can be named, and with `CLAUDE_PERMISSION_MODE=bypassPermissions`:
[#61044](https://github.com/anthropics/claude-code/issues/61044),
[#61027](https://github.com/anthropics/claude-code/issues/61027) (dup of
[#61015](https://github.com/anthropics/claude-code/issues/61015)), also hitting
Gmail, Calendar and Microsoft 365 connectors.

## What a PR body loses through the MCP

**Writing: a URL of 150 characters or more is wrapped** in backticks and stored
as literal text; 149 or fewer survives, on both PR bodies and issue comments.
Only the character count matters, not host, fragment, `@`/`:`, or encoding.
*(PR #497, PR #499, issue #498)*

- **The label doesn't count.** A 149-character URL survives a 120-character
  label; a 150-character URL wraps under a one-character label.
- **A slash-joined pair is one span.** `)/[` doesn't end the URL token, so the
  sanitizer measures `len(url1) + len(")/[label2](") + len(url2)`. A `, ` join
  measures each URL alone, so write `[main](…), [diff](…)`, never a slash join.
- **A code span doesn't protect it.** At 150+, a backticked URL is stored as
  `` ``'URL'`` `` (double-backticked, with quotes added), so a reader who copies
  it picks up the quotes. The backtick itself can land anywhere near the URL in
  the stored body, not at a fixed offset.

Check first with `python3 scripts/mcp-link-safe.py --check`; shorten per the
table in [SURFACING.md](../SURFACING.md), or move the link into the chat reply,
which renders it clean.

**A different fault, same shape: an angle-bracket placeholder is eaten**, read
back as an unknown HTML tag and dropped. `` `stale -> <id>` `` reads back as
`` `stale -> ` `` (PR #546); `app/?use=<sha>&view=<key>` reads back as
`app/?use=&view=` (PR #481), an address that looks finished and isn't. Worse
than wrapping: a wrapped link is disfigured but present, while a dropped
placeholder reads as done and says nothing. Write a concrete value, never a
placeholder.

**Reading: `pull_request_read` strips HTML anywhere** in the string, including
inside code spans and fenced blocks, and entity-encodes prose (`'` → `&#39;`).

| Written | Read back |
| --- | --- |
| plain text | survives |
| `'` | `&#39;` |
| an HTML comment or tag, anywhere | removed |
| `[//]: # (label)` | **survives** |
| `<a name="x"></a>` | removed |

It's a readback fault, not a write fault: the same content written through
`create_or_update_file` and read back with `git show`, no MCP in the read,
round-trips byte for byte.

**Why the guide region is delimited by a link label.** A PR body's *guide
region* is the part a sync rewrites, bracketed by two markers; the summary line
above it and the session footer below it sit outside. `<!-- guide -->` used to
be those markers, and reading them back through this path returned nothing, so
a sync either appended a second region or overwrote the summary and footer.
`[//]: # (guide)` survives the round trip and renders as nothing on GitHub,
being a link-reference definition rather than content, so it is what gets
written now; recognition still accepts the old form, since every body written
before 2026-07-28 carries it. The label must start a line, between blank lines;
inside a list item or blockquote it can render literally.
