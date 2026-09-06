# Userscripts

Scripts for the [Userscripts](https://github.com/quoid/userscripts) Safari
extension, the third way to run JavaScript on a page in iOS Safari beside a
bookmarklet and a Shortcuts "Run JavaScript on Web Page" action. It runs on
every matching URL with no tap and has no length limit; what it lacks on its own
is a way back, which is what the `Log-Repo` shortcut supplies.

**Install:** open the raw `.user.js` file in Safari and take the Install sheet.
Then, on a page the script matches, open the extension menu once and allow
Userscripts on every site: an iOS extension is silent on a site until it is
allowed there, and Safari only asks when the menu is opened. That cost one
detour on 2026-09-05, with the script installed and matched and nothing on
screen.

**Edit, without reinstalling.** The stub is pinned to a **branch**, so it never
changes and the phone never sees it again after the first install. Editing is:

```bash
vim userscripts/lib/launcher.js
python3 scripts/userscript-stub.py launcher --name 'wt launcher' \
    --description '...' --match '*://*/*'      # re-stamps the body
git commit && git push
# then tap the purge URL the generator printed
```

Purging is part of publishing, not a tidy-up: jsDelivr caches a branch address
for about twelve hours, so without it the old body keeps being served. The
generator prints the exact URL.

**A branch pin costs the one thing a commit pin gave free**, knowing which copy
ran, and a purge does not settle it either: jsDelivr propagates per edge, so for
a while after a push a reload can land on either body (measured 2026-09-06, six
of eight reads on the old one). Purging is also rate-limited, roughly hourly per
path. So the drawer header answers the freshness question three ways, each
weaker than the next but each available where the others are not:

| Shown | Answers |
| --- | --- |
| `107ebdd` | which copy ran, always |
| `built 3h ago` | roughly how old it is, without a second number to compare |
| a warning line | that a different build is current, where the fetch is allowed |

The warning comes from [`builds.json`](builds.json), read from
raw.githubusercontent with a cache-buster rather than from the CDN, since a
manifest served by the cache it describes can be stale in exactly the case it
exists to detect. It **stays silent on failure**, because a strict `connect-src`
refuses that fetch and an unlooked-up answer reading as a good one is worse than
no verdict. `tools/test/userscript-stubs.test.mjs` holds the manifest to the
body and the stamp to the file it was computed from, and holds the stub and its
bookmarklet twin to one address. A body must define `window.wt<Lib>` and do nothing on load;
the stub calls it, so one body serves both routes.

**Which route reaches a page.** Measured against `script-src 'self'`: the
bookmarklet is refused, because it is a script tag the page injects; the
userscript mounts, because the extension evaluates the body itself. That is the
reason the launcher exists as a userscript and the reason its styles are a
constructed stylesheet rather than a `<style>` element, which `style-src` would
refuse the same way.

- [`launcher.user.js`](launcher.user.js): the app's own launcher, carried onto
  pages that have none, from [`lib/launcher.js`](lib/launcher.js). Same square,
  same mark, same drag, and a menu in the fab's row shape: capture the page to
  the repo, open the app, hide it.

  **It yields.** On a page that already has a fab it must not mount, or every
  web-tools page grows a second launcher beside the real one. Five tells stand
  it down: a mounted `[aria-label="Web-tools panel"]`, `window.gh`,
  `window.__fabHosted`, `data-no-fab`, and an observer that removes it if the
  real launcher boots after `document-end`.

  **The drawer is not the fab's**, and cannot be: Render reads the GitHub API
  through a token held on the web-tools origin, which a foreign origin does not
  have and must not be given, and Inspect lists what `gh.load()` fetched, which
  on a foreign page is nothing. What a foreign page does hold is its own
  content, so the three panes are the three answers it can give.

  | Pane | Holds |
  | --- | --- |
  | Page | title, address, description, and the selection, read on each open |
  | Links | every off-page link, deduped by address, each one tickable |
  | Text | the page's own prose, from its `<article>` or the densest block |

  The header carries a **refresh**, because a read is a moment and a news front
  page is not. **Collect** answers the harder version: a virtual-scroll feed
  removes rows as you pass them, so a read taken at the end sees the last screen
  and calls it the page. While Collect is on, every change to the document is a
  chance to keep blocks and links not kept yet, so scrolling accumulates.
  Measured against a list that never holds more than five rows: 45 items and 45
  links survived 40 passing through. Turning it off stops the watcher and keeps
  the tape; links accumulate whether or not it is on, so a refresh can never
  drop one you had ticked.

  **It measures the visible area, not the page.** iOS resolves `position: fixed`
  against the layout viewport, which on a page carrying an unclamped table, a
  wide ad slot or a pinch-zoom is wider than the screen; `vw` measures the same
  wrong thing, so a right-anchored panel hangs off the side and `max-width`
  does not save it. Everything is positioned inside one root sized from
  `visualViewport` and re-measured on its resize and scroll. Chromium already
  anchors fixed to the visual viewport, so this is not reproducible headless and
  was reasoned from a phone.

  **Two routes out, matched to size.** Send hands the capture to `Log-Repo` and
  it lands in the repo, but it rides inside a `shortcuts://` URL whose true
  ceiling nobody has measured (14,190 characters is known to work, and the
  failure past it would be a truncated payload arriving complete-looking). So
  Send is capped well under that and says `Copy only` when it stands down; Copy
  takes anything, the clipboard having no such limit. The cap is on the
  delivery, never on the selection.

## What the probe settled (2026-09-05)

`probe-require` was a two-route bar that ran once and is retired; its record is
[PR #601](https://github.com/mehrlander/web-tools/pull/601).

- The iOS build **does** fetch a remote `@require` (Userscripts 1.8.6, iOS 18.7),
  which is what makes the stub-and-body split above work at all.
- A `shortcuts://` link **tapped** inside a page reaches the shortcut, so a page
  has a return channel into `shortcuts/log/`. It has to be an anchor the finger
  lands on; assigning `location.href` is a navigation with no user gesture.
- `github.com` never reaches Safari on the phone, since the GitHub app claims
  the address. Test on a `github.io` page.
