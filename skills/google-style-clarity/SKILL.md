---
name: google-style-clarity
description: Draft, review, and rewrite prose for clarity using Google's developer documentation style guide. Use for requests about unclear references, unexplained jargon, compressed shorthand, figurative labels, inflated claims, or precise technical explanations. Preserve the intended meaning and audience; do not treat this as an AI-authorship detector or a complete formatting-compliance audit.
---

# Google Style Clarity

Make the intended meaning readily understandable without asking the reader to reconstruct missing nouns, relationships, definitions, or evidence. Preserve technical substance, uncertainty, and the user's question or purpose.

Use the [Google developer documentation style guide](https://developers.google.com/style) as the source. Apply the selected principles below; do not extend research to other guides or Google's separate technical-writing course unless asked. Treat the review procedure and examples here as adaptations, not quotations or additional Google rules. The principles as written are sufficient for ordinary drafting and review. Consult the linked page when its exact wording matters or a judgment is disputed; do not claim to have checked a source that you could not access.

Do not supply meaning that the text or the user has not established. If a referent, relationship, or claim cannot be resolved, ask a focused question or mark the uncertainty.

## Review and revise

1. Establish the audience, intended message, and requested scope from the supplied material.
2. Check the principles below. Identify the reader's actual difficulty before proposing a change.
3. Revise the requested passage completely when a rewrite is requested. Preserve facts, identifiers, distinctions, conditions, and degrees of certainty.
4. Read the result as a whole. Check that each heading names its content, each instruction identifies its action, and each conclusion follows from the available information.

## Clarity principles

### 1. Name the things being discussed

Ask **both what, this what, which one, whose action?** Add or repeat the noun when a pronoun makes the reader search backward, choose between referents, or infer the category of thing. Apply this test to standalone quantifiers such as *both*, *each*, and *either*, as well as *it*, *this*, and *these*. Keep pronouns when their references are clear and repetition would add no value.

Source: [Pronouns — Ambiguous pronoun references](https://developers.google.com/style/pronouns).

### 2. Explain or replace unfamiliar terminology

Ask what the term means **in this passage**. Prefer a direct expression, or add a short explanation when the technical term is useful. Do not accept a phrase merely because it appears earlier, occurs in the codebase, or is familiar to the writer. Consider whether a clearer expression exists even when the term is legitimate. Keep useful technical distinctions and stable names; do not substitute a sequence of loose synonyms. Explain a code identifier without silently renaming it.

Sources: [Jargon](https://developers.google.com/style/jargon); [Write for a global audience — Use words in their primary sense](https://developers.google.com/style/translation).

### 3. State relationships instead of compressing them away

Add words such as *of*, *for*, *that*, or *then* when they clarify a relationship or sequence. Break up stacked noun modifiers. Identify code entities with nouns such as *file*, *field*, *method*, or *request*. Repeat a word when it prevents ambiguity. Judge concision by the effort required to understand the text, not word count alone.

Sources: [Write for a global audience — Use modifiers appropriately; Use helper words and optional words](https://developers.google.com/style/translation); [Code in text — Grammatical treatment of code elements](https://developers.google.com/style/code-in-text).

### 4. Describe the operation behind a metaphor

Replace an opaque metaphor, idiom, or human-like description of software with the actual object, action, or relationship. If an established technical metaphor is the most accurate term, explain it as needed. Quotation marks do not supply a missing definition. Do not treat all quoted metaphors as prohibited: Google permits quotes around a metaphor that is not established usage in the domain.

Sources: [Write inclusive documentation — Avoid figurative language](https://developers.google.com/style/inclusive-documentation); [Anthropomorphism](https://developers.google.com/style/anthropomorphism); [Quotation marks — When to use quotation marks](https://developers.google.com/style/quotation-marks).

### 5. Match the claim to the evidence

Examine superlatives, words such as *ensure* and *guarantee*, performance comparisons, and claims that a task or product is simple. State the supported result and its conditions. Distinguish a feature's intended benefit from a demonstrated outcome. Do not turn an expectation into a guarantee, invent measurements, or imply verification. Replace unsupported praise with a concrete description; retain uncertainty where the evidence requires it.

Sources: [Avoid excessive claims](https://developers.google.com/style/excessive-claims); [Word list — simple, simply](https://developers.google.com/style/word-list).

### 6. Distinguish instructions, recommendations, and observations

Resolve ambiguous *should* statements: is the action required, recommended, optional, or merely expected to happen? Use an imperative or *must* for requirements, explicit recommendation language for advice, and *can* or *might* for the appropriate possibility. Name who or what performs an action. Recommend a path when advice is requested, but do not turn a comparison request into a decision made for the user.

Source: [Prescriptive documentation — Word choice for recommendations and requirements](https://developers.google.com/style/prescriptive-documentation).

### 7. Keep the tone useful and direct

Remove placeholder phrases such as *please note* when the statement can stand directly. Remove promotional enthusiasm and forced informality. In procedures, remove *simply* when it adds no instruction. Treat *simple* or *easy* as an evidence issue under principle 5 when it characterizes a task's difficulty. Preserve a natural voice without making the reader decode slang. Keep useful transitions and explanations; do not replace connected prose with cryptic fragments.

Sources: [Voice and tone — Some things to avoid where possible; Some techniques and approaches to consider](https://developers.google.com/style/tone); [Word list — please](https://developers.google.com/style/word-list).

## Examples of applying the principles

Treat these as context-dependent rewrites, not automatic substitutions.

| Before | Clearer, if this is the intended meaning |
| --- | --- |
| Keep both. | Keep both app views. |
| The fallback owns this. | The fallback function handles missing labels. |
| Configure the ACL for the bucket. | Configure the access control list (ACL) for the storage bucket. |
| Run the export status refresh. | Refresh the status of the export. |
| The value should be true. | Set the value to `true`. / The server sets the value to `true`. |
| This guarantees duplicate-free output. | This removes records with duplicate IDs. |
| Simply run the command. | Run the command. |

Leave wording alone when it is already clear, accurate, and properly qualified.

| Wording to preserve | Why |
| --- | --- |
| The parser walks the syntax tree. | *Walks* is established usage for tree traversal. |
| Use a hash map to index records by ID. | *Hash map* is the accurate established term. |
| The retry might succeed if the outage is transient. | *Might* preserves genuine uncertainty. |

## Return the requested work

- For a draft or rewrite, return the complete text in the requested form. Explain only consequential changes unless asked for a detailed review.
- For a review, show the original wording, the specific comprehension or evidence problem, and a proposed revision. Link the applicable Google page when explaining a finding. Distinguish ambiguity from wording that is understandable but unnecessarily demanding.
- Do not flag a term solely because it sounds AI-generated. Do not mechanically ban pronouns, jargon, metaphors, passive voice, or qualifying language. Prefer the wording that preserves the meaning and serves this reader.
