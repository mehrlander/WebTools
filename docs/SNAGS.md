# Snags

Things learned the hard way: small friction you trip over, noted so you trip on
it once, not three times. A triage queue, not just a diary. Each entry is a
one-liner (symptom, then the corrected move) with a `→` to the durable doc that
carries the full fix. Newest on top.

**Recurrence is the signal.** One trip is noise; the same trip two or three
times earns a systematic fix. An entry tracks how often it bit; a snag that
keeps recurring graduates to a [tracker](../tracker/) task that removes the
cause. The log triages, the tracker does the work.

Distinct from the other logs by what it keys on: the tracker keys on a **task**
(intent), a merge guide on a **PR** (delivery), this on a
**snag** (a recurring friction), atomic and cross-PR. Entries stay an index (a
one-liner plus a `→`), so they cannot drift from the docs that hold the fix.

*(Provisional. Whether snags are authored in guide-PR bodies and projected here
like the merge guide, the recurrence mechanism, and the format are open in
[the snags spike](../tracker/tasks/spike-snags-log-gobdyq.md). Each entry leads
with a slug so a repeat can be matched and counted.)*

---

### headless-shot-prose-flat: typography CSS misses in screenshots
Chased flat prose headings in a shot as though the page were broken, including
a pointless `npm i -D @tailwindcss/typography`; the limit was already
documented, dated 2026-08-01: the typography npm tarball ships no built CSS,
so `cdn.mjs` has nothing to resolve and markdown renders unstyled in every
harness while the deployed page styles it fine. Read the documented limits
before debugging shot pixels. *(seen: 2026-08-07)*
→ [environment/testing.md](environment/testing.md)
Marked a section `Wrong` after measuring its rule false, leaving a banner that
described text already replaced, in a doc `CLAUDE.md` points every session at.
"Annotate, do not rewrite" governs records; a living document gets fixed. The
convention was loaded the whole time and did not say so. *(seen: 2026-08-06)*
→ [CONVENTIONS.md](CONVENTIONS.md)

### ci-run-silently-not-started: a commit sat in an open PR with no checks
A push to a PR branch produced no `synchronize` workflow run. Not a failure, not
a cancellation, no run at all, so the PR's head commit carried zero checks and
the only signal was a `get_check_runs` that returned an empty list. The next push
to the same PR ran normally, so nothing is broken; what correlated was pushing
the branch and then its base branch within the same minute, which moves the merge
ref the `pull_request` event is computed against. The cause stays unconfirmed and
the corrected move does not depend on it: **after a push you care about, confirm
a run exists for the new head sha** instead of assuming the trigger fired. The
general form is the one worth carrying: a green check and an absent check look
the same from a distance, and only the first is evidence. *(seen: 2026-08-06)*
→ [.github/workflows/test.yml](../.github/workflows/test.yml)

### fragment-goto-does-not-reload: a render scenario asserts against stale state
A `--script` scenario re-loaded the page under test at a series of fragments with
`page.goto(url + '#item=1')`, then read the page's state after each. A goto that
changes only the fragment is a **same-document** navigation, so nothing
re-fetched, the page's boot code never re-ran, and every read returned the
previous case. Three of eight assertions passed against state the scenario had
not actually produced. The navigation succeeds, so there is no failure to notice.
Add `page.reload()` after the goto whenever the point is what the page does *on
load* at that fragment. Generalizes past this harness: any assertion about
initialization behind a URL that differs only after the `#`. *(seen: 2026-08-06)*
→ [environment/testing.md](environment/testing.md)

### word-boundary-before-alternation: a scan reports zero and looks authoritative
`\b(TOKEN|SECRET|...)` never matches inside `GH_TOKEN` or `AWS_SECRET_ACCESS_KEY`,
because there is no word boundary between `H` and `T`. A credential scan written
that way returned zero findings against six real credential-shaped lines, ran
clean, and printed a number. Anchor with a prefix group instead
(`[A-Z0-9_]*(?:TOKEN|SECRET|...)[A-Z0-9_]*`). The wider move: a detector whose
failure is an empty result needs a negative control, meaning a fixture that must
match, or you cannot tell "found nothing" from "cannot see." Verifying the fix
also went wrong once here: reintroducing `\b` in front of the new prefix group
does not reproduce the bug, since the prefix matches zero-width and backtracks.
*(seen: 2026-08-03)*
→ [web-tools-private `sessions/tools/test-redact.py`](https://github.com/mehrlander/web-tools-private/blob/main/sessions/tools/test-redact.py)

---

### https-block-resets-instead-of-403: a blocked host looks like a network flake
An outbound request dies with `Recv failure: Connection reset by peer` and reads
as a flake or a TLS problem. Over HTTPS the proxy's CONNECT tunnel succeeds and
TLS is then reset, so no deny header is ever sent and `curl -D -` shows nothing:
the documented probe cannot see a policy denial at all. Re-probe the same host
over plain `http://`, where the block answers `403` with `x-block-reason:
hostname_blocked`. Note both halves of that header are renamed from the
`x-deny-reason: host_not_allowed` the docs carried. *(seen: 2026-08-03)*
→ [environment/capabilities.md](environment/capabilities.md)

---

### phosphor-weight-is-a-family: an icon renders as nothing at all
`ph-push-pin-fill` is not an icon. Phosphor's weights are font families, not name
suffixes, so the class pair is `{weight} ph-{name}` (`ph-fill ph-push-pin`). A
name the font does not carry produces a zero-width blank with no console error,
so a missing glyph reads as a logic bug and gets debugged as one. Measure the
element's width before suspecting the state that controls it.
*(seen: 2026-07-28)*
→ [../skills/phosphor-icons/SKILL.md](../skills/phosphor-icons/SKILL.md)

---

### daisy-divide-paints-black: hairlines come out black, not grey
`divide-y divide-base-200` renders black lines. daisyUI ships its semantic colours
as its own utilities and `divide-*` is not among them, so `divide-base-200`
compiles to nothing and is dropped silently; Tailwind v4 then defaults
`border-color` to `currentColor` (v3 defaulted to `gray-200`), leaving the
divider painted in the text colour. Use `gap`, or an explicit
`[&>*+*]:border-t border-base-200`. Same trap in `ring-*` and `outline-*`.
*(seen: 2026-07-28)*
→ [../skills/daisy-alpine/SKILL.md](../skills/daisy-alpine/SKILL.md)

---

### x-collapse-needs-x-show: a panel renders at zero size
A component mounts with correct state yet renders at zero size: `x-collapse` with
no companion `x-show` sets `el.hidden` (the plugin keys on `_x_isShown`). Pair
the two, or use a plain `x-if` for presence toggling. A green logic test won't
catch it; only a render does. *(seen: 2026-07-15)*
→ [environment/testing.md](environment/testing.md)

---

### mcp-approval-is-often-routing: an approval prompt that is really a wall
A GitHub MCP call "requires approval" though the same operation runs clean
elsewhere: a reconnected second server (a per-connection UUID twin) is holding
the call. Retry on the stable `mcp__github__*` server before re-approving.
*(seen: 2026-07-15)*
→ [github/mcp-server-routing.md](github/mcp-server-routing.md)

---

### screenshot-hides-overflow: a viewport shot cannot show horizontal overflow
A full-viewport deck looked correct in every headless screenshot and burst its
right edge on a phone. A viewport shot crops what sits past the frame, so
overflow is structurally invisible to it. Measure instead: compare
`documentElement.scrollWidth` against `clientWidth`, and skip elements inside
a horizontally scrollable ancestor or every carousel slide reads as a fault.
The cause here was the usual one, a scroll track as a grid item taking
`min-width: auto` from its 100 `min-w-full` slides; `min-w-0` is the fix, the
horizontal twin of the `min-h-0` already applied to the row. *(seen: 2026-08-04)*
→ [HTML-STYLE.md](HTML-STYLE.md)

**Built a page with stat cards, page prose, and small type, against a doc that
forbids all three.** [HTML-STYLE.md](HTML-STYLE.md) exists precisely because
these corrections recur, and the `daisy-alpine` skill carries "No stat cards"
as its first rule and is installed ambient so it fires on artifact work
unprompted. It did not fire, and the session did not invoke it either, so the
page was built and shipped before anyone looked at the rule. Availability is
not invocation, which the estate already knows about `/web-tools`: **load the
skill before writing a page, do not wait for it to trigger.** The tell is
cheap, since `stats`, `stat-value`, or a tile grid in a diff is a defect by
definition. *(seen: 2026-08-04)*
→ [HTML-STYLE.md](HTML-STYLE.md)

**Trusted the network allowlist table instead of re-probing it.** The
capabilities doc's ❌ rows (the JS CDNs, the open web) were taken as current
while writing a claim that depended on them, and they had gone stale: the shell
now reaches every host tested, with no `x-deny-reason` on any of them. The
inverse also went unnoticed, and it is the half that matters for rendering: the
headless browser reaches *nothing*, including hosts the table marks ✅. A dated
capability table is a measurement, not a standing fact, so **re-probe before
resting an argument on a row, and probe both clients**, since curl and Chromium
answer differently here. *(seen: 2026-08-05)*
→ [environment/capabilities.md](environment/capabilities.md)

**Read "needs API access" as "cannot be done here," for three weeks and 147
PRs.** The merge guide went unregenerated because every note on it said
regeneration needs `api.github.com`, which the sandbox proxy 403s. Both halves
of that were true and the conclusion was still wrong: the generator took a
`--from-json` flag precisely so it could run against MCP-fetched data, and the
GitHub MCP's `list_pull_requests` returns objects of exactly that shape. **When
a doc names a blocked transport, check whether the tool already accepts another
one before recording it as blocked**, since the workaround is usually written
into the tool by whoever anticipated the block. The tell is a `--from-*` flag or
a documented offline mode in the same file that names the dependency. (The
generator has since been retired with the merge guide; the lesson is about the
reading, not the script.) *(seen: 2026-08-05)*
→ [SURFACING.md](SURFACING.md)

**Shrank a redundant artifact instead of asking whether it should exist.** Told
to settle whether the merge guide should exist before backfilling it, the
session established that a copy of each PR body was the wrong shape and replaced
it with an index of date, number, title, and link. Those are the four fields the
pulls endpoint returns, so the index was still a committed cache of a live read,
just a cheaper one. The user made the actual call: retire it. **When an artifact
turns out to duplicate a source, check whether the remainder has a job before
optimizing it**, because a smaller copy still carries a refresh obligation and
can still be out of date. The general rule now sits in the doc: do not commit
what a live read already answers. *(seen: 2026-08-05)*

**Read a PR body back through the GitHub MCP and believed the escaping.** A
`?use=…#gh=…` toss link in a PR body came back wrapped in double backticks, so
the session concluded the links it had just shipped were dead code spans and
spent three round trips isolating the trigger (`@`? `%40`? a fragment?). None of
it was real: fetching the rendered page showed the body's links clickable and
correct. The MCP escapes fragment-bearing URLs **on read**, which the guide-region
note already knew in its own way, having been rewritten once because the same
read path strips HTML comments. Two rules follow, and the second is the general
one: **the MCP read-back is not the rendered artifact**, so confirm a rendering
claim against the page itself; and a probe that reads through the layer under
suspicion cannot clear it. The escaping *is* real for `add_issue_comment`, where
a fragment URL renders as literal text, so a comment carrying a toss link needs
the address checked after posting. *(seen: 2026-08-05)*
→ [SURFACING.md](SURFACING.md)

**Built a form whose fields stopped short of their labels on a phone, and
whose desktop layout was a ribbon down the middle of a 1440px screen.** Two
separate causes, both invisible without measuring. daisyUI's `.input` and
`.textarea` default to `width: 20rem` capped at 100%, so a field in a 342px
column rendered 320px wide and every row had a ragged right edge; `w-full` on
each control is the fix. And the pane was capped at `max-w-3xl` while splitting
into two side-by-side columns, so each got about 360px on any screen. **A form
in a split pane is sized by its container, not the viewport:** viewport
variants (`sm:`, `lg:`) answer the wrong question there, and Tailwind's
`@container` plus `@md:`/`@xl:` answer the right one, degrading to one column
where unsupported. Both rules now sit with the other composition rules.
*(seen: 2026-08-06)*
→ [HTML-STYLE.md](HTML-STYLE.md)
