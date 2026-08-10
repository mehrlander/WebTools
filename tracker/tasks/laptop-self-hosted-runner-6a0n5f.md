---
id: laptop-self-hosted-runner-6a0n5f
title: Connect the laptop as an unattended venue for repo work
status: backlog
project: repo
track: independent
opened: 2026-08-09
size: M
---
# Connect the laptop as an unattended venue for repo work

Estate work keeps wanting a machine this sandbox cannot reach: a local model for
batch jobs, an hour of unattended time, data that should not leave the laptop.
The laptop is reachable today through Dispatch, but Dispatch is **attended**
(the desktop must be awake with the Claude Desktop app open, its scheduled tasks
included) and holds a single thread. Nothing currently reaches it unattended.

**Done when this file carries the decision**: which mechanism, why, and the
setup steps in enough detail to execute. No branch, no diff. Execution is a
separate beat and belongs on the machine.

## What is already settled

- **Never a self-hosted runner on a public repo.** A pull request from a fork
  would execute arbitrary code on the machine. `web-tools` is public, since it
  serves the github.io pages. So the runner registers against
  **`web-tools-private`**, which is also where the session records live. That
  repo currently has no workflows at all.
- **Dispatch does the setup, not the recurring work.** Installing a runner and
  starting its service is one-off, interactive, and has to touch the machine,
  which is exactly Dispatch's shape. The recurring job then runs without the app
  open. The two are complements, not alternatives.
- **The first real job does not need real time.** Labeling session records is
  incremental and idempotent (label what has no label), so a cron does the whole
  backlog and a dispatch trigger is a convenience rather than the mechanism.
  This removes the urgency but not the value.

## The open question

Which mechanism, weighed on unattended reach, maintenance, and where the log
lands:

1. **GitHub Actions self-hosted runner.** An agent on the laptop holding an
   outbound long-poll to GitHub: no inbound ports, no static IP, job pickup in
   seconds, and it queues while the machine sleeps. GitHub owns the queue, the
   logs, the secrets, and concurrency. Triggers reaching it: `workflow_dispatch`,
   `repository_dispatch` (so a session here can fire it), `schedule`, `push`.
   Windows service install is offered during `config.cmd`. Label it (`ollama`)
   and target `runs-on: [self-hosted, windows, ollama]`. Open: whether a job run
   by the service can reach Ollama in the user session reliably.
2. **A scheduled poll on the laptop.** No runner install, but the queue, the
   dedup, the lock, and the logs become ours, which is the work the runner does
   for free.
3. **A Claude Code Remote self-hosted environment pool** (`ccpool_` ids). A
   different shape: not "run this script there" but "run a session there," with
   Ollama local to it. Unverified; nobody has enumerated whether one exists on
   this account.

## Notes

The venue vocabulary this task depends on is being written up separately as
`docs/venues.md`; read it first if it has landed. The tracker's `runner:` tag
names a machine, but the laptop is reachable three ways with materially
different properties, so venue is the sharper axis and the tag may want to carry
it.

## Progress log
- 2026-08-09: Filed from a session that reached for the laptop while building the
  session export view and had no way to get there. Options 1 through 3 above are
  from that session's research; the "never on a public repo" constraint and the
  Dispatch-attended finding are confirmed against Anthropic and GitHub
  documentation, not recalled. Next: pick a mechanism and write the setup steps
  into this file.
