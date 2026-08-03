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

**A consistency ask is not a fork.** When a treatment is approved in one place and the instruction is to apply it elsewhere ("do the same on X so it's consistent"), apply it to every surface it plausibly covers, show the pixels, and name what was assumed. Do not ask which surface was meant: doing one place too many costs a revert, while asking costs a round trip on work already decided.

A recurring fork (commit this class of file to main without asking, skip the watch offer, take the smaller of two options) becomes a standing decision the moment a doc states it as a default: name it in `CLAUDE.md` or the relevant portable doc (this file, [SURFACING.md](SURFACING.md), [TRACKER.md](TRACKER.md)), and a session that hits it takes the default and notes the assumption rather than raising it fresh. Writing it down is the only lever that works: a `permissions.deny` on the question tool does not help, since asking is a model choice, not a gated call. A repo fielding the same question has a missing standing decision, not a tool to disable.

## Status: frozen, stale, wrong

Material that is preserved on purpose, or that has aged, says so where it is read. Three flavors: **`Frozen`** (preserved on purpose; the living version has moved on), **`Stale`** (no longer accurate), **`Wrong`** (flatly incorrect, not merely aged). Operated by `/portable:markers`.

Two carriers, split by subject, and the split is the point:

| | Subject | Says | Covers |
| --- | --- | --- | --- |
| **Marker** | a claim, in prose | this passage is preserved, aged, or wrong | markdown only |
| **Declaration** | a file path | this artifact is pinned: do not edit or rebuild it | any file type |

`Stale` and `Wrong` have no path analogue, since a paragraph can be wrong while its file is perfectly live. Only `Frozen` overlaps.

**Marker.** Inline for one claim, or a GFM alert for a whole file or section (`> [!NOTE]` for `Frozen`, `> [!WARNING]` for the other two), with the flavor in the bold lead-in:

```markdown
**Stale 2026-07-20 → ../timeline.md:** the dates here predate the reschedule.
```

Shape: `**Flavor YYYY[-MM[-DD]] [(note)] [→ target]:**`. Flavor, date, and target hold fixed positions so the set is auditable rather than merely greppable. The target is optional and may be a path, a markdown link, or prose; only path-shaped targets are existence-checked. A `status: frozen 2026-07-06; note` frontmatter line is the optional metadata layer. **Annotate, do not rewrite:** a dated file stays put as a record, so when one of its claims ages, mark the claim rather than editing the record into agreement with the present.

**Declaration.** `.paths.json`, which may sit at a repo root **or any workspace root**, with entries relative to its own directory and the nearest declaration winning. That cascade is what lets one repo hold several workspaces with different regimes, and workspace-relative entries survive a restructure that root-relative ones would not.

```json
{
  "frozen": [
    "research/budget-dive/dashboard.html",
    { "path": "app/studies/", "since": "2026-07-05", "why": "task 0016: pinned exhibits",
      "except": ["*/tools/*"] }
  ]
}
```

A bare string is shorthand for `{ "path": ... }`; a trailing `/` covers a directory; `except` is `fnmatch` against the path below the entry. `except` is not a nicety: frozen folders routinely contain live inputs, and a whole-directory rule without it fires on exactly the files the estate depends on.

**A marker cannot do the declaration's job,** and not by preference. A GFM alert renders in markdown and nowhere else, so `.html`, `.js`, and `.csv` artifacts can never carry one. That gap is why pinned pages stay illegible until something outside the prose declares them.

**The one cross-check, and it runs one way:** a markdown file declared frozen should carry a `Frozen` banner, because the JSON is invisible to someone opening the file. The reverse does not hold, since a `Frozen` marker inside a living document annotates one claim and implies nothing about the file.

## Leave it nicer than you found it

Adding to a doc is a pass over it, not just an append. New material has to match the surrounding voice and structure. Go a step further and tighten related material while you are there.

## Beware make-work

When asked to look for improvements, be wary of ideas that address a hypothetical problem. A simple, clear fix is worth making, especially when it is as easy to fix as to bring up. The trap is speculative work that draws attention and goes off course.

**Its most common form is filing.** Turning an observation into a tracker task feels like diligence and costs nothing in the moment, which is how a backlog fills with items nobody will claim and the real work gets buried among them. Where a repo runs a tracker ([TRACKER.md](TRACKER.md)), the filing rules have one owner, the `tasks` skill: file only what a later session would have to rebuild context to rediscover, propose a new task rather than filing it unprompted, and keep one outcome in one task. Load `/tasks` before writing a task file, whatever pass you are in the middle of. A review that ends in a written report has already made its findings durable; it does not also owe the tracker a row per finding.

**Where a friction observation goes instead.** Not the tracker. A small thing you tripped over ("the documented probe does not detect this failure") is an insight, not an outcome anyone will claim, so filing it buries the work that is. Where a repo keeps a snags log (web-tools: [`SNAGS.md`](SNAGS.md)), it goes there: one line naming the symptom and the corrected move, plus a `→` to the doc carrying the full fix. Recurrence is the promotion rule, since one trip is noise and the third earns a task to remove the cause.

## Adding your own, without clobbering

The install owns only what it ships. Plugin skills are namespaced (`/portable:caption`), so a same-named skill of yours coexists; the fallback fetch hook writes a fixed file list and touches nothing else. Your own skills and any `CLAUDE.md` text below the import are never overwritten.
