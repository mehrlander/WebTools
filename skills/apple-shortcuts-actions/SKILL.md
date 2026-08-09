---
name: apple-shortcuts-actions
description: >-
  Compose Apple Shortcuts actions and hand them to the user as a tappable
  shortcuts:// link that drops real, wired-up action cards onto their clipboard,
  ready to paste into any shortcut. Use this whenever the user wants to build,
  generate, assemble, or share Shortcuts actions or action chains, when they
  mention pasting actions, action links, "Copy-ActionFromJson", the compact
  {id, p} action format, the U+FFFC / &#65532; anchor, or wiring one action's
  output into another. Also use when they want to explore the Shortcuts action
  ecosystem, discover action identifiers, or turn a described automation into
  pasteable actions. Reach for this even when they just say "make me a shortcut
  that..." and the natural delivery is a paste-in link rather than a signed file.
---

# Apple Shortcuts: compose actions, deliver as a tappable link

## What this enables

You can compose one or more Shortcuts actions and deliver them to the user as a
`shortcuts://run-shortcut` link. When the user taps it on their device, their
`Copy-ActionFromJson` shortcut serializes the actions, stamps the correct
clipboard type, and places real action cards on the clipboard. The user pastes
them into any shortcut, fully wired, including variables that flow from one
action to the next. No signing, no server, no app-store round trip.

This sidesteps the usual wall: a complete `.shortcut` file must be Apple-signed,
which cannot be forged locally. Individual *actions* need no signature; they only
need the `com.apple.shortcuts.action` pasteboard type, which the device shortcut
applies. So you compose freely and the user pastes freely.

## The delivery format

The user's device has a shortcut named **`Copy-ActionFromJson`** that accepts a
JSON chain and does all the device-side work. Your job is to produce the chain
and wrap it in a link. Use the helper script:

```bash
python3 scripts/build_link.py chain.json
```

It prints the tappable `shortcuts://run-shortcut?name=Copy-ActionFromJson&...`
link and validates the payload first (see "The two rules" below). Hand the
printed link to the user as an actual clickable link, not a code block, so they
can tap it directly. The chat renderer keeps `shortcuts://` links live.

## The compact action format

A chain is a JSON object with an `actions` array. Each action is `{ id, p }`:

```json
{
  "actions": [
    { "id": "is.workflow.actions.gettext",
      "p": { "UUID": "5CCD0A21-7942-4CEA-8D68-620B02786E6C",
             "WFTextActionText": "Hello" } }
  ]
}
```

- `id` is the action's `WFWorkflowActionIdentifier`.
- `p` is the action's `WFWorkflowActionParameters`, verbatim as Apple stores it.

You never write the `<?xml>` / DOCTYPE / `<plist>` envelope. The device builder
adds it. You write only identity and parameters. This is exactly the shape the
Shortcuts editor emits on export, so the editor is your ground truth for any
action's parameter structure.

## Wiring actions together

To pass one action's output into another, two things must both be present:

1. **A UUID.** Give the producing action a `UUID`. Reference it from the
   consuming action via `OutputUUID`. You mint these (any UUID works) and they
   must match between producer and consumer.

2. **An anchor.** A text field that embeds a variable holds an invisible
   placeholder character (U+FFFC) at the variable's position, and an
   `attachmentsByRange` map binding that position to the producer's `OutputUUID`.

```json
{ "id": "is.workflow.actions.showresult",
  "p": { "UUID": "E0EB...",
         "Text": { "Value": {
             "string": "&#65532;",
             "attachmentsByRange": {
                 "{0, 1}": { "OutputName": "Text",
                             "OutputUUID": "5CCD0A21-7942-4CEA-8D68-620B02786E6C",
                             "Type": "ActionOutput" } } },
             "WFSerializationType": "WFTextTokenString" } } }
```

Here the Show Result action displays the output of the Text action whose UUID is
`5CCD0A21...`. The `&#65532;` is the one-character anchor at offset 0; the range
`{0, 1}` (offset 0, length 1) names it; the `OutputUUID` says what fills it.

Actions that do not embed a variable inside a string (a plain Comment, a literal
Text action) need no anchor and no `attachmentsByRange`.

For the full binding model, multi-token strings, character-offset rules, and how
to discover unfamiliar action shapes, read `references/action-format.md`.

## The two rules that prevent silent failure

Both of these fail *silently*: no error, just an empty variable chip or
stripped-out content. Internalize them.

**Rule 1. Write anchors as `&#65532;`, never the raw glyph.** The raw U+FFFC
character is invisible and gets stripped both when JSON is pasted into a
Shortcuts field and when the device browser renders it. The ASCII entity
`&#65532;` survives every stage and is expanded to a real glyph only at the final
plist-coercion step, safely inside Shortcuts. The `build_link.py` validator
rejects any payload containing a raw glyph.

**Rule 2. Match the shortcut's current name.** The link keys off the shortcut's
name. If the user renamed it, use the new name; a stale name makes the link do
nothing on tap.

## Prerequisites on the user's device

- The **`Copy-ActionFromJson`** shortcut (holds the builder JS and the pipeline).
  Its builder block is preserved at `assets/builder.js` for reference or rebuild.
- The **Actions** app by Sindre Sorhus (free). It provides the
  `Set Uniform Type Identifier` step that stamps `com.apple.shortcuts.action`.
  Plain Shortcuts cannot set a pasteboard UTI natively; this is a hard dependency.

If a paste fails, consult the gotcha catalog in `references/action-format.md`,
which maps each symptom to its cause and fix.

## Workflow

1. Understand the automation the user wants as a sequence of actions.
2. For each action, determine its `id` and `p`. If unsure of an action's
   parameter shape, ask the user to build it once in the editor and read it back,
   or consult `references/action-format.md` for discovery guidance.
3. Assign UUIDs to any action whose output another action consumes, and wire the
   consumers with `OutputUUID` + a `&#65532;` anchor.
4. Write the chain JSON. Keep anchors as `&#65532;`.
5. Run `scripts/build_link.py` to validate and produce the link.
6. Hand the user the link as a tappable link. Tell them to tap it, then paste.
7. If anything pastes wrong, diagnose via the gotcha catalog rather than
   guessing; the failures are well-characterized.

## Bundled resources

- `scripts/build_link.py`: validate a chain and emit the tappable link.
- `references/action-format.md`: binding model, full device pipeline, gotcha
  catalog, action-discovery method, serializer type coverage.
- `assets/builder.js`: the device-side serializer JS (reference copy).

## Outside this skill

[`mehrlander/shortcut-tools`](https://github.com/mehrlander/shortcut-tools) is
the action dictionary (810 names to identifiers, searchable by CLI) and the
plist layer beneath this skill: how blocks pair, how variables bind, what the
`.shortcut` file itself looks like. This skill composes actions and delivers
them as a link; that repo is where an identifier or a format question is
answered. See `references/action-format.md` for when to reach for which.
