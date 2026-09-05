# Working conventions (portable)

Remote-sandbox conventions for Claude Code web sessions; output is strictly via chat. The canonical source is `mehrlander/web-tools` at `docs/CONVENTIONS.md`, loaded by `@`-import or the `web-tools` skill. Substitute the current repo into all URL templates.

This hub holds behavior that applies whether or not anything is being surfaced. Two companions load as one set with it:

- **[SURFACING.md](SURFACING.md)**: the surfacing system, the primitives that make session work visible in chat (no setup) plus the surfacing course (the guide-PR lifecycle, idle until you open a PR).
- **[PORTABLE.md](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md)**: installation, the plugin, and the full catalog of what travels from the hub to any repo.

**Prose style:** zero em dashes. Use colons, commas, semicolons, parentheses, or new sentences.

## Scope and precedence

**Local `CLAUDE.md` wins wherever it conflicts with these defaults.** Beyond that, name the units:

- A **session** can span several repositories. A repository's conventions apply to work done in that repository.
- A **workstream** is one repository plus its branch and the PR that tracks it. A single session may run several at once (three repos on one branch name, say).
- The **branch anchor**, **guide PR**, and **wrap-up** in [SURFACING.md](SURFACING.md) are per-workstream: "the branch" and "the PR" always mean this workstream's.

**Two settings are per repository, and these are their defaults.** *Render path:* ⭐ for a page already deployed, the toss otherwise; there is no per-repo preview mechanism. *Per-session refreshes:* normally none; a local `CLAUDE.md` names only a generated artifact too slow or too non-deterministic to ride a commit hook.

## Standing decisions: write the answer down, not just the question

**A consistency ask is not a fork.** When a treatment is approved in one place and the instruction is to apply it elsewhere ("do the same on X so it's consistent"), apply it to every surface it plausibly covers, show the pixels, and name what was assumed. Do not ask which surface was meant.

A recurring fork becomes a standing decision the moment a doc states it as a default: `CLAUDE.md`, or the relevant portable doc (this file, [SURFACING.md](SURFACING.md), [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md)). A session that hits it takes the default and notes the assumption rather than raising it fresh. A repo fielding the same question twice is missing a default, not a permission rule: asking is a model choice, not a gated call, so a `permissions.deny` cannot reach it.

## Status: frozen, stale, wrong

Material preserved on purpose, or that has aged, says so where it is read. The
vocabulary is **`Frozen`** (preserved on purpose), **`Stale`** (no longer
accurate) and **`Wrong`** (flatly incorrect, not merely aged), carried two ways:
a **marker** on a claim in prose, and a **declaration** (`.paths.json`) on a
file path, which is the only one that reaches a non-markdown artifact.

**Run `/markers` before marking anything, and before editing in a repo whose
frozen areas you have not seen.** It owns the shapes, the cascade, and the
check; this paragraph exists so you know the system is there.

## Venues: this session is not the only place work can run

Besides this sandbox, work can run in a local Claude Code CLI, in Cowork on the desktop, through **Dispatch** (a phone-to-desktop relay, attended: the machine must be awake with the app open), on GitHub's hosted runners, on a **self-hosted runner** on your own machine (unattended: it queues while the machine sleeps), and in a Claude Code Remote environment.

Before concluding that something cannot be done from here, or scoping an answer to the venues visible from inside the sandbox, read [venues.md](https://github.com/mehrlander/web-tools/blob/main/docs/venues.md): what each reaches, and the attended-versus-unattended split that decides where a job belongs.

## Leave it nicer than you found it

Adding to a doc is a pass over it, not just an append. New material has to match the surrounding voice and structure. Go a step further and tighten related material while you are there.

## Prose that describes state is unimplemented

A document that restates what an app derives, or what a check enforces, is carrying a copy, and the copy is the half that ages with nothing to report it. Before adding to a doc, and whenever one has outgrown its subject, ask three questions in order:

1. **Is this a fact the app derives?** Delete it and link the view.
2. **Is this a rule the suite enforces?** Delete the description, keep a pointer to the gate. The test is the statement.
3. **Does another document already own it?** Delete it and link there.

**There is no fourth question that saves a passage, and a reason is not exempt because it is a reason.** What earns its place inside a reason is the **criterion**: the condition, threshold, or named exception that changes how the rule applies at an edge. Lift that into the rule; the rest goes to the PR body or the dated record that owns the decision. Operated by [`state-the-rule`](https://github.com/mehrlander/web-tools/blob/main/skills/state-the-rule/SKILL.md), which carries the labels and the checks.

The cut is only safe when something will notice it being undone, so leave a gate behind: a pointer the doc must keep, and a ceiling it must stay under.

## Keep focus

When asked to look for improvements, be wary of ideas that address a hypothetical problem. A simple, clear fix is worth making; the trap is speculative work that goes off course. The test applies to work the session conceives, not to a specific user request.

The `tasks` skill owns the filing rules; load `/tasks` before writing a task file. A friction observation goes to the repo's snags log (web-tools: [`SNAGS.md`](https://github.com/mehrlander/web-tools/blob/main/docs/SNAGS.md)), one line with a `→` to the fixing doc; the third recurrence earns a task.

## Adding your own, without clobbering

The install owns only what it ships. Plugin skills are namespaced (`/portable:caption`), so a same-named skill of yours coexists; the fallback fetch hook writes a fixed file list and touches nothing else. Your own skills and any `CLAUDE.md` text below the import are never overwritten.
