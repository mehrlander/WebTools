# Reaching GitHub through the MCP server

What the MCP layer does to a call, and to the text that call carries in each
direction. Its neighbours: [markdown.md](markdown.md) for what GitHub's renderer
does with markdown once it is stored, [mcp-server-routing.md](mcp-server-routing.md)
for the superseded 2026-07-15 record behind the routing section here, and
[../environment/capabilities.md](../environment/capabilities.md) for the sandbox
itself.

Every finding below was measured from a Claude Code web session and carries its
date. **Chat replies are untouched by all of it**; these are faults of the write
and read paths, not of markdown.

## The MCP is the only path, and a `curl` 403 is not a permission finding

*(measured 2026-07-28, sharpened 2026-07-29)*

A direct `curl` to `api.github.com` with the session's `GITHUB_TOKEN` returns
403 `GitHub access is not enabled for this session`, from the **agent proxy**
rather than from GitHub. Account-wide paths are refused separately with
`sessions are bound to their configured repositories`. `GET /user` does answer,
200, and identifies the account.

So the token reaches identity and nothing else, and two things follow. An
authenticated probe against `/user` **is not evidence that the API is usable**.
And a 403 from that shell says nothing about any app installation's permissions:
read it as "the API is unreachable from here." The routing section below turns
on exactly that mistake.

## Which server answers, and why the wrong one looks like a permission wall

*(measured 2026-07-29; second symptom added 2026-08-15)*

A session carries both **built-in** MCP servers and **connectors** installed
through claude.ai. The two can expose identical tool names, tool discovery
returns either, and connector calls in a web session fail. Server-level approval
validation fires before Claude Code's own permission logic, and no approval UI
is reachable from here.

| Server | Log directory | `update_pull_request` |
| --- | --- | --- |
| `mcp__github__` (built-in) | `mcp-logs-github` | completed in 1s |
| `mcp__8d0009e2-…__` (a GitHub connector) | `mcp-logs-8d0009e2-…` | `MCP error -32003: requires approval` |

**Two symptoms, and the second is the dangerous one.** Besides `-32003`, a
connector can answer a plain `403 Resource not accessible by integration`,
GitHub's own wording for a missing app permission. `create_pull_request` returned
it for three repositories in a row while the identical call on the built-in
server opened all three. Reads were unaffected, so the asymmetry looked exactly
like `pull_requests: read` without `write`. A confirming `curl` returned 403 too,
which is the proxy refusal above and says nothing about scope. Two
independent-looking 403s agreed and neither was about permissions.

**Telling them apart.** A connector is surfaced under a UUID, which names
nothing. Its per-server log resolves it: `mcp-logs-<id>/` under
`~/.cache/claude-cli-nodejs/<root>/` records each call under the server's real
name. Make that the first triage step. A conspicuous `No token data found` line
in those logs is **not** the tell; it appears throughout the log of a server
whose calls succeed.

**The rule.** On `-32003` or an unexplained 403, reload the built-in equivalent
explicitly with ToolSearch (`select:mcp__github__<tool>`) rather than reissuing
whatever discovery returned, since discovery is what routed you wrong. Do not
re-approve on the failing server: approving does not clear the already-errored
call, which is what makes the approval flow itself look broken. A capability that
exists *only* on a connector has no in-session workaround, which for `add_repo`
means attaching repositories when the session is created.

**Generalize it past GitHub.** Wherever a provider has more than one server
connected, a permission surprise on one is more often a routing problem than a
permission wall. Check for a sibling server exposing the same tool before
treating the wall as real.

**Allowlisting is not the fix, for two independent reasons.** Permission entries
key on the exact server name, and a connector wears a per-connection UUID, so
next session's name differs and nothing can be pinned. Separately, upstream
reports allowlisting failing even where the server can be named, along with
reconnecting and `CLAUDE_PERMISSION_MODE=bypassPermissions`:
[#61044](https://github.com/anthropics/claude-code/issues/61044) (open) and
[#61027](https://github.com/anthropics/claude-code/issues/61027) (closed as a
duplicate of #61015), which report the same failure for Gmail, Calendar and
Microsoft 365 connectors and call it a regression.

## Writing: a URL of 150 characters or more is wrapped

*(measured 2026-08-25 across eleven rounds, PR #497, PR #499 and issue #498)*

**A URL of 150 characters or more is wrapped in backticks and stored as literal
text. 149 or fewer survives.** Nothing else about the URL matters: not the host,
not a fragment, not an `@` or `:`, encoded or not. The threshold is identical on
both write paths, a PR body and an issue comment, and inclusive at 150.

Three refinements, each bracketed one character apart:

- **The label does not count.** A 149-character URL survives under a
  120-character label; a 150-character URL wraps under a one-character label.
  Count the URL, not the construct.
- **A slash-joined pair is one span, not an exception.** `)/[` does not end the
  URL token, so the sanitizer measures `len(url1) + len(")/[label2](") + len(url2)`,
  the second label included and the trailing `)` excluded. Two clean 70-character
  URLs make one 150-character span. A `, ` join ends the run, so each URL is then
  measured alone, which is why `[main](…), [diff](…)` is the prescribed shape in
  [SURFACING.md](../SURFACING.md).
- **A code span is not a safe harbour.** At 150 or more, a URL in single
  backticks is stored as `` ``'URL'`` ``, double-backticked with quotes added.
  Nothing dies, but a reader copying it picks up the quotes.

Where the backticks land in the stored body wanders between rows, so look for a
backtick anywhere near a URL rather than at a fixed offset.

**What to do.** Check before writing with `python3 scripts/mcp-link-safe.py --check`,
and shorten per the table in [SURFACING.md](../SURFACING.md)'s caption primitive.
Anything still over goes in the chat reply instead, where it renders correctly.

**A separate fault: an angle-bracket placeholder is eaten.** *(one observation,
2026-08-29, PR #546; not bracketed the way the length rows are)* A body carrying
`` `stale -> <id>` `` read back as `` `stale -> ` ``, the placeholder dropped as
an unknown HTML tag and the `>` escaped. A code span did not protect it. This is
sanitization, not length, and it is worse than wrapping: a wrapped URL is
disfigured but present, while a dropped placeholder leaves a sentence that reads
as finished and says nothing. Write a concrete example (`stale -> ccb6cfc`)
rather than a placeholder.

## Reading back: HTML is stripped, anywhere in the string

*(measured 2026-07-28; placeholder row added 2026-08-22)*

**Reading a pull request body through `pull_request_read` does not return the
body as written.** HTML comments and tags are stripped anywhere, including inside
code spans and fenced blocks, which makes it a raw-text strip rather than
markdown-aware sanitization. Text is entity-encoded, so an apostrophe returns as
`&#39;`.

| Written | Read back |
| --- | --- |
| a plain sentinel word | survives |
| `'` in ordinary prose | `&#39;` |
| an HTML comment, in prose, a code span, or a fence | removed in all three |
| `[//]: # (label)` | **survives** |
| `<a name="x"></a>` | removed |
| `<tip>` as a placeholder in an address | removed |

The last row is the same rule at its worst. `app/?use=<sha>&view=<key>` reads back
as `app/?use=&view=`, an address that looks complete, looks like a bug in the
thing being described, and invites a session to "fix" a body that was never
broken. PR #481's body did exactly that. Write placeholders as plain words.

**It is a readback fault, not a write fault.** The same content written through
`create_or_update_file` and read back with `git show` from a fetched ref, no MCP
in the read, round-trips byte for byte. The stored body could not be observed
directly, since the REST API is proxy-blocked and two GitHub MCP servers ship
identical instructions, so their agreement is not independent confirmation; that
the store is intact is an inference from the file-write control.

**Why the guide delimiter is a link label.** [SURFACING.md](../SURFACING.md) and
the `caption` skill once delimited a PR body's managed region with
`<!-- guide -->`. An agent reading through this path saw no delimiters and so no
region, and a sync that cannot find its region appends a second one or overwrites
hand-written prose. `[//]: # (guide)` survives the round trip and renders as
nothing, so it is what gets written; recognition still accepts both, because
every body written before 2026-07-28 carries the HTML pair. The constraint the
new form brings: a link label is a reference definition, so it must start a line
and sit between blank lines, and inside a list item or blockquote it can render
literally.

The generalizable half: a delimiter is only as good as its worst reader, and this
one was chosen for how GitHub renders it without anyone checking how an agent
reads it back. When a marker exists so a machine can find something later, test
the round trip through the path that machine will use.
