---
name: apple-shortcuts-actions
description: Compose Apple Shortcuts actions and hand them over as a tappable link that drops wired action cards onto the user's clipboard, ready to paste into any shortcut. Use when they want to build, generate, or share a shortcut or a chain of actions, when they ask for actions they can paste, or when they describe an automation and the natural delivery is a paste-in link rather than a signed file. Also use when an action's identifier or parameter shape has to be looked up.
---

# Apple Shortcuts actions

## Premise

A whole `.shortcut` file needs Apple's signature and does not import without it.
An individual action needs only the `com.apple.shortcuts.action` pasteboard
type, which a shortcut on the device can stamp. Actions can therefore be
composed anywhere and pasted freely.

That also supplies a primitive the app withholds. Shortcuts copies one action at
a time and offers no way to copy a set, so "here is a wired chain of nine
actions on your clipboard" is not a convenience over the editor. It is something
the editor cannot do.

Delivery is a `shortcuts://run-shortcut` link. Tapping it runs a receiver that
decodes the payload, stamps the type, and copies. Nothing is signed, installed,
or sent to a server.

## Goal and output

One tappable link, handed over as a link rather than a code block, with a
caption naming what it holds, how many actions, and where to paste.

## Process

[`mehrlander/shortcut-tools`](https://github.com/mehrlander/shortcut-tools)
holds the tooling, the 810-action dictionary, and the format record.

1. Write the chain as `{"label", "actions": [{"id", "p"}]}`, where `p` is
   `WFWorkflowActionParameters` verbatim.
2. Resolve every name against the dictionary (`node cli.js get <name>`), not
   from memory. `gettext` is not a key; the Text action is `text`.
3. `python3 tools/pack.py <chain>.json` prints the link.
4. `python3 tools/pack.py --verify "<link>"` against the exact text being sent.
5. Hand it over as `📋 [caption](link)`.

When an action's parameters are unknown, ask the user to build that one card in
the editor and copy it, then `python3 tools/unpack.py <file>`. Copying an action
yields a binary plist whose bytes survive the trip, so this reads the shape
exactly. The dictionary carries identifiers, and parameters for only the 38
control-flow entries, so for anything else this is the sole source.

## Key insights

- **The receiver is `Copy-ActionFromClaude`**, five actions, no JavaScript,
  source at `workflows/copy-action-from-claude.json`. An older receiver,
  `Copy-ActionFromJson`, takes uncompressed `{id, p}` and builds the plist on
  device. It still works; the packed route is the current one.
- **Derive anchor offsets.** A variable inside a string occupies one U+FFFC
  character and `attachmentsByRange` keys its offset. Counting by hand is the
  step that fails; `tokenString()` in the repo derives it.
- **The glyph rule inverts by route.** Packed payloads carry the raw U+FFFC,
  since base64 protects it and no browser renders it. The `{id, p}` route
  requires the `&#65532;` entity, since the raw glyph is stripped twice in
  transit.
- **Paste the link as emitted**, never shortened or retyped. Actions sit at the
  payload's head and the label at its tail, so an edited link pastes correct
  cards and reports the wrong thing.
- **UUIDs remint on paste.** Shortcuts rewrites references within one paste and
  not across pastes, so a patch cannot address an action already in the
  shortcut. Replace whole units.
- **The Actions app by Sindre Sorhus is a hard dependency.** It supplies the
  step that stamps a pasteboard UTI, which plain Shortcuts cannot do.

## Bundled

- `assets/builder.js`: the device-side serializer for the legacy
  `Copy-ActionFromJson` receiver. Read only when rebuilding that shortcut.

## Extending

`docs/shortcuts-format-notes.md` in the repo carries the format: control flow,
the two attachment forms, the aggrandizements, and the coercion that runs
JavaScript from a `data:` URL. Parameter shapes for Match Text and Combine Text
are still unrecorded, and `tools/unpack.py` is how to settle them.
