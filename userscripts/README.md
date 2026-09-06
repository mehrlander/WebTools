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

**Edit:** commit to `lib/`, then re-run the generator. Each script here is a
stub whose one `@require` pulls its body from jsDelivr at a pinned commit, so
the installed file never changes and a script's behaviour is a commit rather
than a phone-typing session:

```bash
python3 scripts/userscript-stub.py launcher --name 'wt launcher' \
    --description '...' --match '*://*/*'
```

That writes the stub and its bookmarklet twin together, both pinned at HEAD. A
body must define `window.wt<Lib>` and do nothing on load; the stub calls it. One
body then serves both routes, which is the only way to compare them, and
`tools/test/userscript-stubs.test.mjs` holds the pair to one pin, since a stub
re-pinned without its twin ships two routes that claim to run the same code.

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
