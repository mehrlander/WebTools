---
name: repo-review
description: >-
  Read a repo's own state and report what stands out, at one of three depths:
  light (a quick read of what is moving, stalled, or emerging), deep (an
  on-demand audit of every layer with ranked findings), or sweep (a parallel
  fan-out where each agent reads a different slice and proposes one find).
  All three run the repo's mechanical probes before forming impressions, and
  all three end in a written report rather than a pile of tracker tasks. Use
  when the user asks for the state of the repo, a health check, a full review
  or audit, what has momentum or went quiet, what themes are emerging, what
  the repo has noticed about itself, or invokes rounds, state-of-the-repo, or
  sweep by name. Reads and reports; it does not refactor.
disable-model-invocation: true
---

# repo-review

One protocol at three depths. A repo accumulates state its owner cannot hold in
their head: motion that no index names, checks that quietly went red, corners
going stale, connections nobody drew. This skill reads that state and reports
it.

The three depths differ in cost and in what they are for, not in method:

| Depth | Cost | For | Ends in |
| --- | --- | --- | --- |
| **light** | minutes | the everyday read, run freely | a short dated report |
| **deep** | expensive | the on-demand audit, by request only | a ranked write-up |
| **sweep** | parallel fan-out | what the repo noticed unprompted | a rolling file |

Pick from the ask: "how are things", "what's moving" is light; "look at
everything", "full review", "audit" is deep; "what has the repo noticed",
"sweep" is the fan-out. When the depth is genuinely unclear, run light and offer
to escalate. Escalating is cheap; a deep pass the user did not ask for is not.

## Extension points (declared in the repo's CLAUDE.md)

This skill carries the method. The repo carries its own material, declared once
in its `CLAUDE.md` so every depth reads the same list:

- **Probes:** the repo's own mechanical instruments, each with what it reports
  and whether it is cheap or slow. Light runs the cheap ones; deep runs all.
- **Layers:** the parts of the repo a deep pass must cover (an active area, the
  neglected periphery, generated surfaces against their sources, docs against
  practice).
- **Lenses:** for sweep, the slices to fan out over, one agent each.
- **Destinations:** where each depth's report is written.

A repo that has declared none of these can still be reviewed: fall back to
`git log`, the test suite, the README set, and whatever scripts `package.json`
or a `tools/` directory exposes. Say that you did, since a fallback pass sees
less than a declared one.

## Probes before impressions

Every depth starts here. Run the repo's instruments first and let their output
set the agenda. Impressions formed by reading files miss what only execution
catches: a tool that crashes on a missing dependency, a tool that lies because
of a date-parse bug. Two of the founding review's findings were exactly those.

Freshness stamps against actual motion are the cheapest staleness detector any
repo has: compare the as-of date on each generated surface to recent commit
activity. A stamp that trails the motion is a finding on its own.

## Depth: light

The everyday read. Cheap, fast, evidence-first. Run the cheap probes, then hold
these questions against what they show:

- **Edge of motion:** what is in progress where a small push might open
  something?
- **Stalls:** what went quiet, and what might be blocking it?
- **Themes:** what has recurred over the last week or two?
- **Time-sensitive:** what has a clock on it, as distinct from mere drift?
- **Ambient signals:** are the repo's own automated outputs being consumed or
  just emitted? Name any that expired unacted.
- **Open pass:** what is worth surfacing that none of the above asked for?

Write it short: observations, not essays. Run a slow probe only if a cheap one
points at it, and say so if you did.

## Depth: deep

By request only, and never on a schedule. The mandate is broader than the
checklist: **look at everything, every layer, and find anything that stands
out.** The steps below are instruments in service of that, not a routine to
complete. Anything genuinely noticed counts, whether or not a step asked for it.

1. **Every probe**, including the slow ones. Start the slowest in the background
   and read while it runs.
2. **Every layer**, as parallel deep reads (Agent tool), each seeded by probe
   output but free to notice anything. At minimum: the most active area, does
   its documented state match its actual state; and the periphery, what has
   quietly rotted and what is fine but unstamped. Between them cover what the
   probes cannot see into: doctrine against practice, generated surfaces against
   their sources, the skills against how sessions actually behave. Standing out
   is the bar, not membership in a category.
3. **Report**, in this order: ranked actionable findings, most consequential
   first, each grounded in a probe output or a file and each with the fix named;
   then time-sensitive items, separated from mere drift, which is where a deep
   pass earns its keep; then observations worth a look that demand nothing; then
   signals not acted on.

## Depth: sweep

The repo speaking first. A wide net over the repo's own material, pulling out
finds a person would want to see: a connection nobody drew, a corner going
quiet, an old entry that suddenly rhymes with current work.

**The one rule: surface the work, not the worker.** A find is about the material
(files, commits, gaps). It is never a behavior observation about the person
("you tend to", "you haven't"). That is the surveillance failure mode, and it is
the kill test in synthesis.

1. **Probe and load context.** Run the staleness probe, read the destination
   file's existing runs (that is the dedupe set), and read whatever the repo
   declares as its statement of who the reader is.
2. **Fan out the lenses in parallel**, one agent per declared lens. Diversity of
   slice is the design: a single pass reading everything gravitates to the
   recent and obvious. Each agent gets this preamble and returns exactly one
   candidate in this format:

   > You are one lens of a sweep over this repo. Read your assigned slice
   > DEEPLY and propose exactly ONE find: something the owner would find
   > genuinely worth seeing and has not already seen. Ground it in specific
   > files. Surface the work, not the worker. Return ONLY:
   >
   > ```
   > CANDIDATE: <short title>
   > CLAIM: <two to four sentences, concrete and checkable>
   > WHY-NOW: <one sentence: why timely rather than timeless>
   > LINKS: <repo-relative paths to the evidence, comma separated>
   > SUGGESTS: <one concrete disposition>
   > ```

3. **Synthesize.** You are the synthesizer. Keep a candidate only if it is
   grounded (names files that resolve), timely (a timeless observation is an
   essay, not a find), connective or actionable, about the work, news to the
   owner, and not a rerun of a recorded run. An item that scrolled off unacted
   counts as declined: bring it back only with a genuinely new why-now. Keep the
   best two to four. Zero survivors is a valid outcome; record the pass anyway,
   which is what keeps the staleness probe honest.
4. **Write and trim.** Append a dated run section at the top of the destination
   file, newest first, then keep the newest few runs and delete older ones. A
   find that mattered has graduated by then; one that did not has expired.
5. **Step back.** Tell the user in at most two lines that the pass ran and where
   the output is, with a link. Do not walk through the finds in chat unless
   asked. The file is the delivery, and silence is an acceptable response to it.

Lenses may be added, dropped, or re-aimed between runs. If one keeps producing
weak candidates, rewrite it in the repo's declaration.

## What a review does with its findings

**The report is the durable record.** Write it to the declared destination and
commit it. A finding written down is preserved; it does not also need a tracker
row, and a review that files one task per finding buries its own signal.

Fix what is small and in front of you (a stale stamp, a broken link) in the
review pass itself. For anything larger, the disposition is a proposal to the
user, not an action: name it in the report, and if the repo runs a tracker,
offer the few that clear the bar as tasks in one batch at the end. Filing them
goes through `/tasks`, which owns the bar, the gate, and the rule against
splitting one outcome across several tasks. Do not write task files directly
from a review pass.

Close by committing the report, and say where it landed.
