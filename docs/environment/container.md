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

### What `~/.claude` carries

*(measured 2026-07-30)*

The home directory is two layers with different lifetimes, and the modification
times separate them cleanly. Written fresh at boot: `skills/` (the account's own
skills, 39 of them), `projects/` (this session's transcript), `session-env/`, and
the harness's hook scripts. Restored from the environment snapshot, carrying the
timestamp of the day that snapshot was built: `settings.json`, `CLAUDE.md`, and
`plugins/`, including `plugins/installed_plugins.json` and the plugin cache below
it.

So **account skills sync every container and account plugins do not.** A plugin is
pinned at the commit it held when the snapshot was built. Nothing surfaces that
from inside a session: the plugin is present, enabled, and stale. In the measured
case the pin was two days behind and lacked a `Stop` hook the newer version
shipped, so a fix that had merged was running nowhere. The same lifetime governs a
hook installed by hand into `~/.claude/settings.json`. It covers exactly the
session that wrote it, because a session's filesystem changes never enter the
snapshot.

Two commands freshen a running container:

```bash
claude plugin marketplace update <marketplace>
claude plugin update <plugin>@<marketplace>
```

The CLI answers "Restart to apply changes," and the [plugin documentation](https://code.claude.com/docs/en/discover-plugins) offers `/reload-plugins` as the in-session equivalent. Neither was needed here. Skills from the updated cache appeared in the session's own skill listing within the turn, and the plugin's `Stop` hook fired 43 minutes later with nothing restarted and no reload typed. [Settings-file hooks are documented as reloading live](https://code.claude.com/docs/en/settings); on CLI 2.1.220 plugin hooks did too. Treat `/reload-plugins` as the fallback for an update that does not take.

**Putting that update in the setup script does not solve it,** which is the part
worth stating plainly, because it is the obvious fix and it fails quietly. The
setup script runs when the snapshot is built, not when a session starts, so its
`claude plugin update` pins the version current on build day and every later
session restores that result. The measurement is direct: a setup script whose
first act is an unconditional heredoc into `~/.claude/CLAUDE.md` left that file
dated 2026-07-28 02:08 in a container booted 2026-07-30 19:31, alongside a plugin
pin from the same instant. A script that has not run cannot refresh anything.

What runs every session is a `SessionStart` hook, and the setup script is the
right place to write one, since `~/.claude/settings.json` rides the snapshot and
therefore persists. That inverts the roles: the setup script installs the
refresher once, and the refresher tracks the tip on every boot. Match
`startup|resume`, not `startup` alone: reopening an expired session provisions a
fresh environment, and that fires `resume`.

**The documentation and the measurement disagree about what a mid-session update
reaches, and the disagreement is the whole risk in that design.** The hooks
reference says plugins are loaded once at startup, and gives `SessionStart`'s
`reloadSkills` the explicit carve-out that it reloads user and project skills
while plugin-provided skills are not reloaded. If that holds strictly, a refresher
that runs at session start pulls a version that only takes effect at the next
boot, which in a one-session-per-container environment means never. Measured twice
on 2026-07-30, CLI 2.1.220, it did not hold: after `claude plugin update` ran
mid-session, a skill present only in the newer version appeared in the session's
own skill listing on the following turn, and the newer version's `Stop` hook fired
43 minutes later, with no restart and no `/reload-plugins`. Something picks up a
changed plugin cache; the documented sentence is about `reloadSkills`, not about
every path.

Treat that as measured on one version and not as a guarantee. The decisive test is
cheap and belongs to whoever depends on it: change something visible on the
plugin's `main`, start a fresh session, and check whether it is present or arrives
one session late. Until then a refresher should say what it did, since
`SessionStart` stdout is added to the session's context, which turns a silent
one-session lag into a line someone can read.

Editing the setup script at all invalidates the snapshot, so the next session
rebuilds rather than waiting out the roughly seven-day expiry. That makes the
first fix free and is worth knowing whenever an environment looks stuck.

The pin reaches the repository checkout as well, by the same route. `node_modules/`
is gitignored, so it cannot arrive with the fresh clone; the setup script installs
it and the snapshot preserves it. A dependency added to `package.json` after the
snapshot was built is therefore missing in a session that has the commit adding
it. Measured 2026-07-30: `graphql@^17.0.2` landed on main that morning, the
container's `node_modules/` was dated 2026-07-28, and `npm test` failed one test on
`ERR_MODULE_NOT_FOUND` while the same suite passed in CI, which installs fresh.
When a suite fails locally on a missing package, check the dates before believing
the failure.

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
