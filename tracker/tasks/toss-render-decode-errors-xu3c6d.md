---
id: toss-render-decode-errors-xu3c6d
title: Structural response decode + differentiated errors in toss-render
status: done
project: show-repo
opened: 2026-07-17
closed: 2026-07-17
---
# Structural response decode + differentiated errors in toss-render

Second follow-up to 20260717-p5a, from live use on iPhone: a `#gh=` toss of a
small file failed with Safari's bare "The string did not match the expected
pattern." That message is WebKit's `res.json()` error: the raw media type's
own name (`application/vnd.github.raw+json`) contains "json", so the
Content-Type sniff in `readContents` misfiled a successful raw response as
metadata and tried to JSON-parse HTML. Whether a raw response is labeled
`text/plain` or the media type itself varies by endpoint and cache, which
made the failure look intermittent (and read as a token problem).

Fix: classify responses structurally, not by label. `readContents` and the
injected fetch shim now read the body as text and treat it as contents-API
metadata only when it parses as JSON with the metadata signature (`content` +
`encoding`); array listings are recognized by entry shape; everything else is
the file itself. The git-blobs fallback gets the same treatment.

The error panel now differentiates the three failure kinds it conflated: HTTP
failures are worded per status (401 token rejected, 403 rate-limit, 404 not
found or no access), token-shaped failures reveal a "Get or renew a GitHub
token" link (same destination as the repo.js token widget), and a
post-fetch decode failure says "fetched OK ... not a token or access
problem" so it can never masquerade as an expired token again.

Verified with a five-scenario headless matrix (raw as text/plain, raw
mislabeled raw+json, JSON metadata, empty-content plus blobs fallback, 401)
against the deployed page and the fix: deployed fails two of five with the
bare parse error; fixed renders all four content shapes and labels the 401
with the token link.

## Progress log
- 2026-07-17: Filed and fixed on the follow-up branch (stacked on the
  history-safe shim, PR #237).
