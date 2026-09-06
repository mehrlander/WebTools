# Capabilities: what the box can run and reach

What the Claude Code web sandbox can *do* — its toolchain, what hosts it can
reach, and the browser it ships with. For what the box *is* and what persists,
see [container.md](container.md); for how to use these to test HTML/JS, see
[testing.md](testing.md).

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

## Network access: a curated allowlist, not open egress

*(verified 2026-05-30; **the allowlist half is superseded, see the 2026-08-05
re-measurement immediately below**)*

> [!WARNING]
> **Stale 2026-08-05 (the host allowlist, not the two-gates structure):** the
> general proxy no longer denies the hosts marked ❌ in the table below. Ten
> hosts were re-probed with `curl -D -`, including every ❌ row: all answered
> with the origin's own status and **none** carried `x-deny-reason`.
> `cdn.jsdelivr.net`, `unpkg.com`, `esm.sh`, `cdnjs.cloudflare.com`,
> `example.com`, `developer.mozilla.org`, `en.wikipedia.org` and
> `docs.anthropic.com` are all reachable from the shell now. Treat the ❌
> column as a record of 2026-05-30, not as current.
>
> **The headless browser is the opposite case, and it is the one that governs
> rendering.** Chromium reaches **no** external host, including the ✅ ones:
> `raw.githubusercontent.com`, `api.github.com` and `cdn.jsdelivr.net` all fail
> with `net::ERR_CONNECTION_RESET`, whether the proxy is passed through
> Playwright's `proxy:` option or `--proxy-server`, with `ignoreHTTPSErrors`
> and `--ignore-certificate-errors` set. The cause was not chased.
>
> So the practical rule below is **unchanged but load-bearing for a new
> reason**: a repo page still cannot be booted as-is in the headless browser,
> and not because a CDN is denied. The browser has no egress at all, so
> [tools/render/cdn.mjs](../../tools/render/cdn.mjs)'s interception is what
> every render depends on, for every host, not only the CDN ones. What *did*
> change is the shell: a session can now `curl` an arbitrary URL, which this
> section previously said it could not.

Outbound traffic goes through a TLS-inspecting proxy that enforces a host
allowlist. **The tell for a true denial is the `x-deny-reason: host_not_allowed`
response header, not the HTTP status.** A blocked host returns that header (with a
403); an *allowed* host returns whatever the origin says (200, 301, 400, 404, even
a 403 of the origin's own) and carries **no** deny header. Probe with `curl -D -`
so you see it.

**Two gates, not one.** The allowlist above is the *general* proxy. GitHub git
traffic goes through a **separate** GitHub proxy that scopes operations to the one
authorized repo (and limits push to the current branch). So a sibling repo like
`<repo>.wiki.git` returns `Proxy error: repository not authorized` (502) even
though `github.com` itself is allowed: a different failure mode than
`x-deny-reason: host_not_allowed`.

| Host | Reachable? | Notes |
|---|---|---|
| `registry.npmjs.org`, `registry.yarnpkg.com` | ✅ | `npm install` works |
| `pypi.org`, `files.pythonhosted.org` | ✅ | pip works |
| `rubygems.org`, `proxy.golang.org` | ✅ | gem / go module fetches |
| `github.com`, `api.github.com`, `codeload.github.com` | ✅ | `api.github.com` 403s without auth/UA, but no deny header → reachable |
| `raw.githubusercontent.com` | ✅ | raw source files: the reliable fetch path |
| `docs.github.com` | ✅ | *(2026-07-30)* static documents, no token. The published GraphQL SDL (`/public/fpt/schema.docs.graphql`, 1.5 MB) is the one we fetch. Intermittent 503, twice in about twenty tries from both `curl` and node, so retry before calling it unreachable |
| `objects.githubusercontent.com`, `release-assets.githubusercontent.com` | ✅ | release-asset binaries |
| `storage.googleapis.com`, `s3.amazonaws.com` | ✅ | object storage. 400 at root = reached; a 403 on a *bucket path* is GCS's own, not a denial |
| `fonts.googleapis.com`, `fonts.gstatic.com` | ✅ | Google Fonts load |
| `api.anthropic.com` | ✅ | but auth is session-bound; don't assume arbitrary scripts can call it |
| `cdn.jsdelivr.net`, `unpkg.com`, `esm.sh`, `cdnjs.cloudflare.com` | ❌ | `x-deny-reason: host_not_allowed`. The JS CDNs our pages use at runtime |
| `cdn.playwright.dev`, chrome-for-testing download CDNs | ❌ | browser-binary download hosts (moot: binary is pre-installed) |
| `docs.anthropic.com`, `console.anthropic.com` | ❌ | denied (the API host is allowed; the docs host isn't) |
| `developer.mozilla.org`, `en.wikipedia.org`, `stackoverflow.com`, `example.com` | ❌ | the open web is not reachable |

**Implication that bites:** our pages load Alpine / Tailwind / daisyUI / Phosphor
from **jsDelivr + unpkg at runtime**, both denied. So a repo page **cannot be
booted as-is**, but it *can* be rendered if you vendor those deps first (see
[Rendering a repo page](testing.md)). npm and GitHub-raw are the reliable fetch
paths. *(2026-06-11)* Note the block is **per-host, not per-package**: those CDNs
serve the same npm-published files that `registry.npmjs.org` does, so any page
dep can be vendored with `npm i -D` and served to the browser by the render
harness's interceptor (`tools/render/cdn.mjs`). What the raw tarball *doesn't*
include are jsDelivr's value-adds — default-entry selection, auto-generated
`.min.*` files, server-side CJS→ESM bundling — which `cdn.mjs` emulates (its
remaining gaps are catalogued in [testing.md](testing.md)). The portable form of
this whole vendor-and-intercept technique is [`../headless-vendoring.md`](../headless-vendoring.md);
this section owns the environment facts it builds on.

Re-check (note the `-D -` and the deny-header grep, that's the whole point):

```bash
probe () { echo "== $1 =="; curl -sS -o /dev/null -D - --max-time 12 "$1" \
  | grep -iE '^HTTP/|x-deny-reason' | tr -d '\r'; }
for h in https://registry.npmjs.org/alpinejs \
  https://raw.githubusercontent.com/mehrlander/web-tools/main/lib/gh-api.js \
  https://storage.googleapis.com/ https://cdn.jsdelivr.net/ https://esm.sh/ ; do
  probe "$h"; done
```

## GraphQL: cannot be sent, can be typechecked

*(measured 2026-07-30)*

The box cannot POST GraphQL. The proxy serves only a pinned set of operations
(`This GraphQL query is not enabled for this session`), and direct REST via
`curl` is gated too, so a query written here ships without ever having run.

The shape question does not need the network, though, and this is the general
move rather than a GitHub trick: an API that publishes a **static schema** turns
"will this be accepted" into a typecheck. GitHub's SDL is a plain document on
`docs.github.com` (allowed, see the table above), and `graphql`'s `parse` +
`validate` answer offline, catching the failure this code actually hits: a wrong
field name, a wrong nesting, a missing required argument. `npm run graphql-schema`
prunes the 1.5 MB document to the ~2 KB slice the repo's queries reach, which is
what makes it committable; [`tools/test/graphql-schema.test.mjs`](../../tools/test/graphql-schema.test.mjs)
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

**Driving it** — launching Playwright, screenshotting, the TLS-proxy launch flag,
and rendering a full repo page — is in [testing.md](testing.md).

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

## Reading a PR body back: the GitHub MCP readback strips HTML

*(measured 2026-07-28)*

The GitHub MCP tools are the only path to the GitHub API from this box: a direct
`curl` to `api.github.com` with the session's `GITHUB_TOKEN` returns 403 with
`"GitHub access is not enabled for this session"`, from the agent proxy rather
than from GitHub. That matters here because it removes the obvious way to check
what the API actually stored.

The token is not inert, which is what makes this worth stating precisely
(*sharpened 2026-07-29*): `GET /user` returns 200 and identifies the account.
Only repository-scoped paths are refused, and account-wide ones are refused
separately with `sessions are bound to their configured repositories`. So the
token reaches identity and nothing else, and an authenticated probe against
`/user` is not evidence that the API is usable.

**Reading a pull request body through `pull_request_read` does not return the
body as written.** The readback strips HTML comments and HTML tags, and it does
so anywhere in the string, including inside code spans and fenced blocks, which
is what makes it a raw-text strip rather than markdown-aware sanitization. It
also entity-encodes text, so an apostrophe comes back as `&#39;`.

Probe results, written with `update_pull_request` and read with
`pull_request_read`:

| Written | Read back |
| --- | --- |
| a plain sentinel word | survives |
| `'` in ordinary prose | `&#39;` |
| an HTML comment | removed |
| the same comment inside a code span | removed, leaving empty backticks |
| the same comment inside a fence | removed, leaving an empty fence |
| `[//]: # (label)` | **survives** |
| `<a name="x"></a>` | removed |
| `<tip>` as a placeholder in an address *(2026-08-22)* | removed |

The last row is the same rule and the worst case of it, which is why it is worth
a line of its own: a placeholder is not markup anybody meant as markup, and it
is the natural way to write an address in prose. `app/?use=<sha>&view=<key>`
reads back as `app/?use=&view=`, an address that looks complete, looks wrong in
a way that reads as a bug in the thing being described, and invites a session to
"fix" a body that was never broken. PR #481's own body did exactly that. Write
placeholders as plain words.

**Why this is a readback fault and not a write fault.** The same content written
through `create_or_update_file` and read back with `git show` from a fetched ref,
with no MCP in the read, round-trips byte for byte. So tool arguments arrive
intact and the write path does not sanitize. Rule 1 of the probing discipline
above, in a new costume: one observation through one tool looked like a corrupted
PR body, and a control through a second, non-MCP read path localized the fault to
the reader.

**The honest limit.** The stored body could not be observed directly, because the
REST API is proxy-blocked and the session's two GitHub MCP servers ship identical
instructions, so their agreement is not independent confirmation. That the store
is intact is an inference from the file-write control. Viewing the PR's source in
a browser would settle it.

**Consequence for the guide region, since fixed.** [SURFACING.md](../SURFACING.md)
and the `caption` skill used to delimit the managed region of a PR body with
`<!-- guide -->` and `<!-- /guide -->`. An agent reading the body through this
path saw no delimiters and therefore no region, and a sync that cannot find its
region appends a second one or overwrites hand-written prose, which is the
outcome the delimiters exist to prevent. A human editing in the GitHub UI was
unaffected throughout.

The markdown link-label form `[//]: # (guide)` survives the round trip and also
renders as nothing, so it is now what gets written. Recognition accepts both, in
`SURFACING.md` and the `caption` skill, because every body written before
2026-07-28 carries the HTML pair and would otherwise orphan its region.
(A third reader, `scripts/build-merge-guide.py`, was retired with the merge
guide on 2026-08-05.) The constraint the new form brings: a link label is a
reference definition, so it must start a line and sit between blank lines, and
inside a list item or a blockquote it can render literally.

The generalizable half is worth more than the fix. A delimiter is only as good
as its worst reader, and this one was chosen for how GitHub renders it without
anyone checking how an agent reads it back. When a marker exists so that a
machine can find something later, test the round trip through the path that
machine will actually use.

## Writing a PR body: a `#gh=` toss URL comes back code-fenced

*(measured 2026-07-29)*

A 🥏 toss link written into a pull request body as ordinary markdown does not
stay a link. Written as `[label](https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=owner/repo@ref:path)`,
it is stored with the URL wrapped in double backticks, `[label](``https://…``)`,
which GitHub then renders as plain text. The label survives; the link does not.
This matters because [SURFACING.md](../SURFACING.md) makes a branch toss the
guide PR's "thing to open" whenever the change is a page shell, so the body's
most important link is exactly the one that breaks.

Controls, all in the same body or an adjacent one:

| URL in a markdown link | Result |
| --- | --- |
| `github.com/…/blob/<ref>/<path>` | link survives |
| `github.com/…/compare/main...<branch>` | link survives |
| `github.com/…/blob/main/<path>#<heading-anchor>` | link survives |
| `mehrlander.github.io/…/toss-render.html#gz=<base64url>` | link survives (measured against PR bodies merged through 2026-07-12) |
| `mehrlander.github.io/…/toss-render.html#gh=owner/repo@ref:path` | **URL wrapped in double backticks** |
| the same, percent-encoded as `%40` and `%3A` | **still wrapped** |
| `github.com/…/blob/main/<path>#<long-hyphenated-anchor>` | **wrapped** *(2026-07-29)* |
| `[main](<blob url>)/[diff](<compare url>)`, the caption's own pair | **wrapped from `[main](` to the end** *(2026-07-29)* |
| a bare `blob/<branch>/<path>`, siblings in the same folder unaffected | **wrapped, inconsistently** *(2026-07-29)* |

So it is neither the host, nor the fragment, nor a fragment-bearing link in
general, and it is not the `@` or the `:` as literal characters, since encoding
them changes nothing. **Superseded 2026-08-09 by the subsection below:** the
sentence that stood here said the trigger was not isolated further and that
separating the two remaining candidates would cost a write per probe for no gain
in what to do about it. Eight probes across two writes separated them, and there
was a gain: the workaround is one character of the address, not a different link.

### Isolated: a slash in the ref, plus a `:path`

*(measured 2026-08-09, PR #388, two writes of eight probe links, each read back
through the MCP)*

> [!WARNING]
> **Stale 2026-08-25 → "The trigger is length, not shape" below:** this
> conclusion does not reproduce. A 132-character `#gh=` address carrying both a
> slashed ref and a `:path` survives today, so the trigger is the URL's length
> and not the scp-style ambiguity argued for here. Whether the behavior changed
> or this probe's real URLs were longer than the abbreviated forms in the table
> suggest cannot be told from what was recorded.

| Address | Result |
| --- | --- |
| `toss-render.html#gh=o/r@claude/some-branch:pages/p.html` | **wrapped** |
| the same plus `?view=map&tab=claims` | **wrapped** |
| the same plus a second `#view=map` fragment | **wrapped** |
| `toss-render.html#gh=o/r@claude/some-branch` (ref, no `:path`) | survives |
| `toss-render.html#gh=o/r:pages/p.html` (`:path`, no ref) | survives |
| `toss-render.html#gh=o/r@848d92e:pages/p.html` (slash-free ref, `:path`) | survives |
| `branch.html#gh=o/r@main:pages/p.html` | survives |
| `branch.html#gh=o/r@claude/some-branch` | survives |

The trigger is **a ref containing a slash together with a `:path`**, and neither
half alone. `owner/repo@claude/a-branch:pages/p.html` is the scp-style
`user@host:path` remote that git itself accepts, so a sanitizer treating it as a
URL with a non-web scheme is behaving sensibly on a string that genuinely is
ambiguous. Nothing about the query, a second fragment, or the page being
addressed matters; the earlier table's `#gh=owner/repo@ref:path` row happened to
use a slash-bearing ref and read as though the whole form was doomed.

It hits nearly every guide PR, because Claude Code names every branch
`claude/<something>`. Two workarounds, and the first is what
[SURFACING.md](../SURFACING.md) already asks for: **address the commit SHA**
rather than the branch, which is slash-free and is also what the guide template
means by "branch preview w/ commit SHA". Or link the branch page, which carries
no `:path` at all. A chat reply is unaffected; this is a write-path fault in one
API.

**The store is at fault, not only the readback.** The section above could not
observe the stored body, because the REST API is proxy-blocked, and it named a
browser view as what would settle it. `WebFetch` of the PR's own HTML page is
that view, and it agrees with the readback: the link renders as plain text on
GitHub. For this construct the mangling is therefore in what got stored, which
is a different fault from the HTML-stripping readback and has to be worked
around at write time rather than tolerated at read time.

**It is not only the toss URL, and the anchor row above has a counterexample.**
*(measured 2026-07-29)* Two further constructs mangle, both confirmed at the
render level by `WebFetch` of the PR's own page, not merely in the readback. A
blob URL carrying a long hyphenated heading anchor wraps, though the table's
short-anchor row says such links survive, so anchor length or content matters and
"survives with an anchor" is too strong. And the surfacing caption's own
`[main](…)/[diff](…)` pair wraps as one span running from `[main](` to the end of
the bullet, which matters more than the rest of this section: [SURFACING.md](../SURFACING.md)
makes that pair the standard shape of every Changed row, so the default caption
does not survive being written into a body.

The trigger still is not isolated, and the earlier judgment that isolating it is
not worth a write per probe stands. Rewriting a body into plain standalone
`[label](url)` rows, no pairs and no anchors, cut it from every row to one of
nine, so it **reduces incidence and does not eliminate it**: in that rewritten
body a bare `blob/<branch>/<path>` link wrapped while two sibling links to files
in the same folder did not. So there is no known-safe form to prescribe, and any
rule of the shape "this construct is fine" would be the overclaim this file's
probing discipline warns about.

What survives as guidance is a procedure, not a form: **after writing a body,
read it back and look for `` `` `` around a URL, then rewrite or drop whatever
wrapped.** Restructuring usually clears it (linking a folder once instead of
three files in it). The full caption, pairs and all, still belongs in chat, where
it renders correctly.

**What to do.** Put the tappable 🥏 in **chat**, where the same markdown links
correctly. In the body, state the toss address as a code span, which is what it
is going to become anyway, and let the reader copy it; or reach for a form that
survives, a `#gz=` toss or a `[new]` blob link, keeping the honesty gate in mind
(a blob is a view, not a render).

### The caption's own habits, isolated

*(measured 2026-08-08, PR #372, probe lines written and read back)*

Three of the shapes the surfacing caption writes by default were separated from
the toss findings above by their own probes. A `](url)/[` pair joined by a bare
slash wraps **even with clean URLs on both sides**, which pins the 2026-07-29
caption-pair row above on the joining slash rather than on either link. A
compare URL carrying a `#diff-<hex>` per-file anchor wraps, while the plain
compare URL survives. And the toss form carrying both `?use=` and `#gh=` wraps
while the `#gh=`-only form passes; under `#gh` a page's relative dependencies
already load from the addressed ref, so dropping `?use=` loses nothing. The
substitutions (`, ` between links, plain compare URLs, no `?use=` on a body's
toss) are rules in [SURFACING.md](../SURFACING.md)'s caption primitive; this
entry is their evidence.

### Path depth: at most one slash, and the SHA fix does not clear it

*(measured 2026-08-10, PR #385, eight probes over two comments)*

> [!WARNING]
> **Stale 2026-08-25 → "The trigger is length, not shape" below:** depth was the
> correlate and length was the cause. Every observation here is retrodicted
> exactly by the 150-character rule: `:pages/annotate.html` on a SHA ref is 146
> characters and passed, `:docs/envelopes/data-view.md` is 154 and wrapped,
> `:pages/show-repo/show-repo.html` is 157 and wrapped. A deeper path is a
> longer URL, which is why counting slashes worked as far as it did.

On a `#gh=` address the `:path` may carry **at most one slash**.
`:pages/annotate.html` passes and `:pages/show-repo/show-repo.html` is wrapped,
on the same SHA ref; so is `:docs/envelopes/data-view.md`, which shares no name
with anything, so the trigger is depth and not a repeated segment. The query is
not involved, and was ruled out first: the same address passed and failed
identically with and without `?view=stage`, while a plain deployed URL carrying
a query passed.

This trigger and the slash-in-ref trigger above **compound rather than
substitute**, which is the trap: switching a wrapped link to the SHA fixes a
one-slash path and leaves a two-slash one exactly as broken, so the fix appears
not to have worked. A nested page therefore cannot be tossed from a body at
all; link the branch page, which carries no `:path` and passed clean, or hand
the reader a `#gz=`.

### The trigger is length, not shape

*(measured 2026-08-25, PR #497, five rounds: four written into the PR body, one
into an issue comment, each read back through the MCP)*

**A URL of 150 characters or more inside a markdown link is wrapped. 149 or
fewer survives.** Nothing else about the URL matters, and the threshold is the
same on both write paths, a PR body and an issue comment alike.

| round | held fixed | varied | result |
| --- | --- | --- | --- |
| 1 | base URL | at-sign, slashed ref, percent-encoding, bare text | all six intact; only the original (168) wrapped |
| 2 | at-sign present | 40-hex SHA, branch length, param count | 130, 131, 143 intact; 155 wrapped |
| 3 | 40-hex SHA present | length, and the at-sign swapped for a hyphen at equal length | 138, 144, 148 intact; **both** 155 rows wrapped |
| 4 | everything else | length, one character apart | 148, 149 intact; 150 to 156 wrapped |
| 5 | length under 150 | `#gh=` with a slashed ref and a `:path`, ref only, path only, plain blob | all four intact, including 132 with both |

Round 3's hyphen control is what carries the argument. The same 155-character
URL wraps whether or not it contains the `owner/repo@ref` that the two
subsections above name as the trigger, so the ref cannot be doing the work.
Round 5 is the other side of it: the exact shape those subsections say is
doomed passes when it is short enough.

The prior findings are not wrong observations, they are correctly observed
correlates. The 2026-08-10 depth measurement is retrodicted exactly by the
threshold, all three of its cases falling on the right side of it, which is a
stronger check than any of my own rows: a deeper `:path` is a longer URL, and
counting slashes was counting characters by proxy. A toss carrying `?use=` adds
a 40-character SHA. A `claude/…` branch is longer than the SHA that replaces it.
Every substitution SURFACING.md prescribed works, and works because it shortens.

Two things this does not settle, and the subsection below settles both. The
caption's `](url)/[` pair wrapped in 2026-08-08's probe **with clean short URLs
on both sides**, which no length rule explains, so that row stands on its own and
was not re-tested here. And the threshold is a count of the URL, not of the whole
link: whether the label or the surrounding line contributes was not varied, since
every round held the label at `row`.

The practical form: **count the URL.** Under 150 and the link lives.

### What gets counted, and the slash-joined pair is one URL

*(measured 2026-08-25, issue #498, three comments of probe rows read back through
the MCP; the arithmetic below retrodicts all nine pair rows exactly)*

Three questions the section above left open. Each was measured against a control
at equal length, on a real resolvable URL padded to an exact character count with
a `?x=` query string.

**The label does not count. The URL alone does.** Round 6 held the URL fixed and
varied only the label across the boundary:

| row | URL | label | whole `[label](url)` | result |
| --- | --- | --- | --- | --- |
| 6a | 149 | 1 | 154 | intact |
| 6b | 149 | 60 | 213 | intact |
| 6c | 149 | 120 | 273 | intact |
| 6d | 100 | 60 | 164 | intact |
| 6e | 150 | 1 | 155 | **wrapped** |
| 6f | 150 | 60 | 214 | **wrapped** |

A 149-character URL survives carrying a 120-character label, and a 150-character
URL wraps carrying a one-character label. So "count the URL" was exactly right,
and a construct running well past 150 is fine as long as its URL does not.

**The boundary is inclusive at 150.** Round 7 held the label at one character and
stepped the URL one character at a time: 146, 147, 148 and 149 intact; 150, 151
and 152 wrapped. 150 is the first length that wraps, and 149 the last that
survives, which is what the rule already said and had not bracketed.

**The slash-joined pair is not an exception. It is the same rule over a longer
span.** `)/[` does not end the URL token, so the sanitizer measures from the
first URL's first character through the second URL's last character, the joining
punctuation and the *second label* included:

```
span = len(url1) + len(")/[label2](") + len(url2)
```

Round 8 used pairs whose URLs were individually far under the boundary, and round
9 bracketed the span itself one character apart:

| row | url1 | label2 | url2 | span | result |
| --- | --- | --- | --- | --- | --- |
| 9c | 45 | `diff` | 45 | 99 | intact |
| 9a | 70 | `diff` | 70 | **149** | intact |
| 9b | 70 | `diff` | 71 | **150** | **wrapped** |
| 8d | 72 | `diff` | 73 | 154 | **wrapped** |
| 9e | 70 | `diffdiffdiffdiffdiff` | 70 | 165 | **wrapped** |
| 8a | 80 | `diff` | 81 | 170 | **wrapped** |
| 8c | 100 | `diff` | 101 | 210 | **wrapped** |

The 9a/9b pair is what pins it: one character apart, on the same 149/150
boundary the lone URL obeys, which also fixes the span's extent exactly (had the
trailing `)` been inside it, 9a would have measured 150 and wrapped). 8d is the
row that made the pair look like an exception, since 72 and 73 characters are
less than half the threshold, yet their span is 154. And 9e is why the second
label counts while the first does not: the first label sits *before* the token
starts, the second sits *inside* it.

Comma-joined controls at identical URLs, 8b (80, 81) and 9d (70, 71), are intact,
as is 8e, a lone 80-character link. `, ` ends the run, so each URL is measured on
its own.

So `[main](…), [diff](…)` remains the rule, and it is now an instance of the
arithmetic rather than a standing exception to it. The 2026-08-08 observation
that a pair wraps "with clean URLs on both sides" was true and its conclusion was
one measurement short: two clean URLs of 70-odd characters make one dirty span of
150-odd.

**Both write paths agree, confirmed rather than assumed.** Rounds 6 through 9
ran on issue comments; round 10 put the two discriminating rows into PR #499's
body and got the same answers: a 149-character URL under a 120-character label
intact, a 150-character URL under a one-character label wrapped, a pair at span
149 intact and at span 150 wrapped, and the comma control intact. The earlier
150 bracket was measured on a PR body and this one on an issue comment, so each
finding now stands on both paths.

**A code span is rewritten too, so it is not the safe harbour it looks like.**
*(measured 2026-08-25, issue #498 round 11, after five repaired PR bodies showed
it incidentally)* The threshold applies to a URL **anywhere in the markdown**,
not only inside a link. A plain single-backtick code span holding a 148 or
149-character URL comes back untouched; at 150 and 151 it is stored as
`` ``'URL'`` ``, double-backticked with single quotes added around the address.
Nothing dies, since a code span was never a link, but a reader copying it picks
up the quotes. So "state the toss address as a code span" further up this file
still beats a defanged link and is still not a way to write a long URL that the
write path leaves alone. The only untouched forms are a URL under 150 and a
chat reply.

**One caveat on the wrapped form.** Where the span opens and closes is not
consistent in the stored body. 9b came back with the backtick opening after
`[main](` and closing before the final `)`, while 8a's closing backtick fell
after it and 8c's opening backtick fell before `[main](`. The measured length is
stable across all of them; only the re-serialization wanders. Look for a backtick
anywhere near a URL, not at a fixed offset.

**An angle-bracket placeholder is eaten, backticks included.**
*(one observation, 2026-08-29, PR #546's body; not bracketed the way the length
rows above are)* A body written through the MCP had `` `stale -> <id>` `` in it
and read back as `` `stale -> ` ``, the placeholder gone and the `>` of the
arrow escaped to `&gt;`. That is HTML sanitization rather than the length rule:
`<id>` parses as an unknown tag and is dropped, while a bare `>` survives as
text. A code span did not protect it, which is the part worth knowing, since
the length rule's safe harbour is the same construct.

Distinct from wrapping in the way that matters: a wrapped URL is disfigured but
still there, and a dropped placeholder leaves a sentence that reads as finished
and says nothing. Write a concrete example (`stale -> ccb6cfc`) rather than a
placeholder in any body or comment written this way. Chat replies are untouched,
as with everything else in this section.

## MCP: two servers can share a tool name, and only one may work

*(measured 2026-07-29)*

A session carries both **built-in** MCP servers and **connectors** installed
through claude.ai. The two can expose identical tool names, and tool discovery
returns either. Connector calls in a web session fail:

```
MCP error -32003: MCP tool call requires approval
```

Server-level approval validation fires before Claude Code's own permission
logic, and no approval UI is reachable from here. One tool, two servers, minutes
apart in the same session:

| Server | Log directory | `update_pull_request` |
| --- | --- | --- |
| `mcp__github__` (built-in) | `mcp-logs-github` | completed in 1s |
| `mcp__8d0009e2-…__` (a GitHub connector) | `mcp-logs-8d0009e2-…` | `-32003` |

**Telling them apart.** A connector is surfaced under a UUID, which names
nothing. Its per-server log resolves it: `mcp-logs-<id>/` under
`~/.cache/claude-cli-nodejs/<root>/` records each call under the server's real
name (`tool_name=mcp__mehrlander__update_pull_request`). One grep, and it is
worth making the first triage step rather than the last.

**`-32003` is not the only symptom** *(added 2026-08-15, same connector id)*. The
connector can also answer a plain **`403 Resource not accessible by
integration`**, GitHub's own wording for an app missing a permission, which reads
as a settled fact rather than as a routing question. `create_pull_request` on
`mcp__8d0009e2-…__` returned it for three repositories in a row; the identical
call on `mcp__github__create_pull_request` opened all three. Reads on the
connector were unaffected (`list_pull_requests` and `pull_request_read` both
worked), so the asymmetry looked exactly like `pull_requests: read` without
`write`, which is the wrong diagnosis it invites.

What sealed it was a second probe that appeared to confirm it: a direct `curl` to
`api.github.com` with `GITHUB_TOKEN` also returned 403. That is the **agent
proxy's** refusal, documented under "Reading a PR body back" above, and it says
nothing about any installation's permissions. Two independent-looking 403s
agreed and neither was about scope. So: read that curl result as "the API is
unreachable from the shell," never as a permission finding, and treat **any**
unexpected refusal on a UUID server as a routing candidate first.

**The rules.** On `-32003` or an unexplained 403, call the built-in equivalent
rather than whatever discovery returned first: reload it explicitly with
ToolSearch (`select:mcp__github__<tool>`) instead of reissuing whatever is
already in hand, since discovery is what routed you wrong in the first place. Do not re-approve
on the failing server; approving does not clear the already-errored call, which
is what makes the approval flow itself look broken. A capability that exists
*only* on a connector has no in-session workaround, which for `add_repo` means
attaching repositories when the session is created.

**Generalize it past GitHub.** Whenever a provider has more than one server
connected, a permission surprise on one of them is more often a routing problem
than a permission wall. Check for a sibling server exposing the same tool before
treating the wall as real. This is the durable rule; the specific reshuffle that
spawns a UUID-named twin is incidental and will look different next time.

**Allowlisting is not the fix, and the reason matters.** Permission entries key
on the exact server name, and a connector wears a per-connection UUID, so next
session's name differs and nothing can be pinned. That is separate from the
upstream finding below, which is that allowlisting fails even when you can name
the server. Two independent reasons, same conclusion. This section supersedes
[github/mcp-server-routing.md](../github/mcp-server-routing.md), a 2026-07-15
observation kept as a record: it reached the same operative move from a
different and less well-evidenced account of the cause.

Upstream reports the same failure for Gmail, Calendar, and Microsoft 365
connectors in scheduled runs, and calls it a regression:
[#61044](https://github.com/anthropics/claude-code/issues/61044) (open) and
[#61027](https://github.com/anthropics/claude-code/issues/61027) (closed as a
duplicate of #61015). Reconnecting the connector, allowlisting its tools in
`settings.json`, and `CLAUDE_PERMISSION_MODE=bypassPermissions` were all tried
there and all failed.

**A `No token data found` line in these logs is not the tell,** though it reads
like one. It appears throughout the log of a server whose calls succeed.
Probing-discipline rule 1 in another costume: the conspicuous log line was the
visible thing, and the working control was the fact.

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

**The Workflow tool's cap is a different number, and it is a function of the
machine** *(measured 2026-09-06)*: min(16, CPUs minus 2) per run, per the
authoring reference, and this container reported 4 CPUs (`nproc`), so a
Workflow would have run two agents at a time against the Agent tool's twenty.
Read `nproc` before choosing the venue for a fan-out; on this box the Agent
tool wins by a factor of ten. Two more facts from the same run of 124 agents
(62 Sonnet readers of 40 items, 62 Opus skeptics of 11 to 23 rows, 17 minutes
at the cap):

- The Agent tool has no effort parameter; only Workflow's `agent()` takes one.
  A "low effort" instruction has to travel in the prompt.
- **Output on disk is not agent done.** An agent that has written its file and
  run a checker still holds its slot until it returns, so a ledger kept from
  file arrivals overcounts free slots by one or two and the next launch is
  refused. `ListAgents` is the count; the refusal is cheap and the relaunch is
  the fix.
- A validator the agent runs on its own output before returning, one script
  named in the prompt, made 124 of 124 outputs parse and conform. It is the
  Agent-tool equivalent of Workflow's `schema` option, and it is committed.
- Cost lives in the transcripts, not the notification: each transcript line's
  `message.usage` block sums to the agent's spend. That run: 91.3M tokens, of
  which 74.4M were cache reads of the shared prompt and 300k were output;
  readers averaged 105k tokens and about two minutes, skeptics 97k and about
  90 seconds.

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
