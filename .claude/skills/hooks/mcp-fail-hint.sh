#!/usr/bin/env bash
# PostToolUseFailure: turn an MCP approval wall into its diagnosis, at the
# moment it happens. The -32003 "requires approval" error reads as a permission
# wall the user could clear; in a web session it is almost always the
# connector-vs-builtin trap (/sandbox-traps): the call went to a claude.ai
# connector that duplicates a built-in MCP server's tools, server-side approval
# fired before Claude Code's permission logic, and no approval UI is reachable.
# The wrong diagnosis survived two sessions on recall alone, so the guidance is
# delivered here by machinery instead (the hook analogue of promoting a twice-
# made correction to a check). Payload fields measured 2026-08-02: tool_name
# and error are present on a -32003 failure; additionalContext is the output
# channel that reaches the model.
# The payload rides an env var: a `python3 - <<HEREDOC` occupies stdin with
# the program text, so the hook JSON piped to this script would be lost.
HOOK_PAYLOAD="$(cat)" python3 - <<'PY'
import json, os, re, sys
try:
    d = json.loads(os.environ.get("HOOK_PAYLOAD", "") or "{}")
except Exception:
    sys.exit(0)
err = str(d.get("error", ""))
tool = str(d.get("tool_name", ""))
if "-32003" not in err and "requires approval" not in err.lower():
    sys.exit(0)
m = re.match(r"mcp__(.+?)__(.+)$", tool)
if not m:
    sys.exit(0)
server, tail = m.groups()
uuidish = bool(re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", server))
hint = (
    f"This -32003 is the connector-vs-builtin trap (/portable:sandbox-traps), not a permission wall: "
    + (f"'{server}' is a claude.ai connector surfaced under a UUID, " if uuidish
       else f"'{server}' may be a claude.ai connector duplicating a built-in server, ")
    + "its server-side approval fires before Claude Code's permission logic, no approval UI is reachable, "
    + "and re-approving will not clear the errored call. Reissue against the built-in server's name "
    + f"(for GitHub: ToolSearch \"select:mcp__github__{tail}\", then call that), even if a notice said the "
    + "built-in names were gone; they still resolve by name. A capability existing only on a connector has no fallback."
)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUseFailure", "additionalContext": hint}}))
PY
