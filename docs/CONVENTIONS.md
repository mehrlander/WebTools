# Working conventions (portable)

Remote-sandbox conventions for Claude Code web sessions; output is strictly via chat. The canonical source is `mehrlander/web-tools` at `docs/CONVENTIONS.md`, loaded by `@`-import or the `web-tools` skill. Local `CLAUDE.md` rules override these defaults. Substitute the current repo into all URL templates.

This hub holds behavior that applies regardless of whether anything is being surfaced. Two companions carry the rest, and load as one set with this file:

- **[SURFACING.md](SURFACING.md)** — the surfacing system: the primitives that make session work visible in chat (no setup), plus the surfacing course (the guide-PR and merge-guide lifecycle, idle until you open a PR). This was the bulk of this file; it now lives on its own.
- **[PORTABLE.md](PORTABLE.md)** — installation, the plugin, and the full catalog of what travels from the hub to any repo.

**Prose style:** zero em dashes. Use colons, commas, semicolons, parentheses, or new sentences.

## Scope and precedence

Local `CLAUDE.md` wins wherever it conflicts with these defaults. Beyond that, name the units, since "session," "repository," and "branch" otherwise collapse into each other:

- A **session** can span several repositories. A repository's conventions apply to work done in that repository.
- A **workstream** is one repository plus its branch and the PR that tracks it. A single session may run several workstreams at once (three repos on one branch name, say).
- The **branch anchor**, **guide PR**, and **wrap-up** in [SURFACING.md](SURFACING.md) are per-workstream, not per-session: "the branch" and "the PR" always mean this workstream's.

## Standing decisions: write the answer down, not just the question

A recurring fork (commit this class of file to main without asking, skip the watch offer, take the smaller of two options) becomes a standing decision the moment a doc states it as a default: name it in `CLAUDE.md` or the relevant portable doc (this file, [SURFACING.md](SURFACING.md), [TRACKER.md](TRACKER.md)), and a session that hits it takes the default and notes the assumption rather than raising it fresh. Writing it down is the only lever that works: a `permissions.deny` on the question tool does not help, since asking is a model choice, not a gated call. A repo fielding the same question has a missing standing decision, not a tool to disable.

## Leave it nicer than you found it

Adding to a doc is a pass over it, not just an append. New material has to match the surrounding voice and structure. Go a step further and tighten related material while you are there.

## Beware make-work

When asked to look for improvements, be wary of ideas that address a hypothetical problem. A simple, clear fix is worth making, especially when it is as easy to fix as to bring up. The trap is speculative work that draws attention and goes off course.

**Its most common form is filing.** Turning an observation into a tracker task feels like diligence and costs nothing in the moment, which is how a backlog fills with items nobody will claim and the real work gets buried among them. Where a repo runs a tracker ([TRACKER.md](TRACKER.md)), the filing rules have one owner, the `tasks` skill: file only what a later session would have to rebuild context to rediscover, propose a new task rather than filing it unprompted, and keep one outcome in one task. Load `/tasks` before writing a task file, whatever pass you are in the middle of. A review that ends in a written report has already made its findings durable; it does not also owe the tracker a row per finding.

## Adding your own, without clobbering

The install owns only what it ships. Plugin skills are namespaced (`/portable:caption`), so a same-named skill of yours coexists; the fallback fetch hook writes a fixed file list and touches nothing else. Your own skills and any `CLAUDE.md` text below the import are never overwritten.
