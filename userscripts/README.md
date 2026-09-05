# Userscripts

Scripts for the [Userscripts](https://github.com/quoid/userscripts) Safari
extension, the third way to run JavaScript on a page in iOS Safari beside a
bookmarklet and a Shortcuts "Run JavaScript on Web Page" action. It runs on
every matching URL with no tap, has no length limit, and returns nothing to a
chain.

**Install:** open the raw `.user.js` file in Safari (the extension recognises
the suffix and offers Install). Then, on a page the script matches, open the
extension menu once and allow Userscripts on every site: an iOS extension is
silent on a site until it is allowed there, and Safari only asks when the menu
is opened. That cost one detour on 2026-09-05, with the script installed and
matched and nothing on screen. **Edit:** commit to `lib/`; the userscript is a
stub that `@require`s the body from jsDelivr at a pinned commit, so the
installed file never changes.

- [`probe-require.user.js`](probe-require.user.js): does the iOS build honour a
  remote `@require`? **Yes** (2026-09-05, Userscripts 1.8.6, dark bar on
  mehrlander.github.io). Loads [`lib/probe-bar.js`](lib/probe-bar.js) and calls it.
  [`bookmarklets/probe-bar.js`](../bookmarklets/probe-bar.js) loads the same
  body the other way, so the two routes are compared on one page. Each shows a
  bar naming its route and commit, with a Log button that hands a row to the
  `Log-Repo` shortcut.
