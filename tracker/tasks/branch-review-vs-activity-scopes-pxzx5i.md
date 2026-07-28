---
id: branch-review-vs-activity-scopes-pxzx5i
title: Decide whether the per-repo branch review still earns a sidebar slot
status: backlog
opened: 2026-07-28
next: use the new Activity scopes for a while, then check what the repo view was still opened for
---
# Decide whether the per-repo branch review still earns a sidebar slot

PR #307 gave the Activity view a **scope** axis over the survey's `group`
values (Open / Recent / Stranded / Landed / All), so the estate's one branch
list now shows every branch the crawl knows about rather than only work in
flight. That was most of the reason to open the per-repo **branch review**, so
the open question is whether that view still earns its sidebar row.

**What the assessment found** (worth keeping, since it took a read of both
views to establish):

The two are not two data sources. The activity crawl already surveys and stores
every branch of every estate repo, classified, with the content counts, in the
one cache the Activity view reads (`show-repo.html`, `refreshActivityCache`).
The view then discarded most of it in one line (`estate.js`, `if (!pr &&
b.group !== 'stranded') continue`). Exposing `group` as a control cost no new
fetches.

What remains **only** in the per-repo branch review:

| | Structural? |
| --- | --- |
| The **live, uncapped survey** (`Survey all`, Refresh bypassing the cache) | Yes. The crawl caps at 30 older branches per repo (`ACTIVITY_SURVEY_CAP`) on a ~12h throttle, so a repo with 100 stale branches can only be surveyed in full here. |
| **Any repo, not just estate members** | Yes. The cache covers `estate: true` repos; open `?repo=someone/other` and the branch review still works live. |
| **In-app compare** (`openCompare`, a real diff inside the app) | No, but there is no substitute in Activity, whose compare is a link out. |
| **Browse the branch here** (switch ref, go to Files) | No. Activity's branch name stages the diff, a different verb. |

The two views answer different questions, and the naming hid it: Activity is
*what am I working on*, the branch review is *what is this repo's branch
inventory*. The scopes closed most of the second gap.

**Done means** one of: the branch review keeps its slot with a stated reason;
or it narrows to what only it can do (the live uncapped survey, an off-estate
repo, in-app compare) and moves behind the Activity repo chip's menu; or it is
removed and those three capabilities are placed somewhere.

Do not decide from the code. Use the scopes for a stretch first and note what
the repo view actually got opened for.

## Progress log
- 2026-07-28: Filed from the PR #307 session, which built the scope axis. The
  assessment above is the durable part; the decision is deliberately deferred
  until the new control has been used.
