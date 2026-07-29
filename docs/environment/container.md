# Claude Code web environment and persistence

This page describes the Claude Code web environment and the state that persists across sessions. See [capabilities.md](capabilities.md) for installed tools and network access.

*Verified locally 2026-05-30; documentation checked 2026-07-20.*

## Environment

Claude Code web sessions run in an [isolated Anthropic-managed VM with a fresh repository clone](https://code.claude.com/docs/en/claude-code-on-the-web#the-cloud-environment).

- Working directory: `/home/user/web-tools`.
- Approximate limits: [4 vCPU, 16 GB RAM, and 30 GB disk](https://code.claude.com/docs/en/claude-code-on-the-web#resource-limits).
- Memory-intensive builds and tests may be terminated.
- The environment is [reclaimed after inactivity](https://code.claude.com/docs/en/claude-code-on-the-web#environment-expired).
- Reopening an expired session provisions a fresh environment and restores the conversation history.

## Persistent state

Project changes persist through GitHub. Files must be committed and pushed before the environment is reclaimed or before another session can use them.

Local machine state is separate. Files, configuration, dependencies, and unpushed commits on a laptop are not available to the web session. The laptop and web environment are independent Git checkouts.

Environment configuration has a separate persistence mechanism. A cloud [setup script](https://code.claude.com/docs/en/claude-code-on-the-web#setup-scripts) installs tools and dependencies before Claude Code starts. Anthropic [snapshots the resulting filesystem](https://code.claude.com/docs/en/claude-code-on-the-web#environment-caching) and uses that snapshot as the starting point for later sessions in the same environment.

The environment cache includes files, packages, tools, and Docker images installed by the setup script. It does not include running processes. The cache is rebuilt when the setup script or network configuration changes and after its approximate seven-day expiry.

Packages installed during a session do not transfer to other sessions unless their installation is added to the setup script. Repository `SessionStart` hooks run separately at their configured lifecycle events.

## The session transcript

*(measured 2026-07-29)*

Each session writes a JSONL transcript at
`~/.claude/projects/<slug>/<session-id>.jsonl`, appended turn by turn. A `Stop`
hook receives its path as `transcript_path`. Every line carries `timestamp`,
`cwd`, `sessionId`, and the CLI `version`; assistant lines add `message.model`
and `message.usage`, so per-session model and token totals are readable without
instrumenting anything.

**It does not persist.** The container holds exactly one transcript, the running
session's. There is no on-disk history of prior sessions, no session list in the
CLI config, and no MCP tool that enumerates them. The session's own
`claude.ai/code/session_...` URL is not fetchable from inside the box. So a
transcript not copied out before the container is reclaimed is gone, and the copy
has to be made by the session that produced it.

**Most of it is tool output.** Measured on one working session:

| Form | Size | Share |
| --- | --- | --- |
| Raw JSONL | 691 KB | 100% |
| Conversation only, tool results dropped | 24 KB | 3% |

The other 97% is file reads, command output, and search results: bulky, largely
reconstructable from the repo, and the reason a transcript's size is out of
proportion to what it says.

**It is as sensitive as the most sensitive thing the session read.** Tool results
are recorded verbatim, so a transcript inherits whatever secrets, private file
contents, and API responses passed through it. Archiving one is a disclosure
decision, not a backup.

**Two fields do not mean what their names suggest.** `gitBranch` reads `HEAD`
rather than a branch name, so a branch has to be read from the repo instead. And
the user role carries harness-injected turns, a retry notice being the common
one, so counting user messages overstates how many times the user actually said
something.

## Repository observations

*Observed 2026-05-30.*

- `origin` used a loopback URL of the form `http://local_proxy@127.0.0.1:PORT/git/<owner>/<repo>`.
- The repository was shallow, indicated by `.git/shallow`.
- The `.git` modification time predated the VM boot time.
- Local `main` differed from `origin/main` after a remote history rewrite.
- Git objects removed from the remote remained present in that running environment.
- Concurrent sessions could not see each other's uncommitted files.

Anthropic documents the [GitHub proxy](https://code.claude.com/docs/en/claude-code-on-the-web#github-proxy) as the authentication boundary for Git and GitHub API operations. Credentials remain outside the VM. The proxy supports cloning, fetching, pushing, and pull-request operations while restricting pushes to the current working branch and limiting operations to repositories attached to the session.

The timestamps and stale local ref established the state of the observed environment. They did not establish that a repository clone is reused across sessions. The current documentation specifies a fresh clone for each session.

```bash
stat -c '%y %n' .git
uptime -s
git remote -v
test -f .git/shallow && echo "shallow clone"
git rev-parse main origin/main
```

## Concurrent sessions

Each web session runs in an [isolated VM](https://code.claude.com/docs/en/claude-code-on-the-web#security-and-isolation).

A file created but not committed in one session was not visible in a concurrent session. Changes transfer between sessions only after commit, push, and fetch or clone.

Session isolation does not establish whether a particular session retains its writable filesystem when its environment is reprovisioned. Expired environments are documented as being replaced.

## Added repositories

*Reported 2026-07-10 during cross-repository work. Not independently reproduced here.*

A session begins with one primary repository and branch. The web interface tracks that branch and displays its diff and pull-request controls.

The connected GitHub account can provide cloud sessions with access to [other repositories it can read](https://code.claude.com/docs/en/claude-code-on-the-web#github-authentication-options). A repository added during the session with `add_repo` receives a clone and Git access through the [GitHub proxy](https://code.claude.com/docs/en/claude-code-on-the-web#github-proxy).

In the reported session:

- The added repository could fetch and push its current branch.
- Its uncommitted files remained inside that session.
- The web interface did not display branch or pull-request controls for it.

The observed difference concerned web-interface integration, not Git access or filesystem persistence. The internal metadata mechanism responsible for that difference is not documented. For how to surface an added repository's work without those controls, see [github-surfacing.md](../github/github-surfacing.md#surfacing-an-added-repositorys-work).

## Evidence limits

Documented behavior and observed behavior are separate evidence.

- Documentation states the supported operating model.
- Filesystem and Git checks establish the state of a particular running environment.
- Concurrent-session tests establish isolation between those sessions.
- None of these observations establishes undocumented persistence across reprovisioning.

The stale local `main` established that the observed checkout contained older repository state. It did not establish that state from one session had persisted into another.

A result that matches the documented design is weak evidence about the mechanism, since it cannot separate understanding from recitation. The stale local `main` was useful precisely because it should not have been present: it forced a check against the filesystem rather than the documented story, and caught a phrase that had smuggled in persistence the evidence did not support. Prefer an anomaly over a tidy match.
