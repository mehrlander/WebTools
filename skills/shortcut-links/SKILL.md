---
name: shortcut-links
description: Hand over a tappable shortcuts:// link that installs, runs, or opens something on the user's iPhone. Use when delivering a shortcut to install, running one remotely, opening an iOS settings page, or asking a device question whose answer should come back on its own. Covers which route to pick, which receiver each needs, and the emitter for each, so no link is ever typed. For composing the action cards themselves, see apple-shortcuts-actions.
---

# Handing over a shortcut link

A `shortcuts://run-shortcut` link runs a **receiver** already on the device.
Everything below is one receiver plus one emitter. Run the emitter; never type a
link. A retyped payload keeps its actions and loses its label, so it works and
misreports at once.

Commands are `mehrlander/shortcut-tools`.

## The routes

| Payoff | Receiver | Emit with |
| --- | --- | --- |
| Paste action cards | `Copy-ActionFromClaude` | `pack.py <chain> --url` |
| Install a shortcut, signed here | `Library-Fetch` | `plist.py <chain> --link --fetch --ref <sha>` |
| Run one, input baked in | any | `run.py <Name> --text '<input>'` |
| Run and return the result | `Run-Steps` then `Log-Repo` | `run.py <Name> --log` |
| Open an iOS settings page | `Open-URL` | `run.py Open-URL --text '<prefs URL>'` |

`Library-Import` is the older install route: the phone gzips a plist and POSTs
it to a signing worker. Prefer `--fetch`, which signs in the repo instead.

## Four rules

**Pre-flight an install.** `plist.py <chain> --sign` before the link goes out.
The worker signs through Apple's iCloud service and answers an outage with a
46-byte text body, which the phone reports as "Unrecognized archive format", a
message that names the file for a fault two services away. Retrying here costs
nothing; a tap spent on an outage is wasted.

**Re-installing breaks a binding.** Back Tap and the AssistiveTouch button hold
a reference the save-over import does not preserve, so the gesture silently
stops working. A handover that replaces a bound shortcut carries the settings
link in the same message:

| Setting | `prefs:` path |
| --- | --- |
| Back Tap | `root=ACCESSIBILITY&path=TOUCH_REACHABILITY_TITLE/BackTap` |
| AssistiveTouch | `root=ACCESSIBILITY&path=TOUCH_REACHABILITY_TITLE/AIR_TOUCH_TITLE` |

Send these through `Open-URL`, not as bare links: a chat client swallows the
scheme, and Shortcuts does not.

**A diagnostic returns itself.** End it in `Log-Repo` rather than a question, and
read the answer with `log.py`. Ask the device only what the repo cannot answer,
which is what the screen did.

**A link makes Shortcuts the current app**, so anything routing on
`Get Current App` takes the Shortcuts branch every time and a tap proves nothing
about the others.

## Icons

📋 when the payoff is the clipboard, 📲 for anything else. Always
`[label](url)`; a custom scheme is not autolinked and a code span is dead text.
