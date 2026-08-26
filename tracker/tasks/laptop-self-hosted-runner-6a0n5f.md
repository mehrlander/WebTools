---
id: laptop-self-hosted-runner-6a0n5f
title: Connect the laptop as an unattended venue for repo work
status: done
project: repo
opened: 2026-08-09
closed: 2026-08-10
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

## The decision

**Option 1, a GitHub Actions self-hosted runner installed as a Windows service,
with Ollama also wrapped as a service so it survives logoff.** Decided
2026-08-10 on the strength of a machine probe run through Dispatch.

The probe dissolved the question this task was actually blocked on. The worry
was whether a job running in **session 0** could reach an Ollama listening in
the interactive **session 1**. It can: loopback ignores Windows session
boundaries, so a service reaching `127.0.0.1:11434` is unaffected by which
session owns the listener. Reachability was never the constraint.

The real constraint is **lifetime**. Ollama is installed per-user and runs in
the interactive session. It survives lock (observed, not inferred) and dies on
logoff. That leaves two shapes:

- **Wrap Ollama as a service** (chosen). Independent of any interactive session,
  so a queued job runs whether the machine is locked, logged off, or freshly
  rebooted with nobody signed in.
- **Leave Ollama per-user.** Cheaper and reversible in minutes, and adequate in
  practice, since this machine locks rather than logs off. Its failure mode is
  silent: the runner accepts a job it cannot complete.

The second was the cheaper first step and is recorded here as the fallback if
the service wrapper proves troublesome. The first was chosen because the point
of the venue is that it does not depend on the machine being in any particular
state.

**Discarded: a runner service with Ollama left per-user and no fallback.** A
runner that accepts jobs it cannot complete is worse than one that is simply
absent, because the failure surfaces as a red workflow rather than an unclaimed
queue.

**Discarded: option 2, a scheduled poll on the laptop.** The queue, the dedup,
the lock, and the logs all become ours, which is the work the runner does for
free.

**Option 3, a Claude Code Remote self-hosted pool, remains unverified and
cannot be verified from here.** Enumerating the account's environments is a
claude.ai connector call whose approval fires server-side, so a web session has
no reachable approval path and no built-in equivalent to fall back on. Checking
it needs a venue that can approve the connector. It is a different shape anyway
("run a session there" rather than "run this script there"), so it is a
successor question, not a competitor to this decision.

### The wake correction

The probe report claimed GitHub's wake-on-LAN would wake the machine for a
queued job. **It cannot.** The runner holds an *outbound* long-poll, which is
exactly why it needs no inbound ports and no static IP; there is no route from
GitHub toward the laptop at all. Wake-on-LAN needs a magic packet on the local
segment, and GitHub is not on the LAN. A queued job on a sleeping machine waits
until the machine wakes on its own.

This does not change the decision, because nothing else does better. It changes
what "unattended" promises: **pickup in seconds while the machine is awake, and
on wake otherwise.** The working assumption, stated by the owner on 2026-08-10,
is that the laptop is configured not to sleep, imperfectly and with occasional
lockups. Good enough to proceed on, and nothing below depends on it.

## Setup steps

Run from Dispatch, which is the venue this belongs to. The machine has local
admin, no MDM, and no enterprise endpoint agent, so nothing here needs an
exception. Prerequisites already confirmed present: git 2.50.1, `gh`
authenticated with `workflow` scope, no prior `actions-runner` directory, no
runner service.

### 1. Wrap Ollama as a service

Stop the tray app and remove it from startup, then create the service. NSSM is
the pragmatic wrapper.

**Run the service as the interactive user account, not as LocalSystem.** This
is the variant that avoids the trap: Ollama's model store defaults to
`%USERPROFILE%\.ollama\models`, and a LocalSystem service resolves that to a
different profile and finds no models. That is 14.5 GB of re-pulling, or an
`OLLAMA_MODELS` override that has to stay correct forever. Running the service
as the user keeps every path as it is today, and still survives logoff, because
a service's logon session is independent of the interactive one. The account
needs the "Log on as a service" right, which NSSM grants when the account is
set.

```
nssm install Ollama "C:\Users\<user>\AppData\Local\Programs\Ollama\ollama.exe" serve
nssm set Ollama AppEnvironmentExtra OLLAMA_HOST=127.0.0.1:11434
nssm set Ollama ObjectName .\<user> <password>
nssm set Ollama Start SERVICE_AUTO_START
nssm start Ollama
```

`ObjectName` wants the account's real password, which a machine signed in
with a Microsoft account, a PIN, or Windows Hello may not have in usable form.
That is the likeliest place this step stalls. When it does, fall back to
LocalSystem and set `OLLAMA_MODELS` to the existing store explicitly. Do not
skip that line: it is the difference between a working service and a silent
14.5 GB re-pull.

**Verify before going further**, since everything downstream assumes it: sign
out completely, sign back in, and confirm `curl http://127.0.0.1:11434/api/tags`
answers. If it answers only after sign-in, the wrapper did not take.

### 2. Install the runner as a service

Get a registration token (repo Settings, Actions, Runners, New self-hosted
runner; valid one hour), or:

```
gh api -X POST repos/mehrlander/web-tools-private/actions/runners/registration-token
```

Then, from an elevated shell in `C:\actions-runner`:

```
config.cmd --url https://github.com/mehrlander/web-tools-private ^
           --token <token> --labels ollama --runasservice
```

Workflows target it with `runs-on: [self-hosted, windows, ollama]`.

### 3. Two things the service account does not inherit

- **`gh` auth is per-user.** The runner service runs as NETWORK SERVICE by
  default, which holds no `gh` credential, so a workflow that shells out to `gh`
  fails in a way that reads as a `gh` bug. Use `actions/checkout` and
  `${{ secrets.GITHUB_TOKEN }}` rather than the user's `gh` session.
- **PATH is the system PATH.** git 2.50.1 is installed machine-wide and is
  fine. Anything installed per-user is not on it.

### 4. Prove the chain end to end before writing a real job

One throwaway workflow in `web-tools-private` on `workflow_dispatch` that hits
`127.0.0.1:11434/api/tags` and prints the result. That exercises pickup, the
service account, and Ollama reachability in one run, and it is the only step
that distinguishes "installed" from "working."

Then add `repository_dispatch` so a sandbox session can fire it. Firing from
here needs a PAT with `repo` scope held as a secret on the sending side;
`GITHUB_TOKEN` will not do cross-repo dispatch.

### 5. Optional

Disable Fast Startup, for boot predictability rather than for wake. It has no
bearing on job pickup.

## Open, and deliberately not settled here

**The probe asked to pull `gemma4:26b` (about 18 GB) as a prerequisite, for a
"life-journal job."** Neither the model nor that job appears in this task, which
names labeling session records as the first job, and home's
`projects/local-models/README.md` (2026-08-02) lists only the three models the
probe found. The ask came from context on the machine that is not in these
repos. It is also a model-selection question with real cost: 32 GB of RAM, a
measured CPU-only baseline near 7 tokens per second for an 8B model, and no
usable GPU path on the integrated Radeon. A 26B model on that machine is a
different order of patience. Decide it in the local-models project, not as a
side effect of standing up a runner.

## Notes

The venue vocabulary this task depends on landed as
[`docs/venues.md`](../../docs/venues.md), and the tracker tag was renamed from
`runner:` to `venue:` on 2026-08-10, so the axis this task argued for is now the
one the tracker uses. `runner` is a venue value; once the runner is registered,
this machine serves `cli`, `cowork`, `dispatch`, and `runner`, which is the grep
set for picking up parked work.

## Progress log
- 2026-08-09: Filed from a session that reached for the laptop while building the
  session export view and had no way to get there. Options 1 through 3 above are
  from that session's research; the "never on a public repo" constraint and the
  Dispatch-attended finding are confirmed against Anthropic and GitHub
  documentation, not recalled. Next: pick a mechanism and write the setup steps
  into this file.
- 2026-08-10: A Dispatch session probed the machine and answered the blocking
  question, though not the one that was asked: loopback crosses Windows session
  boundaries, so reachability was never the constraint and lifetime is. Decision
  taken (option 1, both the runner and Ollama as services), setup steps written,
  and the report's wake-on-LAN claim corrected. Closed: this file now carries the
  decision, which is what "done" meant. Execution is on the machine and wants its
  own task if it is not simply done in one Dispatch sitting.
