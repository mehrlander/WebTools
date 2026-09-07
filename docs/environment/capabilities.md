# Capabilities: what the box can run and reach

What the Claude Code web sandbox can *do*: its toolchain, git transport, what it
can reach, the browser it ships with, and how subagents share it. For what the
box *is* and what persists, see [container.md](container.md); for how to use
these to test HTML and JS, see [testing.md](testing.md). What the **GitHub MCP
layer** does to a call and to the text it carries is
[`../github/mcp.md`](../github/mcp.md), moved out of here on 2026-09-07 having
grown to half this file.

> **Probing discipline (read first).** Most of the errors this doc has carried
> came from one habit: letting a *status code* or a *failed command* stand in for
> a fact you can observe directly. Three rules that would have caught every past
> mistake:
> 1. **Allowed vs. denied is told by a header, not a status.** A real proxy
>    denial carries `x-deny-reason: host_not_allowed`. A bare 400/403/404 with no
>    such header means the origin was *reached* and answered: the host is allowed.
>    Always probe with `curl -D -` and look at the header, not just `%{http_code}`.
> 2. **A failed download does not mean a thing is absent.** `npx playwright
>    install` failing (its CDN is blocked) says nothing about whether the binary
>    is already on disk. `ls` the path and read the env before concluding absence.
> 3. **One path's refusal is not the whole host's.** A 403 on a specific bucket
>    path (e.g. a GCS listing) is the origin's, not the proxy's. Don't table the
>    host as blocked from a single path.

## Runtime basics

*(verified 2026-05-30)*

- `node` **v22.22.2**.
- `git` works; GitHub actions go through the GitHub MCP tools, not `gh`.
- A real **Chromium is pre-installed** (see Browsers below). Headless rendering
  and screenshots *are* available in-sandbox.

## SessionStart hooks: a per-hook size ceiling, and where the cut lands

*(measured 2026-08-30)*

Past a size threshold the harness saves a hook's whole stdout to a file and
passes the session a preview wrapped in `<persisted-output>`, opening
`Output too large (28KB). Full output saved to: …` and then
`Preview (first 2KB):`. The hook exits 0 and reports success, so from inside the
script the cut is invisible; this is the failure the injector's rungs and the
dispatcher's warning both exist for.

Four things measured on one live session:

- **The preview is 1,997 bytes**, and it ended partway into `CONVENTIONS.md`'s
  opening. Only the head of a payload is guaranteed to arrive, which is why
  [`inject-conventions.sh`](../../.claude/skills/hooks/inject-conventions.sh)
  prints its recovery block first and
  [`session-dispatch.sh`](../../.claude/skills/hooks/session-dispatch.sh) prints
  its warning first.
- **The cap is per hook entry, not across the event.** In the same session the
  dispatcher's 28,670-character payload was cut while a separate 298-character
  SessionStart hook arrived whole. Each registered hook command gets its own
  attachment and its own verdict, so the dispatcher's guard is correctly scoped
  to its own output.
- **The transcript keeps both halves**, which is what makes the cut detectable
  after the fact rather than only at the moment it happens: the `hook_success`
  attachment's `stdout` is the full output and its `content` is what was
  injected. `web-tools-private` `sessions/tools/record.py` reads the pair into
  each record's `startup_delivery` (schema 7), and the Map view's Injection tab
  renders it.
- **The receipts are the half that is lost.** They print last, so a cut
  session's `startup_context` is byte-identical to a delivered session's. Any
  reading of what a session *received* has to come from the delivery pair above,
  never from the receipts.

The exact ceiling is still undocumented. The bound is that the smallest
persisted output in the session archive is 29.4 KB, so it sits at or below that;
`session-dispatch.sh` guards at 28,000 and the injector derives its own budget
from that number rather than carrying a second copy.

## Git transport: a per-push size ceiling

*(verified 2026-07-20)*

`git push` runs through the same proxy, which caps a single push's request
body. A push of ~757 MB (a fresh corpus of 1,435 PDFs committed at once)
returns **HTTP 413** and the whole pack is rejected:

```
error: RPC failed; HTTP 413 curl 22 The requested URL returned error: 413
send-pack: unexpected disconnect while reading sideband packet
```

`http.postBuffer` does not help: the 413 is the proxy refusing the body, not a
client buffer. The fix uses the fact that a push carries only the objects the
remote lacks, so a smaller commit is a smaller push: **split a large addition
across several commits and push after each.** Batches of ~90-130 MB cleared
reliably; ~757 MB did not (the exact ceiling is unprobed, somewhere between).
For a large tracked corpus, commit it in slices (by year, by prefix) and push
per slice; the branch and any draft PR come up on the first small push, and the
rest stream in behind it.

## Git transport: a fetched ref can be stale, and the merge that follows lies

*(measured 2026-08-14, PR #416: three merge attempts refused)*

`git fetch origin main` through the proxy can return a ref **behind** what
GitHub has. Not an error, not a warning: `origin/main` simply names an older
commit, and everything downstream reasons from it. `git merge-tree --write-tree
origin/main HEAD` then certifies a merge that GitHub refuses with **405 `Pull
Request has merge conflicts`**, and `PUT .../update-branch` refuses the same way
with 422.

The failure impersonates a GitHub bug, which is what makes it expensive. Local
git says the branch already contains main (`git merge-base --is-ancestor
origin/main HEAD` passes, so the merge is a fast-forward and cannot conflict)
while the API insists on a conflict. **That contradiction is the tell, and the
API is the one telling the truth.** Reading the PR through
`pull_request_read` returned a base SHA the fetch had never shown; closing and
reopening the PR forced a recompute and surfaced a base two commits further on.

The corrected move, in order:

1. Read the base SHA from the API (`pull_request_read` → `base.sha`), not from
   `origin/main`.
2. Fetch **that SHA explicitly** (`git fetch origin <sha>`), which defeats
   whatever is caching the ref name.
3. Merge, resolve, push, and only then check mergeability again.

A busy `main` makes this worse rather than causing it: five PRs landed under one
branch in an hour, and each stale read cost a full merge, suite run, and CI
round before the refusal. When the base is moving, re-read it from the API
immediately before every merge attempt rather than once at the start.

## Toolchain: `check-tools`, and what it omits

*(verified 2026-05-30)*

`check-tools` (a cloud-only command) prints a dated version table for the
language/build toolchain: the fastest way to read versions. But it's a **version
probe, not a capability manifest**, and its checklist is incomplete. It silently
omits things that *are* installed. Verified present though unlisted: **Ruby
3.3.6**, **PHP 8.4.19** + Composer, **PostgreSQL 16.13** and **Redis 7.0.15**
(installed, not running; start with `service postgresql start` /
`service redis-server start`), and **bun** (`~/.bun/bin/bun`, but it has known
proxy issues fetching packages; use npm/pip to install). Absent: `mongod`,
`deno`, `bundler`. Treat a `check-tools` omission as "unchecked," not "absent."
Confirm with `command -v`.

```bash
for t in ruby php composer psql redis-server bun; do command -v "$t" || echo "missing: $t"; done
```

**A pip install can leave a broken system `cryptography` in place.**
*(verified 2026-07-20)* Installing a package that depends on `pdfminer.six`
(e.g. `pdfplumber`, common for PDF table work) finds the system
`cryptography` 41.0.7 already satisfying the requirement and keeps it, but its
Rust binding then panics at import under this Python:

```
pyo3_runtime.PanicException: Python API call failed
```

The failing line is innocuous (`import pdfplumber`), so it reads as a broken
package rather than a version conflict. `pip install --user --upgrade
cryptography` (reached 49.0.0) shadows the system copy and resolves it. Suspect
this for any `pyo3_runtime.PanicException` on import from a freshly
pip-installed library.

**NLP toolchain, including small models, installs and runs.** *(verified
2026-08-02)* `pip install wordfreq scikit-learn spacy model2vec` all
succeed, `python3 -m spacy download en_core_web_sm` fetches and loads its
model (install `click` first; the spacy CLI imports it and errors without
it), and model2vec pulls `minishlab/potion-base-8M` from the Hugging Face
Hub unauthenticated, so a tiny static-embedding model runs in-session with
no torch. Measured in the concept-lab experiments, whose findings log moved to
the private estate (`local-models/instruments/concept-lab/findings.md`) on
2026-08-25.
Heavier stacks (torch, sentence-transformers) untested.

## Network access: two gates, and a browser with no egress

*(host reachability re-measured 2026-08-05, superseding the 2026-05-30 allowlist
table; the browser finding is from the same probe)*

**The shell reaches arbitrary hosts.** Ten were re-probed with `curl -D -`,
including every one the original table marked denied: all answered with the
origin's own status and none carried `x-deny-reason`. The JS CDNs, MDN,
Wikipedia and `docs.anthropic.com` are reachable.

**The headless browser reaches none of them**, including the hosts the shell
gets. `raw.githubusercontent.com`, `api.github.com` and `cdn.jsdelivr.net` all
fail with `net::ERR_CONNECTION_RESET`, whether the proxy is passed through
Playwright's `proxy:` option or `--proxy-server`, with `ignoreHTTPSErrors` and
`--ignore-certificate-errors` set. The cause was not chased.

That asymmetry is the load-bearing half. A repo page cannot be booted as-is in
the headless browser, and not because a CDN is denied: the browser has no egress
at all, so [tools/render/cdn.mjs](../../tools/render/cdn.mjs)'s interception is
what every render depends on, for every host rather than only the CDN ones. The
technique in portable form is [`../headless-vendoring.md`](../headless-vendoring.md),
and where the interceptor still falls short of jsDelivr's value-adds
(default-entry selection, generated `.min.*`, server-side CJS to ESM bundling)
is catalogued in [testing.md](testing.md).

**Two gates, not one.** Traffic goes through a TLS-inspecting proxy, and GitHub
git traffic goes through a **separate** GitHub proxy that scopes operations to
the authorized repo and limits push to the current branch. A sibling repo like
`<repo>.wiki.git` returns `Proxy error: repository not authorized` (502) even
though `github.com` itself is allowed, which is a different failure mode from a
host denial.

**If a denial does appear, the tell is a header, not a status:**
`x-deny-reason: host_not_allowed`. An allowed host returns whatever the origin
says, including a 403 of its own, and carries no deny header. Three origin
behaviours that get misread as denials: `api.github.com` 403s without auth or a
user agent, a 403 on a Google Cloud Storage *bucket path* is the origin's own,
and `docs.github.com` throws intermittent 503s (twice in about twenty tries), so
retry before calling it unreachable.

```bash
probe () { echo "== $1 =="; curl -sS -o /dev/null -D - --max-time 12 "$1" \
  | grep -iE '^HTTP/|x-deny-reason' | tr -d '\r'; }
for h in https://registry.npmjs.org/alpinejs https://cdn.jsdelivr.net/ ; do probe "$h"; done
```


## GraphQL: cannot be sent, can be typechecked

*(measured 2026-07-30)*

The box cannot POST GraphQL. The proxy serves only a pinned set of operations
(`This GraphQL query is not enabled for this session`), and repository-scoped
REST is refused on the same shell ([../github/mcp.md](../github/mcp.md)), so a
query written here ships without ever having run.

The shape question does not need the network, though, and this is the general
move rather than a GitHub trick: an API that publishes a **static schema** turns
"will this be accepted" into a typecheck. GitHub's SDL is a plain document on
`docs.github.com`, and `graphql`'s `parse` + `validate` answer offline, catching
the failure this code actually hits: a wrong field name, a wrong nesting, a
missing required argument. `npm run graphql-schema` prunes the 1.5 MB document to
the ~2 KB slice the repo's queries reach, which is what makes it committable;
[`tools/test/graphql-schema.test.mjs`](../../tools/test/graphql-schema.test.mjs)
runs the check in the normal suite.

What stays out of reach is semantics: whether a field holds what we assume, how
pagination behaves, whether permissions silently elide nodes. Those still need a
browser with a token.

## Browsers / headless rendering: available

*(verified 2026-05-30)*

A real Chromium is **pre-installed and works**, no download needed, despite the
download CDNs being blocked. The image bakes the binary in precisely so the
blocked download doesn't matter.

- Binary: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. **Chromium
  141.0.7390.37**, build **1194**.
- **`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is set in the env.** This is the
  canonical pointer: Playwright auto-discovers the binary through it, so a plain
  `chromium.launch()` finds it with no `executablePath` and no download.
- Playwright clients are version-pinned to a Chromium build. Build 1194 matches
  **`playwright@1.56.x`**; other client versions error with "executable doesn't
  exist". `npx playwright install chromium` is unnecessary here (and its CDN is
  blocked anyway).
- No `PUPPETEER_*` var is set, so puppeteer needs `PUPPETEER_EXECUTABLE_PATH`
  (or an explicit `executablePath`) pointed at the binary above. Playwright is
  the frictionless driver.

Smoke-test the binary directly (no npm needed):

```bash
B="$PLAYWRIGHT_BROWSERS_PATH/chromium-1194/chrome-linux/chrome"
"$B" --version
"$B" --headless --no-sandbox --disable-gpu \
  --dump-dom 'data:text/html,<h1>ok</h1>' 2>/dev/null | grep -o '<h1>ok</h1>'
```

**It decodes no H.264, so a page carrying video cannot be verified here**
*(measured 2026-09-05)*. `canPlayType('video/mp4; codecs="avc1.42E01E"')` returns
the empty string: this is an open-source Chromium build, which ships without the
proprietary codecs. A `<video>` element then never learns its intrinsic size, so
a screenshot shows a 300x150 default box and no frame, which reads exactly like a
broken file. Check the file itself with `ffprobe` before believing the pixels.
`document.pictureInPictureEnabled` is true, so the PiP *API* is present and
feature detection works; only playback is missing. Neither WebM nor VP9 was
tested, so an all-open-codec file may well render.

**Driving it** is in [testing.md](testing.md): launching Playwright,
screenshotting, the TLS-proxy launch flag, and rendering a full repo page.

## Surfacing files to the user: the file card

*(observed 2026-06-26)*

Output is via chat, but a *file* reaches the user through the `SendUserFile`
tool, not markdown: a `![](local-path)` image link renders as inert text or a
broken thumbnail, so write the file to disk and hand its path to the tool. The
UI draws each delivered file as a clickable element, a **file card** (also
**file chip**): image types preview inline; HTML, ZIP, and MP3 (and similar
non-previewable types) render as a chip that downloads on click. Reach for it
whenever you make an artifact the user would open, run, or iterate on (the
*Hand over the artifact* primitive in [SURFACING.md](../SURFACING.md)); the
screenshot-specific case (show a rendered PNG) is in
[headless-vendoring.md](../headless-vendoring.md#showing-the-result-in-chat).

The precise type→rendering map is visible only on the **user's** side: the
agent gets back a bare "delivered" with no view of the chip, so this is one of
the few capabilities here that can't be self-verified by rendering. Treat the
list above as observed, not exhaustive, and extend it (re-date) as more types
are confirmed.

## WebSearch is metered per session and shared across every subagent

Measured 2026-08-13 from 81 subagent transcripts in one Claude Code web
session. The refusal is explicit and names its own lever:

```
this session has used its web search budget (200 of 200 WebSearch calls).
Continue with the information already gathered instead of issuing more
searches. If more searches are genuinely needed, ask the user to raise
CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION.
```

**The pool is shared, not per-agent.** Agents dispatched later in a fan-out
found the budget already spent by earlier agents, before issuing a query of
their own. Across that run, 541 searches were attempted, 45 were refused, and
the refusals hit **19 of 75 agents**.

**One number does not reconcile, and is recorded rather than explained away.**
496 searches were actually performed across subagents alone, well past a stated
cap of 200, so the counter resets on some boundary the transcripts cannot pin
down (a container swap is known to have happened mid-session). Plan against 200
in a window, not 200 for all time.

**WebFetch is not metered**, and the same run made 1,687 fetches against 541
searches. When the budget ran out, agents independently improvised the same
workaround: fetching search-engine result pages through WebFetch, visible in
the host list as `html.duckduckgo.com` (16 agents), `bing.com` (12),
`google.com` (11), `duckduckgo.com` (11). That degrades *discovery* while
leaving *retrieval* intact, so the damage is per-claim rather than per-source:
anything from a known URL is unaffected, and anything that required locating a
document is exposed.

## Subagents share the container, not just the budget

Tested directly, both directions, in one session: a subagent read a file the
main loop had just written, and the main loop read a file the subagent wrote.
Same hostname, same `/proc/uptime` (sixteen seconds apart, so the same boot),
same `HTTPS_PROXY`, same user, same repo checkouts, same branch, same HEAD.

**What is separate is the context window, not the machine.** That single fact
explains the shared search budget, the shared concurrency cap, and why agents
can write directly into the repo for the main loop to commit. The `Agent`
tool's `isolation: "worktree"` and `isolation: "remote"` options are the
exceptions; by default everything is shared.

**Concurrency caps at 20 subagents.** Larger dispatches partially fail with
`Concurrent subagent limit reached`, raisable with
`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`. The cap's real cost is not the visible
rejection but a **silent drop**: an item that was in the roster, never
dispatched successfully, and therefore never reports. Reconcile the roster
against what actually launched, never against what was dispatched.
`ListAgents` settles it in one call.

## Subagent transcripts are durable, greppable, and outside every repo

Every subagent's full turn-by-turn transcript is a real file at
`~/.claude/projects/<session>/subagents/agent-<id>.jsonl`, holding every tool
call with its arguments. One session's set was 81 files and about 30 MB, and
they survived a container swap.

This is more recoverable than it looks: a corpus whose *written output*
preserved a URL in only 7 of 776 files still yielded **1,734 fetches across
511 hosts** when the transcripts were mined. What transcripts do **not** carry
is page link structure, because WebFetch returns a small model's answer rather
than the page's markdown; a check of `tool_result` blocks found zero markdown
links.

Because they sit outside every repo and die with the environment, distil what
matters into a committed artifact while the environment is alive.

**One contaminant worth knowing:** the WebFetch summarizer sometimes returns
`Anthropic` or `Anthropic's Claude Agent SDK` as page content on unrelated
pages. Four agents caught and excluded it independently in one run.

## `web.archive.org` is gated per container, and the container can change under a session

Diagnosed end to end 2026-08-13. A Wayback CDX harvest of hundreds of thousands
of URLs succeeded at 07:00, and every request failed by 15:05 in what presented
as the same session.

**It is not the model.** A Sonnet subagent dispatched in the same container at
the same moment as an Opus main loop returned byte-identical failures.

**It is a container swap.** `/proc/uptime` put the second container's boot eight
hours after the successful harvest. The workspace disk persists across the
swap, which is precisely what hides the transition and makes it read as one
continuous session.

Two distinct blocks, which fail differently and are worth telling apart:

- **WebFetch** returns a named harness refusal, `Claude Code is unable to fetch
  from web.archive.org`. Not a timeout, and probably constant, so anyone whose
  habit is fetching Wayback URLs that way would conclude it never works.
- **Bash `curl`** fails at the proxy with exit 35 `CURLE_SSL_CONNECT_ERROR`
  after about 11.4s. The gateway logs `connect_rejected`, "gateway answered 502
  to CONNECT (policy denial or upstream failure)". `archive.org` returns 200
  from the same shell while `web.archive.org` does not, so it is a per-host
  allowlist entry rather than an outage, and `timetravel.mementoweb.org` is
  denied too, so the obvious fallback is not one.

Rate limiting was considered and does not fit: a limit answers 429 rather than
refusing the TLS handshake, and the sibling host stayed up.

**Probe before planning around it, and never trust a reachability note that
carries no container boot time.** This supersedes both an older "archive.org is
unreachable from the sandbox" note and the same day's "verified reachable":
each was true of one container.

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 \
  "https://web.archive.org/cdx/search/cdx?url=example.com&limit=1"
```

`000` means plan without it.
