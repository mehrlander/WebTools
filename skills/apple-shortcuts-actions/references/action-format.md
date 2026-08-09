# Action format and the device pipeline

This file is the deep reference. SKILL.md covers the common path; come here for
the binding model, the full pipeline, the gotcha catalog, and how to discover
new action identifiers.

## Table of contents
- The compact action format
- The two-part binding model (UUID + anchor)
- The device-side pipeline, stage by stage
- The gotcha catalog (every failure we hit and why)
- Discovering action identifiers and parameter shapes
- The device-side builder JS (reference copy)

---

## The compact action format

A chain is a JSON object with an `actions` array. Each action is `{ id, p }`:

- `id` is the action's `WFWorkflowActionIdentifier`, e.g. `is.workflow.actions.gettext`.
- `p` is the action's `WFWorkflowActionParameters` object, verbatim as Apple
  stores it, minus nothing.

This mirrors exactly what the Shortcuts editor emits when you export a shortcut
as plist/JSON. So the fastest way to learn an action's shape is to build it once
in the editor and read it back (see "Discovering action identifiers" below).

```json
{
  "actions": [
    { "id": "is.workflow.actions.gettext",
      "p": { "UUID": "5CCD0A21-...", "WFTextActionText": "Hello" } }
  ]
}
```

The device-side builder wraps each `{ id, p }` into a full plist document. You
never write the `<?xml>`, DOCTYPE, or `<plist>` envelope. You write only the
action's identity and parameters.

---

## The two-part binding model (UUID + anchor)

Wiring one action's output into another action takes **two** cooperating pieces.
Both must be present or the variable chip pastes in empty.

**1. The UUID (which action).** Every action carries a `UUID`. An action that
consumes another's output references that producer's UUID via `OutputUUID`. You
mint these UUIDs yourself; they are arbitrary but must match between producer and
consumer. Example: a Text action has `UUID` `5CCD0A21...`; a later Show Result
action references `OutputUUID: 5CCD0A21...`.

**2. The anchor (where in the text).** A Shortcuts text field is not plain text.
It is text with inline variable tokens, each occupying one character position
held by the object-replacement character **U+FFFC**. The `attachmentsByRange`
map says "at position {0,1} (offset 0, length 1) sits the token described here."
The `string` value must contain the U+FFFC character at that exact offset, or the
range points at nothing and the binding fails silently.

```
"Text": { "Value": {
    "string": "&#65532;",                 <- the anchor, ONE char at offset 0
    "attachmentsByRange": {
        "{0, 1}": { "OutputUUID": "5CCD0A21-...", "Type": "ActionOutput", "OutputName": "Text" }
    } },
    "WFSerializationType": "WFTextTokenString" }
```

Why losing the anchor breaks things without an error: the UUID and the range can
both be perfectly correct, but if the `string` is empty, position {0,1} does not
exist, so there is no slot for the token. Result: valid action, correct
reference, empty chip. The anchor is small but load-bearing.

**Anchors with surrounding text.** If the displayed string is `(X)(Y)` with two
tokens, the anchors sit at the token offsets and the ranges name them, e.g.
`{1, 1}` and `{4, 1}`. Count characters carefully; the offset is in UTF-16 code
units as the editor sees them.

**Actions without inline variables** (a plain Comment, a literal Text action with
no embedded token) have no `attachmentsByRange` and no anchor. They never hit the
glyph problem. The anchor only appears where a variable is embedded *inside* a
larger string.

---

## THE ENTITY RULE (the single most important convention)

**Never write the raw U+FFFC glyph anywhere in a payload. Always write the ASCII
entity `&#65532;` instead.**

The raw glyph is an invisible character that dies at two separate stages:
- pasting the JSON into a Shortcuts text field strips it, and
- the device browser render strips it.

`&#65532;` is plain visible ASCII. It survives every stage untouched and is
expanded back into a real U+FFFC glyph only at the very end, by Apple's plist
coercion, safely inside Shortcuts. So the fragile character never exists as a
literal anywhere a human or a browser handles it. The `build_link.py` script
rejects any payload containing a raw glyph for exactly this reason.

---

## The device-side pipeline, stage by stage

The user's `Copy-ActionFromJson` shortcut performs these steps. Understanding
them explains every constraint above.

1. **Receive input**: the JSON chain arrives as text (from the link's `text`
   argument, or a sample stored in the shortcut).
2. **Builder JS**: a Text action holds the serializer JS. The shortcut calls it
   as `(JS)(payload)`, passing the parsed chain as `obj`. The JS walks each
   `{ id, p }`, serializes to plist XML, and writes `{ "actions": [xml, ...] }`
   into a `<pre>` via `textContent`.
3. **Get-JsonFromJs**: runs the JS in a `data:text/html;base64` URL, reads the
   rendered page back, and returns it coerced toward JSON.
4. **Detect Dictionary + take `actions`**: coerce the result to a dictionary and
   pull the `actions` array (now a list of plist XML strings).
5. **Get File of Type `com.apple.plist`**: coerce each XML string to a plist
   file. This is where `&#65532;` expands to the real glyph.
6. **Set Uniform Type Identifier -> `com.apple.shortcuts.action`**: the Sindre
   Sorhus *Actions* app action stamps the pasteboard type. This is the one step
   plain Shortcuts cannot do natively, and the reason the *Actions* app
   (free, by Sindre Sorhus) is a hard dependency.
7. **Copy to Clipboard (Local Only)**: the stamped file lands on the clipboard,
   now pasteable as real actions.

Then the user pastes into any shortcut's editor.

---

## The gotcha catalog

Every one of these produced a silent failure (no error, just wrong output or an
empty chip). They are sorted by where in the pipeline they bite.

| Symptom | Cause | Fix |
|---|---|---|
| Pasted text is plain, no action card | clipboard lacks the UTI | the `Set Uniform Type Identifier` step / *Actions* app must run |
| All XML tags gone, only inner text remains | `document.write` of XML into HTML; browser parsed tags as unknown elements and dropped them | write via `pre.textContent`, never `document.write` of raw markup |
| Show/Output chip pastes empty | U+FFFC anchor stripped by browser render | emit anchor as `&#65532;` entity in the builder output |
| Show/Output chip pastes empty, anchor already gone *before* the builder ran | raw glyph in the source JSON died on paste-in to the text field | write `&#65532;` in the source JSON, never the raw glyph |
| `&amp;#65532;` in output, chip still empty | builder double-escaped the entity's `&` | `esc()` must skip `&` when followed by `#<digits>;` |
| JSON won't coerce to dictionary | output was malformed by one of the above | fix the upstream stripping first |
| `shortcuts://` link does nothing on tap | wrong shortcut name, or stale embedded name | use the shortcut's *current* name; names key the link |

Note on naming: a shortcut's plist may carry a stale `workflowName` in a
self-reference if it was renamed after export. The `workflowIdentifier` UUID is
the true identity; the `name=` in a link must match the *current* app name.

---

## Discovering action identifiers and parameter shapes

**Check the local dictionary first.** [`mehrlander/shortcut-tools`](https://github.com/mehrlander/shortcut-tools)
holds `actions.json`, 810 action names mapped to their
`WFWorkflowActionIdentifier`, covering 321 Apple built-ins and 43 bundle
prefixes including `com.sindresorhus.Actions` (138 entries) and
`co.zottmann.ActionsForObsidian` (47). `npx shortcut-tools` searches it. That
answers the `id` for most actions without touching a device.

It does **not** answer `p`. The dictionary's only parameter templates are its 38
control-flow entries, so the other 772 are a bare identifier and the method
below is still how you get a parameter shape. Two of its own conventions are
worth knowing before reading the file: one value, `choosefrommenu`, holds three
newline-separated JSON objects rather than one, so split on `\n` before parsing;
and no entry carries a `GroupingIdentifier`, so nothing in it can pair a control
flow block on its own. That repo's [`docs/shortcuts-format-notes.md`](https://github.com/mehrlander/shortcut-tools/blob/main/docs/shortcuts-format-notes.md)
covers the plist layer under this skill: block pairing, variable binding by
producing UUID, and the derived `WFCondition` table.

For everything the dictionary does not cover, the reliable method:

1. In the Shortcuts editor, build the single action you want, configured exactly.
2. Export or read it back as plist/JSON (the user has tooling for this; the
   editor's own copy/export produces the canonical shape).
3. Read off the `WFWorkflowActionIdentifier` (your `id`) and the
   `WFWorkflowActionParameters` (your `p`).
4. Strip any values that are device-specific or that you want parameterized.

This is also how to learn unfamiliar territory: third-party actions (like the
Sindre Sorhus *Actions* app, bundle id `com.sindresorhus.Actions`) carry an
`AppIntentDescriptor` block identifying the app, team, and intent. Copy that
block verbatim; do not hand-construct it.

For exploring what exists across the wider Shortcuts ecosystem (libraries of
shortcuts, action references, community collections), the MacStories Shortcuts
Archive and assorted GitHub collections (e.g. the `0xdevalias` shortcuts gist,
which documents the plist/XML internals) are good starting points. The format
is always the same underneath: signed plist for whole shortcuts, and the
`com.apple.shortcuts.action` pasteboard type for individual actions.

---

## Serializer type coverage

The builder JS handles `string`, `number` (integer vs real), `boolean`, arrays,
and dicts. It does **not** yet handle `<data>` (raw binary blobs, which appear in
some actions, e.g. embedded images or certain dictionary attachments). If a
target action needs a `data` value, add a branch to `val()` that emits
`<data>base64...</data>`. Until then, base64-bearing binary parameters are the
one known unsupported case.
