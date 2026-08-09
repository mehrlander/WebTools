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

### cross-repo-lib-consumer-invisible: in-repo greps cannot see an external runtime consumer of a lib file
The lib-kits migration measured its cost as 31 runtime call sites and 84 path
mentions, all in-repo; the one runtime consumer that would actually have broken
silently was outside it (chat-histories' life-journal.html, loading
swipe-deck.js from jsDelivr at `@main`), found only by hand-grepping the
sibling checkouts. Fixed with a fallback loader in chat-histories PR #71. The
systematic fix, if it recurs, is a consumers declaration for lib files the way
budget-wa declares embedded pages (`declared-paths`): if it is worth another
repo loading, it is worth declaring here. → web-tools PR #376.

### headless-shot-prose-flat: typography CSS misses in screenshots
Chased flat prose headings in a shot as though the page were broken, including
a pointless `npm i -D @tailwindcss/typography`; the limit was already
documented, dated 2026-08-01: the typography npm tarball ships no built CSS,
so `cdn.mjs` has nothing to resolve and markdown renders unstyled in every
harness while the deployed page styles it fine. Read the documented limits
before debugging shot pixels. *(seen: 2026-08-07)*
→ [environment/testing.md](environment/testing.md)

### pre-build-boots-alpine-early: a page's own gh.load chain runs after its components init
`branch.html` died with `Cannot read properties of undefined (reading 'fetchBrief')`.
Nothing was wrong with the kit: importing `dist/web-tools.js` boots Alpine as part
of the import (`alpine-bundle.js` is last in its auto-boot chain), so the
`gh.load` calls written underneath run after Alpine has walked the DOM and called
`init()`. Every kit the page loads for itself is undefined at that moment, and
**which one you notice is arbitrary**, being whichever `init()` touches first: the
same bug read as `reviewTarget.parse` on one path and `fetchBrief` one `await`
later on another. That is why it looked like two unrelated faults. The build
already fixes its own two instances by forcing `url-params.js` and
`repo-address.js` into the auto-boot chain, which is the tell that the hazard is
structural rather than a slip. **A page that imports the pre-build and then loads
anything of its own needs a ready gate**, declared above the module script.
Reproduce it by putting a `setTimeout` in front of the chain; a race that wins on
a fast local harness is not fixed, only hidden. *(seen: 2026-08-07)*
→ [docs/loader.md](loader.md) (timing invariant 8)

### regex-backtracking-in-a-hook: a test that "hung" was the redactor going quadratic
A new fixture made the session recorder's test run past 120s. The fixture was not
the bug: the credential redactor's `[A-Z0-9_]*` runs were unbounded, so the engine
retried the greedy run at every offset, quadratic in the length of any unbroken
`[A-Za-z0-9_]` stretch (0.014s at 500 characters, 0.86s at 4,000). It runs on the
**full** tool result before any cap applies, and inside a `Stop` hook, so the real
symptom is not a slow test: it is a turn held open with nothing on stderr, in a
file whose docstring promises it can never stop a turn. This estate feeds it
`#gz=` base64url payloads routinely, which is exactly the shape that triggers it.
**Bound every quantifier that can span attacker- or data-controlled text**, and
prefer a cost assertion to a correctness one where the failure mode is a hang.
*(seen: 2026-08-07)*
→ [sessions/tools/record.py](https://github.com/mehrlander/web-tools-private/blob/main/sessions/tools/record.py)

### marker-on-a-living-doc: annotated a doc instead of fixing it
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

**Corrected 2026-08-07: the escaping happens on WRITE too, and it corrupts the
stored body.** The entry above reads the damage as a read-back artifact. It is
not. A guide body written through `update_pull_request` comes back from GitHub
with its `&` HTML-escaped and, past a threshold, the whole markdown link wrapped
in a code span, so the Look line renders as literal text on github.com and in
every reader of the body. Measured with seven variants written and read back: a
bare URL, a fragment (`#gh=…`), an at-sign in a query value, and TWO query
parameters all survive; THREE parameters get wrapped. The `&amp;` alone is
harmless, since it is the correct escape and renders as `&`; the code span is
the damage. So a body link keeps to two parameters and names any third in prose,
and a body carrying a live link is read back after writing. Twice before
measuring this I attributed the corruption to a typo in someone else's PR body,
which is what an unverified guess about another author looks like.
*(seen: 2026-08-07)*
→ [SURFACING.md](SURFACING.md)

**`prose` is not available on most pages, and it fails silently.** A guide body
rendered on `pages/branch.html` with `prose prose-sm` came out with no bullets
and no link color. Adding `@tailwindcss/typography` to the page's jsDelivr
combine did not fix it: the stylesheet loaded, and its rules still did not match,
so two rounds went into a plugin that was never the answer. The FAB had already
settled this and said so in a comment beside its own guide body: it mounts on
every page that boots lib, the plugin is a separate CDN entry not all of them
carry, and it styles markdown with explicit descendant utilities instead. The
rule is the general one and it is about search order, not CSS: **before styling
a thing the estate already renders somewhere, read how the existing renderer
does it.** The classes now live once, in `kits/guide-render.js`, at two sizes.
*(seen: 2026-08-06)*
→ [show-repo.md](show-repo.md)

**A 🌿 closer is a hosted link, so it runs main's page.** This session added the
`&pr=<n>` address to `pages/branch.html`, then handed over
`…/pages/branch.html#gh=owner/repo&pr=364` in chat. github.io serves the page
file from the default branch, so the link ran **main's** copy, which has no
`pr` handling, read the address as a repo with no branch, and showed its empty
form. Nothing errored, and the failure looked like a broken feature rather than
a link pointing at the wrong build. The same turn had used the correct toss form
in the PR body, which is the tell: the rule was known and applied in one place
and not the other. **A page-shell change is not shown by any hosted link,
including the caption's own 🌿 and 🧭 closers**, so toss it until it merges, and
put the page's params in the address's `?query` position where the shim hands
them over whole. *(seen: 2026-08-06)*
→ [showing.md](showing.md)

**A daisyUI color inside an arbitrary variant generates nothing, silently.**
Guide bodies were styled with `[&_a]:text-primary [&_ul]:list-disc …`, and the
links were never blue, in the FAB since PR #295 and on the branch page since the
kit was extracted. The cause is a split nobody would guess from the class list:
daisyUI ships its color utilities PREBUILT in its own stylesheet, so a bare
`text-primary` works, while the arbitrary-variant form has to be generated by
the Tailwind browser build, which never sees daisyUI's theme tokens and emits no
rule. Core utilities in the same string (`underline`, `list-disc`) generated
fine, which is what made it invisible: the body looked styled. **A component
that must style content it did not author should ship a stylesheet, not a class
list**, since the class list depends on a generation step it cannot verify.
`kits/guide-render.js` injects one, and a test asserts the link rule exists.
*(seen: 2026-08-07)*
→ [show-repo.md](show-repo.md)

**`?use=` served a stale bundle, and a comment said it could not.** A fix was
pushed, the preview link still showed the old behavior, and three rounds went
into the wrong readings: a broken fix, a stale CDN, the viewer's browser. The
loaders fetch the pinned ref's bundle from raw.githubusercontent and blob-import
it, and two page comments claimed the blob import made "a branch name
cache-safe." It defeats the MODULE cache, keyed by URL; nothing was defeating
the HTTP cache, keyed by the same URL, and a branch ref MOVES. So a preview
could serve an earlier push with nothing on screen to say so, which is invisible
by construction rather than merely easy to miss. All 33 loaders now pass
`cache: 'no-store'`, and `tools/test/use-ref-no-store.test.mjs` holds them
there, since the bug is a missing argument in files nobody edits together. The
general shape: **a comment asserting an absence of a problem is where to look
first when the problem is present**, and one that names a mechanism ("the module
cache") while implying a category ("caching") is the most convincing kind of
wrong.

**Until the fix is on main, and as the safer form afterwards: pin a COMMIT SHA,
not a branch name.** `?use=<sha>` is an immutable URL, so no cache can serve
something older; a new commit is a new address. The loader that does the
fetching lives in the DEPLOYED page, served from the default branch, so a fix
to it on a feature branch cannot help a link handed over before that branch
merges, and neither can opening the page standalone rather than through the
takeover. The guide-PR template in SURFACING.md has said "branch preview w/
commit SHA" all along; this session handed over branch names for a day and paid
for it four times. *(seen: 2026-08-07)*
→ [showing.md](showing.md)
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
