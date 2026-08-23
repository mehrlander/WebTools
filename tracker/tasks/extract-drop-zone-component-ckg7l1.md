---
id: extract-drop-zone-component-ckg7l1
title: Extract drop-zone as a reusable Alpine component
status: done
opened: 2026-07-14
closed: 2026-07-15
session: claude/tracker-summary-nu74te
---
# Extract drop-zone as a reusable Alpine component

Today `popups/drop-file.html` is a standalone demo page that handles file drag-and-drop with Alpine. The core logic is simple and self-contained, but it's not reusable. Extract it as an Alpine component (`lib/alpineComponents/drop-zone.js`) so it can be mounted in show-repo, the stage's copy-to-repo UI, or anywhere else that needs file input.

Scope:

- Component accepts a callback for handling dropped/pasted files, rather than prescribing what happens (today it logs to console)
- Parameterizable: file type filters, size limits, success/error messaging
- Returns the file object and ArrayBuffer to the parent without owning the result
- Hot state for visual feedback during drag-over
- Supports both drag-drop and paste (bonus: read-from-text for stage format)
- Accessible: tab-focusable drop zone, keyboard-paste friendly
- The popup page remains as a working example, now delegating to the component

Primary use case: stage.js could mount this to accept `.web-tools.json` files or raw stage-format pastes, auto-populating the repo dropdown and path selector. Follow-on uses (gist-editor, compression-helper) can adopt it when needed.

Done means: component lives in lib/alpineComponents/, has a clear interface (init params, callback signature), the popup page still works as a demo, and stage.js can adopt it without breaking changes.

## Progress log
- 2026-07-14: Filed during the stage-copy UX assessment. Noted as a natural extraction from the existing popup, following the component pattern already in the repo (stager, navigator, viewer, compress-input-cm).
- 2026-07-15: Built `lib/alpineComponents/drop-zone.js` (drag-drop, click-to-browse, paste; emits a `drop-file` event with the File plus its bytes). Popup delegates to it. Went past the original scope: wired into show-repo's stage tab via a new `uploader` component that composes drop-zone, the `mention` path-picker (now with a `bare` option), and a two-tap commit; `gh-store` gained `saveBytes` for binary-safe writes. In flight on branch `claude/tracker-summary-nu74te`, PR #219 (ready for review). Flips to done on merge.
- 2026-07-18: Closed. Delivered via PR #219 (merged 2026-07-15); status was left in-progress after the merge and is flipped now in a tracker sweep.
