---
id: docs-read-tracking-sn9nj8
title: Read-tracking for docs: which files sessions actually open
status: done
opened: 2026-08-04
closed: 2026-08-06
session: claude/show-repo-progress-b8l63x
---
# Read-tracking for docs: which files sessions actually open

Give the Docs registry (docs/docs.json, rendered in the Map view's Docs tab) a
per-document readership column: opened in N recorded sessions, last read date.
The prior art is Mintlify's agent analytics
(https://www.mintlify.com/blog/agent-analytics), which classifies docs-site
traffic by AI-agent user-agent signatures and reports which pages agents read;
their March 2026 data has agents at roughly two thirds of docs traffic. That is
the server-side version, and it is closed to us: GitHub Pages and raw expose no
per-file logs, and the GitHub Traffic API stops at 14 days and a top-10 list.

The estate already has the capture mechanism, which is the point of this task:
the portable plugin's Stop-hook session recorder saves whole transcripts
wherever a checkout declares a sessions store (web-tools-private does), and a
transcript contains every Read and Grep call with its path. So the build is a
miner, not new instrumentation:

1. A script over the recorded transcripts aggregating reads per repo file into
   a small committed JSON (counts, distinct sessions, last-read date).
2. The Docs tab renders it as a column beside each document row.
3. Two honesty caveats carried in the display: coverage is only sessions the
   recorder captured; and the most-read docs (CONVENTIONS.md, SURFACING.md)
   will read ZERO, because they arrive by session-start injection rather than
   through a Read call. The display must name injection as its own channel or
   the numbers invert the truth.

Done means: the miner committed (likely in web-tools-private beside the store,
with the aggregate JSON travelling here), the column rendering, and the caveats
stated where the numbers show. Origin: the docs-registry session (PR #350).

## Progress log
- 2026-08-04: Filed at the user's request from the docs-registry session; prior art found (Mintlify agent analytics) and the recorder-transcript mechanism confirmed already installed.
- 2026-08-05: Steps 1 and 3 landed as a side effect of the Sessions tab (`claude/activity-sessions-tab-3j05zm`). What remains is step 2, the Docs tab column.

  **The miner is not a script over transcripts.** It moved into the recorder itself: session records now carry a `files` field (schema 3, `<checkout>/<repo-relative>` → `{read, edit, write}`), read from each tool call's input, and `state/sessions.json` folds it across sessions into `attention: [{path, count, sessions, last}]`. So the aggregate this task wanted already exists, is committed, and refreshes on show-repo's ~3h sessions crawl rather than needing a run. Read it from the registry; do not write a second miner.

  **Count `sessions`, not `count`.** One session editing a file forty times says the session was busy; ten sessions opening it says the file is load-bearing.

  **The caveats are stated, and there are three, not one.** The Sessions pane carries them and the Docs column must too: injected docs read zero (the caveat this task anticipated, and it inverts the ranking on exactly `CONVENTIONS.md` and `SURFACING.md`); a file read through a shell command (`sed`, `cat`, `grep`) leaves no trace, which is a large share of real reading in this estate; and subagent traffic is excluded upstream. Full statement in web-tools-private `sessions/README.md`, "File attention".

  **Coverage starts now.** Only schema-3 records have `files`, so the column reads zero for everything before 2026-08-05 and the display has to distinguish "not captured" from "not read", the way the Sessions pane's per-row files badge does.
- 2026-08-06: Step 2 landed; the column renders in the Map view's Docs tab, token-gated, absent rather than blank without a token. Three findings from building it, none anticipated above.

  **The aggregate this task was told to read would have been wrong, quietly.** `attention` folds each row's `files`, which is that session's busiest **eight** files (`FILES_KEPT`). A doc opened once in a session that touched forty files is exactly the reading a readership column counts and exactly what that cap drops, and the registry row would have said zero with nothing on screen to suggest a truncation. So the row now also carries `docFiles`, its complete `docs/` slice, and the cache carries a second rollup, `docAttention`, folded by the same `fileAttention` with a different field. Uncapped is affordable because the set is closed and small.

  **A published record is frozen, so a new field would never have reached the back catalogue.** The crawl refetches on a moved blob sha, and a record's sha never moves again after it is written, so every existing row would have kept an empty `docFiles` forever. Rows now carry the summarizer's version (`ROW_V`) and `stalePaths` treats a stale version like a moved sha, which heals the cache on one pass and makes the next summarizer change free.

  **The injected caveat got a better answer than a footnote.** The column reads `reach` and prints `injected` for those two rows instead of a number, so the unmeasurable case is visibly different from the measured zero. The other two caveats sit in the strip above the column.
