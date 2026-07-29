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

## Network access: a curated allowlist, not open egress

*(verified 2026-05-30)*

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
`SURFACING.md`, the `caption` skill, and
[`scripts/build-merge-guide.py`](../../scripts/build-merge-guide.py), because
every body written before 2026-07-28 carries the HTML pair and would otherwise
orphan its region. The constraint the new form brings: a link label is a
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
| `mehrlander.github.io/…/toss-render.html#gz=<base64url>` | link survives (bodies merged through 2026-07-12, preserved in [MERGE-GUIDE.md](../MERGE-GUIDE.md)) |
| `mehrlander.github.io/…/toss-render.html#gh=owner/repo@ref:path` | **URL wrapped in double backticks** |
| the same, percent-encoded as `%40` and `%3A` | **still wrapped** |

So it is neither the host, nor the fragment, nor a fragment-bearing link in
general, and it is not the `@` or the `:` as literal characters, since encoding
them changes nothing. The trigger was not isolated further; two candidates
remain, a slash-bearing fragment and a repo-reference shape, and separating them
would cost a write per probe for no gain in what to do about it.

**The store is at fault, not only the readback.** The section above could not
observe the stored body, because the REST API is proxy-blocked, and it named a
browser view as what would settle it. `WebFetch` of the PR's own HTML page is
that view, and it agrees with the readback: the link renders as plain text on
GitHub. For this construct the mangling is therefore in what got stored, which
is a different fault from the HTML-stripping readback and has to be worked
around at write time rather than tolerated at read time.

**What to do.** Put the tappable 🥏 in **chat**, where the same markdown links
correctly. In the body, state the toss address as a code span, which is what it
is going to become anyway, and let the reader copy it; or reach for a form that
survives, a `#gz=` toss or a `[new]` blob link, keeping the honesty gate in mind
(a blob is a view, not a render).
