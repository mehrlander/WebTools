# Working conventions (portable)

Remote-sandbox conventions for Claude Code web sessions; output is strictly via chat. The canonical source is `mehrlander/web-tools` at `docs/CONVENTIONS.md`, loaded by `@`-import or the `web-tools` skill. Local `CLAUDE.md` rules override these defaults. Substitute the current repo into all URL templates.

This hub holds behavior that applies regardless of whether anything is being surfaced. Two companions carry the rest, and load as one set with this file:

- **[SURFACING.md](SURFACING.md)** — the surfacing system: the primitives that make session work visible in chat (no setup), plus the surfacing course (the guide-PR lifecycle, idle until you open a PR). This was the bulk of this file; it now lives on its own.
- **[PORTABLE.md](https://github.com/mehrlander/web-tools/blob/main/docs/PORTABLE.md)** — installation, the plugin, and the full catalog of what travels from the hub to any repo.

## Prose style

Zero em dashes. Use colons, commas, semicolons, parentheses, or new sentences.

**Define a local term or drop it.** A word that means something particular in this estate needs its meaning written where the reader meets it. Undefined, it is decoration, and the reader cannot tell whether they missed something or the writer did. The test is a cold reader: someone opening the file with no session context, who should feel welcomed into the discussion rather than measured at the door. Three habits do most of the damage and no lint catches any of them:

- Using the term as a count noun with a definite article, as in "the twelve registers" or "the second obligation-shaped one." That asserts a shared vocabulary the reader has no way to acquire, and it is the form the failure usually takes, because it reads as confident rather than as jargon.
- Letting one word mean different things in the same document.
- Reaching for a term whose near-homophone means something else nearby: register and registry, seam and stage.

When challenged on a term, test the distinction against the data before defending it. An invented justification is worse than the word it rescues, since it adds a second undefined claim. Usually the plain word is also the stronger claim, because it commits to something a reader can check. Recorded 2026-08-15, after a session used "register" 23 times across a README and three tools to mean three different things, next to the estate's own `registry`, and then invented a distinction the data disproved.

The estate's detectors are advisory and wired to nothing: [`tools/concept-lab/termlab.py`](https://github.com/mehrlander/web-tools/blob/main/tools/concept-lab/termlab.py) studies a corpus for terms that carry this risk, and [`flag_reply.py`](https://github.com/mehrlander/web-tools/blob/main/tools/concept-lab/flag_reply.py) reads a draft reply against that index. Its `ungrounded` flag names this failure exactly. Neither substitutes for reading your own draft as a stranger would.

## Scope and precedence

Local `CLAUDE.md` wins wherever it conflicts with these defaults. Beyond that, name the units, since "session," "repository," and "branch" otherwise collapse into each other:

- A **session** can span several repositories. A repository's conventions apply to work done in that repository.
- A **workstream** is one repository plus its branch and the PR that tracks it. A single session may run several workstreams at once (three repos on one branch name, say).
- The **branch anchor**, **guide PR**, and **wrap-up** in [SURFACING.md](SURFACING.md) are per-workstream, not per-session: "the branch" and "the PR" always mean this workstream's.

## Standing decisions: write the answer down, not just the question

**A consistency ask is not a fork.** When a treatment is approved in one place and the instruction is to apply it elsewhere ("do the same on X so it's consistent"), apply it to every surface it plausibly covers, show the pixels, and name what was assumed. Do not ask which surface was meant: doing one place too many costs a revert, while asking costs a round trip on work already decided.

A recurring fork (commit this class of file to main without asking, skip the watch offer, take the smaller of two options) becomes a standing decision the moment a doc states it as a default: name it in `CLAUDE.md` or the relevant portable doc (this file, [SURFACING.md](SURFACING.md), [TRACKER.md](https://github.com/mehrlander/web-tools/blob/main/docs/TRACKER.md)), and a session that hits it takes the default and notes the assumption rather than raising it fresh. Writing it down is the only lever that works: a `permissions.deny` on the question tool does not help, since asking is a model choice, not a gated call. A repo fielding the same question has a missing standing decision, not a tool to disable.

## Status: frozen, stale, wrong

Material that is preserved on purpose, or that has aged, says so where it is read. Three flavors: **`Frozen`** (preserved on purpose; the living version has moved on), **`Stale`** (no longer accurate), **`Wrong`** (flatly incorrect, not merely aged). Operated by `/portable:markers`.

Two carriers, split by subject, and the split is the point:

| | Subject | Says | Covers |
| --- | --- | --- | --- |
| **Marker** | a claim, in prose | this passage is preserved, aged, or wrong | markdown only |
| **Declaration** | a file path | this artifact is frozen: do not edit or rebuild it | any file type |

`Stale` and `Wrong` have no path analogue, since a paragraph can be wrong while its file is perfectly live. Only `Frozen` overlaps.

**Marker.** Inline for one claim, or a GFM alert for a whole file or section (`> [!NOTE]` for `Frozen`, `> [!WARNING]` for the other two), with the flavor in the bold lead-in:

```markdown
**Stale 2026-07-20 → ../timeline.md:** the dates here predate the reschedule.
```

Shape: `**Flavor YYYY[-MM[-DD]] [(note)] [→ target]:**`. Flavor, date, and target hold fixed positions so the set is auditable rather than merely greppable. The target is optional and may be a path, a markdown link, or prose; only path-shaped targets are existence-checked. A `status: frozen 2026-07-06; note` frontmatter line is the optional metadata layer. **Annotate, do not rewrite:** a dated file stays put as a record, so when one of its claims ages, mark the claim rather than editing the record into agreement with the present.

**Only a record gets a marker.** Fix a living document instead. The tell: a banner describing text no longer in the file.

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

**A marker cannot do the declaration's job,** and not by preference. A GFM alert renders in markdown and nowhere else, so `.html`, `.js`, and `.csv` artifacts can never carry one. That gap is why frozen pages stay illegible until something outside the prose declares them. ("Pinned" is not this vocabulary's word: in the estate it means kept at hand, the `pins` manifest field and the estate Pin list, never immutability.)

**The one cross-check, and it runs one way:** a markdown file declared frozen should carry a `Frozen` banner, because the JSON is invisible to someone opening the file. The reverse does not hold, since a `Frozen` marker inside a living document annotates one claim and implies nothing about the file.

## Venues: this session is not the only place work can run

Besides this sandbox, work can run in a local Claude Code CLI, in Cowork on the desktop, through **Dispatch** (a phone-to-desktop relay, attended: the machine must be awake with the app open), on GitHub's hosted runners, on a **self-hosted runner** on your own machine (unattended: it queues while the machine sleeps), and in a Claude Code Remote environment. Before concluding that something cannot be done from here, or scoping an answer to the venues visible from inside the sandbox, read [venues.md](https://github.com/mehrlander/web-tools/blob/main/docs/venues.md): what each reaches, and the attended-versus-unattended split that decides where a job belongs.

This paragraph exists to be always in context, because the failure it prevents is not failing to find a doc. It is not knowing a question exists.

## Leave it nicer than you found it

Adding to a doc is a pass over it, not just an append. New material has to match the surrounding voice and structure. Go a step further and tighten related material while you are there.

## Keep focus

When asked to look for improvements, be wary of ideas that address a hypothetical problem. A simple, clear fix is worth making; the trap is speculative work that goes off course. The test points only at tasks you conceive, not a specific user request.

The `tasks` skill owns the filing rules; load `/tasks` before writing a task file. A friction observation goes to the repo's snags log (web-tools: [`SNAGS.md`](https://github.com/mehrlander/web-tools/blob/main/docs/SNAGS.md)), one line with a `→` to the fixing doc; the third recurrence earns a task.

## Adding your own, without clobbering

The install owns only what it ships. Plugin skills are namespaced (`/portable:caption`), so a same-named skill of yours coexists; the fallback fetch hook writes a fixed file list and touches nothing else. Your own skills and any `CLAUDE.md` text below the import are never overwritten.
