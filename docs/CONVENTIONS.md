# Working conventions (portable)

Remote-sandbox conventions for Claude Code web sessions; output is strictly via chat. The canonical source is `mehrlander/web-tools` at `docs/CONVENTIONS.md`, loaded by `@`-import or the `web-tools` skill. Substitute the current repo into all URL templates.

This hub holds behavior that applies whether or not anything is being surfaced. Two companions load as one set with it:

- **[SURFACING.md](SURFACING.md)** — the surfacing system: the primitives that make session work visible in chat (no setup), plus the surfacing course (the guide-PR lifecycle, idle until you open a PR).
- **[PORTABLE.md](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md)** — installation, the plugin, and the full catalog of what travels from the hub to any repo.

**Prose style:** zero em dashes. Use colons, commas, semicolons, parentheses, or new sentences.

## Scope and precedence

**Local `CLAUDE.md` wins wherever it conflicts with these defaults.** Beyond that, name the units:

- A **session** can span several repositories. A repository's conventions apply to work done in that repository.
- A **workstream** is one repository plus its branch and the PR that tracks it. A single session may run several at once (three repos on one branch name, say).
- The **branch anchor**, **guide PR**, and **wrap-up** in [SURFACING.md](SURFACING.md) are per-workstream: "the branch" and "the PR" always mean this workstream's.

## Standing decisions: write the answer down, not just the question

**A consistency ask is not a fork.** When a treatment is approved in one place and the instruction is to apply it elsewhere ("do the same on X so it's consistent"), apply it to every surface it plausibly covers, show the pixels, and name what was assumed. Do not ask which surface was meant.

A recurring fork becomes a standing decision the moment a doc states it as a default. Name it in `CLAUDE.md` or the relevant portable doc (this file, [SURFACING.md](SURFACING.md), [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md)), and a session that hits it takes the default and notes the assumption rather than raising it fresh.

**A repo fielding the same question has a missing standing decision, not a tool to disable.** Asking is a model choice, not a gated call, so a `permissions.deny` cannot reach it.

## Status: frozen, stale, wrong

Material that is preserved on purpose, or that has aged, says so where it is read. Three flavors: **`Frozen`** (preserved on purpose; the living version has moved on), **`Stale`** (no longer accurate), **`Wrong`** (flatly incorrect, not merely aged). Operated by `/portable:markers`.

Two carriers, split by subject:

| | Subject | Says | Covers |
| --- | --- | --- | --- |
| **Marker** | a claim, in prose | this passage is preserved, aged, or wrong | markdown only |
| **Declaration** | a file path | this artifact is frozen: do not edit or rebuild it | any file type |

`Stale` and `Wrong` have no path analogue, since a paragraph can be wrong while its file is perfectly live. Only `Frozen` overlaps.

**Marker.** Inline for one claim, or a GFM alert for a whole file or section (`> [!NOTE]` for `Frozen`, `> [!WARNING]` for the other two), with the flavor in the bold lead-in:

```markdown
**Stale 2026-07-20 → ../timeline.md:** the dates here predate the reschedule.
```

Shape: `**Flavor YYYY[-MM[-DD]] [(note)] [→ target]:**`. The target is optional and may be a path, a markdown link, or prose; only path-shaped targets are existence-checked. A `status: frozen 2026-07-06; note` frontmatter line is the optional metadata layer.

**Annotate, do not rewrite:** a dated file stays put as a record, so when one of its claims ages, mark the claim rather than editing the record into agreement with the present. **Only a record gets a marker**; fix a living document instead. The tell: a banner describing text no longer in the file.

**Declaration.** `.paths.json`, which may sit at a repo root **or any workspace root**, with entries relative to its own directory and the nearest declaration winning.

```json
{
  "frozen": [
    "research/budget-dive/dashboard.html",
    { "path": "app/studies/", "since": "2026-07-05", "why": "task 0016: pinned exhibits",
      "except": ["*/tools/*"] }
  ]
}
```

A bare string is shorthand for `{ "path": ... }`; a trailing `/` covers a directory; `except` is `fnmatch` against the path below the entry. `except` is required in practice: a frozen folder routinely contains live inputs.

**A marker cannot do the declaration's job.** A GFM alert renders in markdown and nowhere else, so `.html`, `.js`, and `.csv` artifacts can never carry one.

**The one cross-check, and it runs one way:** a markdown file declared frozen should carry a `Frozen` banner, because the JSON is invisible to someone opening the file. The reverse does not hold, since a `Frozen` marker inside a living document annotates one claim and implies nothing about the file.

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

**There is no fourth question that saves a passage, and a reason is not exempt because it is a reason.** Nearly every sentence in a bloated document is a reason somebody chose something, which is how it got bloated. What earns its place is the **criterion** inside a reason: the condition, threshold, or named exception that changes how the rule applies at an edge. Lift that into the rule and the rest goes to the PR body or the dated record that owns the decision. Operated by [`state-the-rule`](https://github.com/mehrlander/web-tools/blob/main/skills/state-the-rule/SKILL.md), which carries the labels and the checks.

Two habits: **Render before you cut**, since a definition that exists only in a tooltip is not rendered. And **look inside the file**: a paragraph repeated verbatim within one document is invisible to a cross-file duplicate scanner by construction, and to a word cap because it fits inside the budget.

The cut is only safe when something will notice it being undone, so leave a gate behind: a pointer the doc must keep, and a ceiling it must stay under.

## Keep focus

When asked to look for improvements, be wary of ideas that address a hypothetical problem. A simple, clear fix is worth making; the trap is speculative work that goes off course. The test points only at tasks you conceive, not a specific user request.

The `tasks` skill owns the filing rules; load `/tasks` before writing a task file. A friction observation goes to the repo's snags log (web-tools: [`SNAGS.md`](https://github.com/mehrlander/web-tools/blob/main/docs/SNAGS.md)), one line with a `→` to the fixing doc; the third recurrence earns a task.

## Adding your own, without clobbering

The install owns only what it ships. Plugin skills are namespaced (`/portable:caption`), so a same-named skill of yours coexists; the fallback fetch hook writes a fixed file list and touches nothing else. Your own skills and any `CLAUDE.md` text below the import are never overwritten.
