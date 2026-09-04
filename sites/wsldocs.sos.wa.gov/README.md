# wsldocs.sos.wa.gov

The Washington State Library's document repository, run by the Secretary of
State. It holds state agency publications past the point where the agency's own
site drops them: DRS keeps its last five financial reports and its
[Chapter 15 page](https://www.drs.wa.gov/employer/ch15/) sends the rest here, and
the parallel OFM index on this host spans 2000 to 2017.

**The host's one governing fact: it is behind a Cloudflare interstitial.** A
Claude Code web session gets a 403 from `curl` and a 403 from WebFetch alike,
host-wide, and the sandbox's headless Chromium cannot reach external hosts
through the agent proxy at all. A browser navigating normally passes it without
noticing. Everything here therefore runs **on the page**, in your browser, and
nothing here should be written as though a session could fetch this host.

## Contents

- `courier/list-cafr.js`: the [courier](../../courier/README.md) errand
  `wsl-drs-cafr-index`. Collects every document link on the DRS CAFR index and
  returns it as a table, with a per-host count, because which host the documents
  actually sit on decides whether a session can fetch them itself. The
  neighbouring `digitalarchives.wa.gov` answers a session fine; this host does
  not.
