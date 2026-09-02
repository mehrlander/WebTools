---
name: session-review
description: "Review a Web Tools development session and its repository or PR context. Use when the user asks for $session, gives a bare claude/* branch, or asks to check back on a previously reviewed Claude Code session."
---

# Session Review

Review the relevant Web Tools development session and associated repository or PR context.

If the invocation includes a branch name, such as `$session claude/swipe-deck-icon-dropdown-3v5ofh`, first find the session working that branch in `web-tools-private`. Treat the branch as a lookup key for the session, not as the review target itself. Prefer the active or most recent matching session when more than one exists.

After locating the session record, read the record directly rather than relying on search excerpts to determine its current contents. On follow-up requests such as “latest,” “update,” or “check back,” refetch the known session record so the review reaches the current end of the captured session.

- Distinguish what the agent actually found from what it proposes or assumes.
- Identify unresolved questions, scope drift, and unnecessary machinery.
- Evaluate the direction against the apparent goal of the work, with a bias toward simplification and alignment with existing conventions.
- Check repository evidence when a claim matters; do not treat the agent's assertions as established facts.
- Give a concise assessment of where the session stands, what should happen next, and a proposed response when useful.
