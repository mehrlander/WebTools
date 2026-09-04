---
id: promote-shortcuts-skill-to-plugin-5d74br
title: Decide whether apple-shortcuts-actions belongs in the portable plugin
status: backlog
opened: 2026-08-10
size: S
---
# Decide whether apple-shortcuts-actions belongs in the portable plugin

The skill sits in `skills/`, the on-demand library, so it loads only when
someone asks. The case for moving it to `.claude/skills/`, where the plugin
ships it and it fires ambiently, is that handing a user a tappable link that
puts wired content on their clipboard is a general delivery mechanism rather
than an Apple Shortcuts curiosity. It is the only route that reaches a phone's
pasteboard from a sandbox.

The case against is that it is narrow: it needs the Actions app, a receiving
shortcut, and an iOS device, and none of the plugin's 15 skills carries a device
dependency.

Promotion also closes the drift this came out of. Plugin-shipped skills track
`main` through the marketplace clone; an account-scope install does not, and
that is what left a superseded version firing unprompted (PR #392,
`skills/README.md`).

## What to weigh
- Whether the delivery mechanism generalizes past Shortcuts, or only reads that
  way because it is the only device channel available.
- Whether an ambient skill that cannot work without a specific device setup is
  worth the trigger surface in every session.
- Whether promoting it means splitting it: a general "deliver to the device"
  primitive in the plugin, the Shortcuts specifics left in the library.

**Done when** the skill is either moved with its manifest and README updated,
or left in the library with the reasoning recorded here so it is not re-asked.

## Progress log
- 2026-09-04: Skill count corrected, 16 to 15, in a refinement pass:
  `.claude/skills/` holds 15 `SKILL.md` files plus a `hooks/` directory that is
  not a skill, against 41 in the on-demand `skills/` library. The decision is
  untouched and still the whole task.
