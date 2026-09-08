# github

Everything about working *with GitHub itself*: what its renderer can do, how a
session reaches it, and how this repo treats git history and branches. Strands
that used to live apart (`git-markdown.md`, `git-conventions/`, and the MCP
material in `environment/capabilities.md`), gathered here so there is one place
to point.

## What GitHub renders

- **[markdown.md](markdown.md)**: a gallery of what GitHub-flavored markdown
  turns into pictures, charts, and callouts when you view a `.md` on GitHub: no
  JavaScript, no build step. Mermaid diagrams, math, sparklines, alerts, the
  works.

## How this repo treats git

Durable notes behind the workflow rules in [CLAUDE.md](../../CLAUDE.md), kept
here so the rules have a place to point.

- **[post-merge-branch-mutation.md](post-merge-branch-mutation.md)**: why a
  merged branch should stop being a live workspace. Necromerging, zombie
  branches, and the rule of thumb: *merged means closed.*

## How a session reaches GitHub

- **[mcp.md](mcp.md)**: what the MCP layer does to a call and to the text it
  carries: which of two servers answers (and why the wrong one looks like a
  permission wall), the 150-character threshold past which a written URL is
  stored as dead literal text, and the readback that strips HTML anywhere in
  the string. Moved here from `environment/capabilities.md` on 2026-09-07,
  where it had grown to half that file.
- **[mcp-server-routing.md](mcp-server-routing.md)**: the 2026-07-15
  observation behind the routing half above, kept as a record and marked Stale.
  Same operative move, from a less well-evidenced account of the cause.

## How work is surfaced

- **[github-surfacing.md](github-surfacing.md)**: GitHub-native ways to expose
  work: branches, commits, compare views, draft pull requests, file permalinks,
  and serialized diffs. The mechanical layer under the chat-handoff surfacing
  primitives in [SURFACING.md](../SURFACING.md).
