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
no torch. Measured in the concept-lab experiments
([tools/concept-lab/findings.md](../../tools/concept-lab/findings.md)).
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

**The rules.** On `-32003`, call the built-in equivalent rather than whatever
discovery returned first: reload it explicitly with ToolSearch
(`select:mcp__github__<tool>`) instead of reissuing whatever is already in hand,
since discovery is what routed you wrong in the first place. Do not re-approve
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
