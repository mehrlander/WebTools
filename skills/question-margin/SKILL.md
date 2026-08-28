---
name: question-margin
description: Read a transcript, a reply, or a document as the questions it answers, and emit them as a margin beside the text or as a standalone list with each answer. Use when the user wants to know what a conversation settled and what it left open, asks for a question index or a Q&A view of something already written, wants to find what was raised and never resolved, or says "question margin", "what did we settle", "what is still open in this". Also for auditing a document, since a section that yields no distinct question is carrying no criterion. Concerns the questions a text answers, asked or not, never the questions it should have asked.
---

# Question Margin

## Objective

Re-express a piece of writing as the questions it answers, one per unit, each with its answer. The output runs beside the text as a margin, or replaces it as a list. You are not summarizing. A summary compresses by dropping; this keeps every unit and changes its form, so nothing is lost and the index is complete.

The payoff is that **absence becomes visible**. In answer form a gap is nothing, and nothing cannot be seen. Line the same content up as questions and the missing one announces itself.

## Pick the grain first, and it decides the object

This is the one choice that cannot be deferred, because the two grains attach to different things.

| grain | unit | object | count |
| --- | --- | --- | --- |
| paragraph | one paragraph | **one reply or one document section** | ~9 prose paragraphs a reply |
| exchange | one user ask and its answer | **one session** | ~10 exchanges a session |

Measured across the 192 session records in `mehrlander/web-tools-private` that carry both halves: a substantive reply (400+ characters) runs a median of 11 paragraphs, 9 of them prose, and a session runs a median of 10 exchanges. **A session at paragraph grain is about 204 rows, which is a corpus rather than a view.** So paragraph grain annotates a reply and never a whole session; exchange grain indexes a session and is too coarse for one reply. Do not mix them in one artifact.

Non-prose blocks get no question of their own, and **which way they attach depends on what they are**. A list, table or code fence attaches **upward**, to the paragraph that introduced it. A heading, and any bare transition sentence under it (*"The landing turned up things my checks could not see:"*), attaches **downward**, to the section it opens. Attaching a heading upward is the mistake this rule exists to stop: it lands the heading on the block above and orphans the section it was announcing.

## The question is what the unit answers, asked or not

Most units answer a question nobody posed. Measured on one session: of the 42 questions it answered, **16 (38%) were never asked**, and two of those were its most durable findings, both arriving under the user prompt "Done." A prompt carrying no question is not a low-content exchange; it is often the highest-content one, because it is where the work was handed over.

So every row carries a provenance mark, and the mark is epistemic rather than decorative:

- **`?`** a question somebody actually asked. Derived from their words.
- **`·`** a question the content answers without posing. Written by you, after the fact.

A `·` row is a model artifact with a model's failure modes: it can fluently name a question the passage does not actually answer. Never merge the two marks into one column. This is the same distinction the `content-registry` skill's `creation_mode` exists to keep, and a table that blurs it is claiming provenance it does not have.

## Writing the answer

**Every answer stands alone without its question.** This is the rule the first attempt got wrong, and the failure is specific enough to name: a bad answer inherits its subject from the question and keeps only the modifier.

| written | fails because |
| --- | --- |
| `both, in that order` | no subject, no verb, no fact |
| `chain, README row, both mirrors, PR closed` | four nouns, nothing said about them |
| `five fixes, 221 tests` | a count of facts where the facts are the answer |

Three rules fix all three:

1. **Lead with the direct answer** where the question is yes-or-no. Yes. No.
2. **Name the subject** rather than borrowing it from the question.
3. **Carry the fact, not a label for the fact.**

So `No. An orphaned artifact keeps serving a withdrawn link, and I did not fix it.` rather than `no, and I left it unfixed`.

**Brevity was never the constraint.** "Merged into shortcut-tools main" is four words and complete; "both, in that order" is four words and useless. A short answer is right where the fact is short, and nowhere else.

## Mood sorts report from finding

Questions in the interrogative-about-the-world mood (*does this work*, *is this true*) separate themselves from questions about events (*did this happen*, *what went in*). On the page every paragraph is the same shape and a finding buried among status reports is camouflaged. In the margin, the one question in a different mood stands out with no colour, status field or convention doing the work.

Do not add a status column to encode this. The grammar already carries it, and a column would invite you to write the mood rather than let it fall out.

**The mix characterizes the reply.** A wrap-up runs mostly reports with one finding hiding among them, which is the case the margin rescues. A self-audit inverts it: run on a reply reporting four defects, the split came out five findings to five reports, four of the findings answered "No." So the ratio is worth stating alongside the table, since it says what kind of turn you are reading before you read it.

**Two replies, both Claude-side.** The separation held on the second, unseen one. Nothing here is tested on a user's prose, on a document, or across authors.

## The open-loop filter (exchange grain only)

At exchange grain a question can outlive the turn that raised it. Count how many later user messages it survived, and that number is both the severity signal and the filter:

> **An open loop is a question that was explicitly asked and did not settle inside the turn that raised it.**

On the worked session this cuts 42 rows to 12, and the 30 it drops are the ones asked and answered in one breath, which is exactly the population a list was never needed for. Show the count as `×N` and let a zero render as nothing.

The full list and the filtered one are **one structure with two masks**, never two artifacts. Deriving the second from the first is what keeps them from drifting.

## Output

Default to a markdown table in chat, since the point is to be cheap enough to actually run:

```
| ? | question | answer |
| --- | --- | --- |
| ? | Does `--publish` remove a mirror whose chain is gone? | No. An orphaned artifact keeps serving a withdrawn link, and I did not fix it. |
| · | Does script run inside the sheet? | Yes. The sheet is a full browsing context, not a viewer. |
```

Three densities are available and worth naming when handing one over: **prose** leaves the text untouched with the index beside it, **answers** keeps the shape and drops the argument, **questions** is what the text was for. Answers is the useful default.

A rendered page is worth it only when the margin has to sit beside the prose to make its point. The dated prototypes are `dump/2026-08-28-question-margin.html` (paragraph grain) and `dump/2026-08-28-question-lane.html` (exchange grain) in `mehrlander/web-tools`, each with its build script beside it.

## Auditing a document

Run at paragraph grain over a document and **a section that yields no distinct question is carrying no criterion.** Measured on one section of `docs/SURFACING.md`: ten enumerated closing states yield one question repeated ten times, because a definition list is already in answer form, while the boundary paragraph beneath yields seven distinct questions, every one sharper as a question than as prose.

That is the same cut the conventions make in "what earns its place is the criterion inside a reason," so the digest doubles as a bloat detector. Report the sections that produced nothing rather than padding them with a question you had to invent.

## What is not established

Say these where they bear on what you are handing over.

- Every measurement above is **post-hoc**, over records of finished sessions. Whether producing this live changes what happens in a session is untested.
- The mood observation is **one reply**.
- The 42-row and 12-row figures are **one session**, and a build session at that. A long analysis session was read for granularity but never counted.
- Two independent passes will agree on the contents at the high-severity end and **will not agree on the count**. Present the list to be approximately right: no total, no "N of M resolved."
- Granularity tracks the writer's formatting. An enumerated ask splits the same way every time; a paragraph carrying three concerns does not, and no rule for that case has been proposed.

## Relation to atomic-decomposition

[`atomic-decomposition`](../atomic-decomposition/SKILL.md) breaks a document into the claims it makes, paragraph-anchored, tagged by commitment type. This is the same operation on the same text with the polarity flipped: **a claim is what a paragraph asserts, a question is what it answers.**

Pick by what the reader is meant to do. Inventory what a document commits to, including what it presupposes, and the answer is claims. Find what a discussion settled and what it left open, and the answer is questions. Running both over one text is legitimate and produces two lists that do not fold together.
