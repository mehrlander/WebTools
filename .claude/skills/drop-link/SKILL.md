---
name: drop-link
description: "Mint a link that opens GitHub's new-file form on the session's working branch with the filename prefilled, so the user can paste long content from their phone straight onto the branch without it riding through chat context. Use when the user says 'drop link', 'give me a drop link', asks for a placeholder file to paste into, wants to 'dump content onto the branch', or describes pasting a big file to you and worrying it will bloat the conversation. Also use proactively when the user starts to paste something large that belongs in the repo: offer the link instead."
---

# Drop link

## What this replaces

The old flow was: create a placeholder file on the branch, commit it, hand over
an edit link, let the user overwrite it, then clean up. The whole thing
collapses into one URL, because GitHub's new-file form takes the branch in the
path and the filename in the query:

```
https://github.com/<owner>/<repo>/new/<branch>?filename=<path>
```

No placeholder commit, no cleanup. The user opens the link (it works on a
phone), pastes, and commits; the content lands on the branch as a normal
commit, and it never enters the agent's context. The filename stays editable
in the form, so the prefill is a default, not a decision.

## Steps

1. **Pick the branch.** The session's working branch for the repo the content
   belongs to. If the session spans repos, the one the content is for; ask
   only if genuinely ambiguous.
2. **Pick the filename.** Default to the repo's own content-intake
   convention when it has one (home: `chron/dump/`, which its drain flow
   processes); else the `.web-tools.json` `inbox` field (the estate's
   receiving folder, which in home serves cross-repo deposits, a different
   job); else `dump/` at the root. Name it `<dir>/<YYYY-MM-DD>-<slug>.md`
   with a slug from what the user said the content is; fall back to
   `-drop.md` when there is no hint.
   For a **binary** (a PDF, an image), hand over the sibling upload form
   instead, which takes files rather than pasted text:
   `https://github.com/<owner>/<repo>/upload/<branch>` (no filename prefill;
   GitHub keeps the uploaded name).
3. **Mint and hand over.** URL-encode the `filename` value only; the branch
   rides the path with its slashes raw. Reply with one tappable markdown
   link, labeled with the filename, plus one line saying what to do: open,
   paste, commit.
4. **After they commit**, fetch or pull the branch to pick the file up, and
   treat it like any other intake (home: it is dump material; promote or
   process per that repo's conventions). Do not read it back into chat unless
   asked; the point of the flow is that the content lives in the repo, not
   the conversation.

## Notes

- The same affordance lives in the Web Tools app's Activity view: each branch row's
  menu has **Drop a file here**, minting this URL with the inbox-stamped
  default name. Offer that route to a user already in the app.
- The link requires the user to be signed into GitHub in the browser that
  opens it; on a phone that is usually true. There is no token machinery
  involved: it is GitHub's own editor.
- This is a deliberately *ambient* write (it targets the named branch, and
  the form shows that branch), so read and write frames match; see
  docs/show-repo.md "The branch overlay" for the frame vocabulary.
