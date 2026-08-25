# A web page cannot make an iPhone tap back at a moment of its own choosing

Measured on an actual iPhone, 2026-08-25, against
[`pages/scratch/haptics-probe.html`](../pages/scratch/haptics-probe.html), one
cell per technique. The result is negative, which is why it is written down: the
reachable haptic is real and it cannot be aimed.

## Context

`pages/dictate.html` takes the word under a long press, and the platform's own
long-press selection answers with a small tap on the wrist. The page would like
to do the same at the moment its own gesture fires.

## What was measured

| | Technique | Result |
| --- | --- | --- |
| A | `navigator.vibrate(30)` | nothing |
| B | a `switch` checkbox toggled by **script** | nothing |
| C | the same switch toggled **by hand** | **buzzes** |
| D | a `<label>` bound to a switch, **tapped** | **buzzes** |

## What it means

**The haptic is real and it belongs to the gesture, not to the state change.** C
and D both buzz and B does not, so what earns it is a genuine user activation of
a switch control. The activation may arrive through a label rather than the
input itself, which is the only degree of freedom here, and it is not enough: a
page still cannot fire one on demand.

`navigator.vibrate` is absent from WebKit and A confirms it. The estate calls it
in three places, all guarded by `if (navigator.vibrate)`:
[`lib/alpineComponents/fab.js`](../lib/alpineComponents/fab.js),
[`pages/word-select.html`](../pages/word-select.html), and a prototype. **Leave
them.** They are inert on iPhone and they work on Android, so deleting them
would cost real behavior somewhere to tidy a no-op here. Just do not count on
them: nothing on an iPhone has ever felt them.

## Why D does not rescue the long press

D says the tap can land on something other than the input. It does not say the
tap can be absent. During a long press the finger is already down on the text,
no control is being activated, and putting a label under the finger afterwards
changes nothing, since the touch that would have activated it began somewhere
else.

An always-present transparent label over the text pane would buzz, and would
buzz on **every** tap while swallowing the gestures the page is built out of.
That is not the same feature.

## The one route left, and why it is not used

A `shortcuts://` link can run a shortcut containing a Haptic action. It
navigates away from the page to do it, so it cannot punctuate a gesture. Useful
for a deliberate hand-off, useless for feedback.

## If this is ever re-asked

Re-measure rather than reason. WebKit could add the Vibration API, or extend
haptics to another control, in any release, and no emulator reproduces a Taptic
Engine. The probe page is kept for that: it depends on no external JavaScript
and reports whether its own script ran, both of which it learned the hard way on
its first run.
