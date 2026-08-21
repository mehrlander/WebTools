---
id: session-titles-from-export-4vgu4x
title: Carry real session titles from the Dispatch export, without depending on it
status: done
project: show-repo
track: independent
opened: 2026-08-10
closed: 2026-08-20
session: claude/session-titles-join-7wq3vz
size: M
---
# Carry real session titles from the Dispatch export, without depending on it

A session's **title**, the string shown in the claude.ai sidebar and the iPhone
app, cannot be captured from inside a sandbox session. That was established on
2026-08-10 across eight routes and written up in web-tools-private
`sessions/README.md`, "The third name, and why the record cannot have it": the
title is generated server-side, reaches the container through no channel, and
the container's own credentials are scoped away from the endpoint that would
return it. `record.py` is therefore unchanged and should stay that way.

What closed the gap was a **different venue**. A Dispatch session, running on
the desktop where the browser login lives, wrote
`mehrlander/chat-histories/claude-code-web/2026-08-04-sessions.csv`: about 380
titles with URLs, plus a README, merged to main on 2026-08-10. So the estate
has titles; the recorder just cannot be the one to fetch them.

This task is the join, plus the cadence, plus the part that matters most: the
estate must **degrade** when the export is old or absent rather than go blank.
`search.py --name` and `RepoSessionsCache.nameOf` already derive a name from the
branch slug (`claude/fab-naming-todqvq` gives `fab-naming`), which covers 55 of
58 records and needs nothing external. That stays the floor. A real title is an
enrichment on top of it, never a replacement for it.

**Start a session with `mehrlander/chat-histories` in scope.** The session that
filed this could not read the CSV: the repo was not among its sources, and both
routes to add one mid-session are closed here (`add_repo` lives only on the
claude.ai connector, which returns MCP -32003, and a direct clone has no
credentials). Nothing below can be settled without reading the file.

## Settle these first, by reading the CSV

- **The key.** Are the URLs `claude.ai/code/session_…` or `claude.ai/chat/…`?
  Only the first joins to session records, through `agent_session` (schema 3+,
  exposed on cache rows as `row.agent`). Chat URLs are a different id space and
  would make this a different task.
- **Coverage against the store.** 380 rows dated 2026-08-04 against a session
  store that begins 2026-07-29. Establish how many records actually match, and
  how many titled sessions have no record at all. A join that covers a third of
  the store is still worth having, but the surface has to say so.
- **Whether a title can change after export.** It can be renamed at any time, so
  a snapshot is a claim about a moment. Decide whether that is worth stating on
  screen or is noise.

## Then

- **Join in the derived layer, not the captured one.** Titles belong on
  `state/sessions.json` rows, which are regenerable, not in the records, which
  are captured and never revisited. The crawl already keys on blob shas; a
  second small input is a natural extension of `buildCache`.
- **Fall back per row, not per surface.** A session with no exported title shows
  the derived name, not a blank. Both `search.py` and the Sessions lane in
  `lib/kits/estate-search.js` need the same precedence, and the search corpus
  should carry both forms so either finds the session.
- **Say how old the titles are.** A dated export behind a live view is exactly
  the case where a surface silently reads as current. Show the export's date
  where the titles are shown.

## Cadence

Marcus can run the Dispatch capture daily, or schedule it there. That is the
starting assumption and it is enough to make this worth building. Note the limit
rather than designing around it yet: **Dispatch is attended**, so the desktop
must be awake with the app open, and a day the machine sleeps is a day with no
export. The unattended alternative is already being worked in
`laptop-self-hosted-runner-6a0n5f`, which lands a runner against
`web-tools-private`, the same repo the session records live in. If that task
completes first, the capture is a natural second job for it. Do not block on it:
the whole point of the fallback above is that a stale or missing export costs
accuracy, not function.

## Done when

The Sessions view and `search.py` show a real title where one is known and the
derived branch name where it is not, the age of the export is visible, and
`sessions/README.md` points at the export so its "cannot be captured" section
is not read as "the estate has no titles."

## Progress log
- 2026-08-10: Filed from the session that established the eight closed routes
  and shipped the derived-name fallback (web-tools PR #395, web-tools-private
  PR #23). Could not read the CSV: `chat-histories` was out of session scope
  and could not be added. Everything under "Settle these first" is open.
- 2026-08-20: Settled all three, then built the join, one way, derived layer
  only. Done on `claude/session-titles-join-7wq3vz` in both repos.

  **The key.** All 380 URLs are `claude.ai/code/session_…`, so the join runs
  through `agent_session` as hoped. No chat URLs.

  **Coverage, against 143 cache rows on 2026-08-19.** 30 rows joined. The
  binding constraint is not the export's age: it is `agent_session`, which no
  record written before 2026-08-06 carries. The join is 100% for 2026-08-07
  through 2026-08-09, 6 of 7 on 2026-08-06, and zero before, so 44 rows can
  never be titled by any export however fresh. 34 records are dated on or
  before the export's filename date and **none** of them can join. Mirror
  image: 350 of the 380 export rows name sessions with no record at all.

  **Rename volatility: not measurable, and not claimed.** One snapshot exists,
  so there is nothing to diff. The surface states the export date instead.

  **The export's filename date is wrong, and that is a finding for
  chat-histories, not a bug here.** `2026-08-04-sessions.csv` contains sessions
  through 2026-08-09 and was committed 2026-08-10. The code reads the date off
  the filename (the folder's own convention), so the on-screen claim is older
  than the truth, which is the safe direction; renaming the file corrects the
  display with no code change.

  **What shipped.** `lib/kits/repo-sessions-cache.js` takes the export as a
  second input and writes `title` per row plus top-level `titlesAt` /
  `titlesFrom`; the title is applied on every fold rather than inside
  `summarize()`, so it needs no ROW_V bump and no re-crawl. show-repo's
  `_crawlSessions` reads the newest dated CSV (two calls a pass) and treats
  every failure as "carry the titles you already have." `labelOf` and
  `search.py`'s `session_label` are one precedence, falling back per row;
  `estate-search`'s session corpus and `search.py --name` carry both forms.
  The Sessions pane shows the label per row and "Titles as of <date> · N of M
  named". `sessions/README.md` gains "The title, joined from another venue".

  **Still open, deliberately, and the reason this is not a re-file.** The
  capture is manual: Dispatch is attended and nothing schedules it, so
  `titlesAt` moves only when someone runs it. That was already noted here as a
  limit to record rather than design around; the unattended venue is
  `laptop-self-hosted-runner-6a0n5f`. Also unjoined: the Sessions pane's
  branch-trailer stubs, which have a session id and no record, and which the
  export could name.
