---
id: docs-read-tracking-sn9nj8
title: Read-tracking for docs: which files sessions actually open
status: backlog
opened: 2026-08-04
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
