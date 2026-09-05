# Userscripts

Scripts for the [Userscripts](https://github.com/quoid/userscripts) Safari
extension, the third way to run JavaScript on a page in iOS Safari beside a
bookmarklet and a Shortcuts "Run JavaScript on Web Page" action. It runs on
every matching URL with no tap, has no length limit, and returns nothing to a
chain.

**Install:** open the raw `.user.js` file in Safari (the extension recognises
the suffix and offers Install). **Edit:** commit to `lib/`; the userscript is a
stub that `@require`s the body from jsDelivr at a pinned commit, so the
installed file never changes.

- [`probe-require.user.js`](probe-require.user.js): does the iOS build honour a
  remote `@require`? Loads [`lib/probe-bar.js`](lib/probe-bar.js) and calls it.
  [`bookmarklets/probe-bar.js`](../bookmarklets/probe-bar.js) loads the same
  body the other way, so the two routes are compared on one page. Each shows a
  bar naming its route and commit, with a Log button that hands a row to the
  `Log-Repo` shortcut.
