# Venues: where work can happen

A session can only see the venue it is running in. That is the whole reason this
file exists. A Claude Code web session inventories what it can reach from inside
its sandbox, concludes that the alternatives are itself and GitHub's runners,
and never asks what else can reach the same machine. The failure is not that a
doc went unread; it is that no question was raised. So the venues are named
here, and named again in one line of [CONVENTIONS.md](CONVENTIONS.md), which is
always in context. A name is enough to make a session ask.

**The axis that matters is attended versus unattended.** An attended venue needs
a person, or at least a machine that is awake with an app open; it is where
judgment and one-off work belong. An unattended venue runs without anyone
present, queues when it cannot run, and leaves a log; it is where recurring and
batch work belongs. Most confusion about where to put a job is this distinction
going unstated.

## The venues

| Venue | Attended | Reaches | Hand work to it by |
| --- | --- | --- | --- |
| **Claude Code on the web** | yes | an ephemeral clone, an allowlisted network, a headless Chromium, no local files | starting a session, or a Routine that spawns one |
| **Claude Code CLI, local** | yes | the machine and everything on it; peers via cross-session messaging | running it in a terminal |
| **Cowork, desktop** | yes | local files, apps, connectors, plugins | working in the desktop app |
| **Dispatch** | yes: desktop awake, app open | Cowork's reach, plus computer use | a message from the phone, into one persistent thread |
| **GitHub Actions, hosted runner** | no | open egress, CPU only, no GPU, no local files | `workflow_dispatch`, `repository_dispatch`, `schedule`, `push` |
| **GitHub Actions, self-hosted runner** | no | whatever that machine has, including a local model | the same four triggers; the job queues while the machine sleeps |
| **Claude Code Remote environment** | no | a provisioned cloud container, or a self-hosted pool (`ccpool_` ids) | `create_session`, or a Routine |

Two properties are easy to get wrong and worth stating outright:

- **Dispatch is attended even when it is scheduled.** Its recurring tasks still
  require the desktop to be awake with the app open. It is a relay to your
  machine, not a scheduler on it.
- **A self-hosted runner is unattended even when the machine is asleep.** It
  holds an outbound long-poll, so a queued job waits and runs on wake. Nothing
  needs to be open, and no thread is consumed.

Which is why the two compose rather than compete: **Dispatch does the setup that
has to touch the machine, and the runner does the recurring work afterwards.**

## The constraint that is not negotiable

**Never register a self-hosted runner on a public repository.** A pull request
from a fork would execute arbitrary code on that machine. In this estate that
means `web-tools` is out, since it serves the github.io pages, and
`web-tools-private` is the place.

## The tracker's `runner:` tag

[TRACKER.md](TRACKER.md) defines `runner: <machine>` as the tag that parks a task
for a machine. It predates this file and names a machine rather than a venue,
which is the coarser axis: one laptop is reachable through the CLI, Cowork,
Dispatch, and a self-hosted runner, and those four differ in exactly the way
that decides whether a task can run tonight. Where the distinction matters, say
the venue in the task body until the tag earns the change.

## Keeping this true

Every row is a claim about a product that moves. Re-probe rather than rewrite
from memory: the attended column in particular is the one that changes when a
feature grows a scheduler. Dated observations belong in
[environment/capabilities.md](environment/capabilities.md), which describes one
venue in depth; this file stays a map.

Last checked 2026-08-09, against Anthropic's Dispatch documentation and GitHub's
self-hosted runner security guidance. The Claude Code Remote self-hosted pool row
is the one that is **unverified**: nobody has enumerated whether this account has
such an environment.
