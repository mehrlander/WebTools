# Inbound: how work reaches a session

[venues.md](venues.md) answers where work can *run*. This file answers the
question next to it, which had never been asked: how does work *reach* a
session, whether one is running or not. The two are easy to conflate and they
fail differently. A venue that cannot be reached is idle; an inbound channel
with no venue behind it is a message nobody reads.

**Measured 2026-08-20.** The push claim was tested rather than reasoned about,
on this file's own pull request. See "What was measured" below.

## The channels

| Channel | Who can send | Push or pull | Durable | Reachable by a non-Anthropic agent |
| --- | --- | --- | --- | --- |
| Chat prompt | the user | it *is* the session | no | no |
| **PR comment, subscribed** | anyone with repo write | **push** | yes | **yes** |
| `SendMessage` between sessions | Claude sessions on the account | push | no | no |
| Routine, `send_later` | a schedule, or a session arming itself | push | the trigger is | no |
| mailbox `requests/` | a session, answered by the browser | pull | yes | by token |
| mailbox `ask` | a session, answered by a person | pull | yes | yes |
| `chron/dump/`, drained | the user | pull | yes | yes |
| A tracker task | anyone | pull | yes | yes |

Two columns carry the whole argument.

**Every durable inbound in this estate is pull.** A dump file, a tracker task,
a mailbox request: each waits in a folder until something next looks. That is
robust and it is slow, and slowness is the correct trade for most of them. What
it cannot do is redirect work already under way.

**Exactly one channel is both push and open to an outside agent.** A subscribed
PR comment is the only row that is durable, addressable, human readable, and
writable by anything holding a repo token, which includes an agent from another
vendor. `SendMessage` is faster and richer and is bounded by the account, so it
cannot serve a reader running somewhere else. That is not a shortcoming of
either; they answer different questions.

## The affordance nobody claimed

The estate moved to opening a pull request at first push rather than at the end
of the work. The stated reason was surfacing: the body becomes the live answer
to "where did I leave things."

A second consequence arrived with it and went unnoticed. **A PR that exists from
the first push is a standing, addressable inbox for the workstream, present
during the work rather than after it**, which is the only time an inbox is
useful. Under the old habit there was nothing to write to while the branch was
live. The channel was created as a side effect of a decision made for another
reason, and no convention claimed it.

[SURFACING.md](SURFACING.md) meanwhile said "never offer to watch CI or monitor a
PR." That rule was aimed at a monitoring posture, a session sitting on a red
build burning tokens. Its phrasing was broad enough to keep any session from
raising the inbound use at all, which is the failure [venues.md](venues.md) opens
by naming: not a document unread, but a question never asked.

## The join that already exists, pointing one way

A session's identity is already bound to its branch. Sessions write a
`Claude-Session:` commit trailer, the branch survey reads it, the activity cache
carries it per branch, and show-repo's Branches view links it. So the estate can
already answer "which session produced this branch."

Subscribing does not create that join and does not improve it. It adds the
reverse direction, which today does not exist: from the pull request back to the
session, live. The record points backwards in time; the subscription points
forwards.

## Two kinds of comment, and they must be distinguishable

A wake makes a session *act*. So a note parked for later and an instruction to
proceed arrive identically and are not identically intended. Without a marker,
every stray thought becomes a work order.

The proposal is a leading token, checked before anything else in the comment is
read:

- `@go` — act on this now. The rest of the comment is the instruction.
- `@note` — record and do not act. It belongs to whichever session next reads
  the thread, not to the one woken by it.
- no token — treat as `@note`. The safe default is the one that does nothing.

An outside agent writing into the thread uses the same vocabulary, and should
say which agent it is in the first line, since a session cannot otherwise tell a
person from a program and the two warrant different deference.

## What was measured

Tested 2026-08-20 on [PR #464](https://github.com/mehrlander/web-tools/pull/464),
the pull request carrying this file.

| | |
| --- | --- |
| Session subscribed | 20:57:05Z |
| Last activity in the session | about 20:57Z |
| Container running the session | booted about 20:37Z |
| That container | reclaimed at some point after 20:57Z |
| **A new container** | **booted 21:33:57Z** |
| Comment event delivered into the conversation | 21:37:02Z |
| Control: a scheduled self check-in | armed for 21:58Z, did not fire first |

**A PR comment revives a reclaimed container.** The container that ran the first
half of the session no longer existed. A new one was provisioned and the
conversation resumed inside it, carrying its full context, because somebody
commented. The scheduled check-in was armed as a control precisely so a pull
could not be mistaken for a push, and it was still twenty-one minutes away when
the wake landed. This is genuine asynchrony, and it is the strongest form of the
claim rather than the weak one.

**Budget about three minutes of cold start.** Boot preceded delivery by 3m 05s.
The gap between the comment being posted on GitHub and the session acting on it
was not directly observed and is at least that. So the channel is asynchronous,
not interactive: it is for handing over work, not for holding a conversation.

## The channel carries no authorship

The test comment arrived under the repo owner's account and its text said it was
written by an agent from another vendor acting through that account. **From
inside the session those two are indistinguishable**, and no probe available to
a session can separate them. Anything holding a token with write access to the
repository *is* the account, as far as an arriving event can show.

Two consequences, and the first is the one that matters:

- **A leading token states intent, never authority.** `@go` means "this is meant
  as an instruction," not "the person sanctioned this." An action that would be
  costly, destructive, or outward-facing still needs the person, and a comment
  is not the person even when it arrives under their name.
- **Claims in a comment are claims.** The test comment asserted that the private
  session corpus had been read successfully. Nothing in the comment cited that
  corpus, and the assertion is unverifiable from a session. It is recorded here
  as reported rather than confirmed.

The harness already treats this correctly and the treatment is worth naming,
since it is the mitigation rather than an inconvenience: an arriving event is
wrapped in a notice stating it is not user input, and the author and body are
flagged as untrusted. A session that reads those flags and still treats a comment
as consent has ignored the guard, not lacked one.

## Subscribing automatically, and what "automatic" can mean

The estate opens a pull request at first push, so the inbox exists early. Making
the session subscribe to it without a manual step splits into three parts, and
only one of them can be automatic.

**Detection can be.** `PostToolUse` takes a matcher on the tool name and can
return `hookSpecificOutput.additionalContext`, described in the hook reference as
text that "lets a hook augment what Claude sees about the tool's result." A
matcher of `mcp__.*__create_pull_request` fires deterministically the moment a
pull request is created, with the tool result in hand, which carries the number.

**The subscribe call cannot be.** Hooks run shell commands.
`subscribe_pr_activity` is an MCP tool reachable only by the model, and it has no
command-line equivalent. Nothing in the hook system can invoke it. This is the
line the question has to be answered on: **detection is machinery, the call is
always the model.**

**So the achievable mechanism is deterministic detection plus a prompt delivered
at the exact moment, carrying the number.** That is meaningfully stronger than a
standing instruction in `CLAUDE.md`, which competes with everything else in
context and weakens as a session grows, and meaningfully weaker than a platform
feature, which does not exist as far as this estate has found. Call it reliable,
not automatic, and do not describe it as automatic in any convention, because a
reader who believes subscription is guaranteed will stop checking.

Where it belongs, if it is built: the `portable` plugin's hook folder, beside
[`mcp-fail-hint.sh`](https://github.com/mehrlander/web-tools/blob/main/.claude/skills/hooks/mcp-fail-hint.sh),
which is already the identical shape (matcher on an MCP tool, payload off stdin,
guidance out through `additionalContext`). Two reasons, and the second is the
load-bearing one:

- The plugin travels to every repo, and the inbox is a per-workstream thing in
  every repo rather than a web-tools feature.
- **A project `.claude/settings.json` hook would not fire reliably.** A session
  can open with the repo one level below its root, and Claude Code then reads
  project settings from a path that does not exist, registering none of the
  repo's hooks. The estate hit exactly this, diagnosed it, and moved its
  build hook out of the harness for it; see
  [environment/extending.md](environment/extending.md). The plugin registers at
  user scope and runs from any root, which is why the dispatcher lives there.

Two things such a hook must say, since both are silent failures otherwise:

- **A PR Steward already watching preempts the subscription.** The call still
  succeeds and the tool result says events will not arrive. Read the result text
  rather than assuming success.
- **Whether subscriptions accumulate is not known.** If a session can hold only
  one, auto-subscribing on every creation would silently drop the earlier
  workstream's inbox, and a session running three repos on one branch name is
  ordinary here. Settle that before wiring anything up.

### It would reverse a standing decision, quietly

[SURFACING.md](SURFACING.md) says never offer to watch CI or monitor a PR. The
harness attaches a **drive-to-green posture** to a pull request the session
created: once subscribed, a CI failure is not to be left without a pushed fix or
a stated blocker. Those are the same subscription. Auto-subscribing therefore
enrolls every session in the CI babysitting the convention bans, without anyone
deciding to.

The two are separable and the convention has to separate them out loud:
**subscribe for the inbox, decline the babysitting.** A convention that adopts
auto-subscribe without saying which half it is adopting has reversed a standing
decision by side effect, which is the same failure mode that created this
channel unnoticed in the first place.

