---
id: fab-declared-embeds-1jtpll
title: Generalize FAB embed handling to declared embeds
status: done
closed: 2026-08-02
resolution: dropped
opened: 2026-07-22
priority: someday
next: Build only when a real composite page (multiple interactive embeds) exists; nothing schedules this.
---
# Generalize FAB embed handling to declared embeds

The parked "layer chooser" idea from the FAB/embed work (PR #279): let the
FAB re-target at an embedded page while staying on the host, instead of (or
beside) busting out to the embed's full-page form.

Decision at filing: not built, on purpose. The two shipped mechanisms cover
every current case, under the rule "adopt when the host exists to render a
subject; bust out when the host merely contains one":

- toss-render adopts its subject fully (Render + Inspect, via
  `__tossSubject`/`__tossFrame`), automatically, because the subject is the
  whole point of the page.
- show-repo offers a one-tap bust-out action (FAB actions contract) for its
  landing / app-view / atlas iframes; fabs inside iframes decline to mount.

A chooser would deliver a strictly weaker version of bust-out (host chrome,
nested frames, a second axis of FAB state muddying the launcher's mode
indicator) at real complexity: the landing case is two frames deep, and the
outer FAB would have to reimplement adoption through toss-render's frame.

Trigger condition: a genuinely composite page, several live interactive
embeds side by side where "open full-page" destroys the composition that is
the point. No such page exists in the estate today.

Sketch when triggered: a host component declares its embeds the way it
declares `description`/`actions` (an `embeds: [{label, src, frame}]` array
the FAB scans); the FAB lists them and generalizes subject adoption from
"the one toss subject" to "a selected embed", reusing `__tossFrame`-style
handles. Done means: the FAB can describe and re-render a chosen embed on a
composite page without leaving it.

## Progress log
- 2026-07-22: Filed as the parked item 4 from the FAB sidebar / branch-nav
  session (PR #279), with the do-not-build-yet rationale and trigger recorded.
- 2026-08-02: Closed as parked, per the groom the user confirmed. The task was filed as do-not-build with an explicit trigger (a composite page with several live interactive embeds), and no such page exists in the estate. The trigger condition and the build sketch stay recorded above, so if a composite page ever appears this can be refiled from the file rather than rediscovered.
