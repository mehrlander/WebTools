---
id: app-view-fab-subject-1evnwv
title: Let the app view's FAB describe the page, not the shell
status: backlog
opened: 2026-08-20
size: S
---
# Let the app view's FAB describe the page, not the shell

In `?view=app`, show-repo frames `pages/toss-render.html`, which frames the
promoted page. Three windows. The FAB that mounts is the app's own, at the top
level, and it reports `app/index.html` at main. So the drawer over a promoted
page describes show-repo rather than the page in the frame, and the launcher
stays neutral even when `appRef` names a branch.

That is the under-reporting direction of the error, which is the worse one. A
toss saying "warning" over a SHA you asked for costs nothing; a shell saying
"neutral" over branch code is a quiet false statement.

## Why it happens

`toss-render` stamps `window.__tossSubject` on its OWN window, which is right
when it is the top-level document: its fab is right there. Framed inside the
app it is not the top-level document, its own fab declines to mount (a fab in
an iframe declines unless `data-allow-framed`), and the announcement reaches
nobody.

`lib/kits/subject-channel.js` already solves this exact problem for the file
deck and the stage's reader, and its head comment names the failure in the same
words: an announcement written only to `window` reached nobody, because the fab
that is listening is one window up. Its host list is "every window that might
hold a fab, this one first."

## Shape

- `toss-render`'s `setSubject` announces up the host list rather than only to
  its own window, whether by adopting the kit or by matching its walk.
- Same-origin only, which address mode is; a `#gz=` payload toss is opaque and
  the access throws, which the kit already treats as the honest end of it.
- Nothing about the toss-as-top-level case changes.

## Done when

- `?view=app&appRepo=<repo>&appPath=<path>&appRef=<a branch>` shows the
  warning-tinted launcher, and the drawer's ref bar names that branch.
- The same address at the default branch stays neutral.
- A toss opened directly is unchanged.

## Progress log
- 2026-08-20: filed alongside PR #465, which fixed the two defects underneath
  the same indicator (the escape button's destination and the favicon dimming)
  and deliberately left this one, since it touches the app shell and the
  subject channel rather than the FAB's own reading.
