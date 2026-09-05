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
body then serves both routes, which is the only way to compare them.

- [`launcher.user.js`](launcher.user.js): the Web Tools launcher on any page,
  from [`lib/launcher.js`](lib/launcher.js). Drag it anywhere, tap for a menu:
  capture the page to the repo, open the app, hide it. It is not the app's own
  FAB and cannot be: that stack is CDN-loaded and a strict `script-src` refuses
  it, so this is the launcher's menu gesture alone, in a shadow root with a
  constructed stylesheet.

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
