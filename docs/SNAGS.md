# Snags

Things learned the hard way: small friction you trip over, noted so you trip on
it once, not three times. A triage queue, not just a diary. Each entry is a
one-liner (symptom, then the corrected move) with a `→` to the durable doc that
carries the full fix. Newest on top.

**Recurrence is the signal.** One trip is noise; the same trip two or three
times earns a systematic fix. An entry tracks how often it bit; a snag that
keeps recurring graduates to a [tracker](../tracker/) task that removes the
cause. The log triages, the tracker does the work.

Distinct from the other logs by what it keys on: the tracker keys on a **task**
(intent), the [merge guide](MERGE-GUIDE.md) on a **PR** (delivery), this on a
**snag** (a recurring friction), atomic and cross-PR. Entries stay an index (a
one-liner plus a `→`), so they cannot drift from the docs that hold the fix.

*(Provisional. Whether snags are authored in guide-PR bodies and projected here
like the merge guide, the recurrence mechanism, and the format are open in
[the snags spike](../tracker/tasks/spike-snags-log-gobdyq.md). Each entry leads
with a slug so a repeat can be matched and counted.)*

---

### https-block-resets-instead-of-403: a blocked host looks like a network flake
An outbound request dies with `Recv failure: Connection reset by peer` and reads
as a flake or a TLS problem. Over HTTPS the proxy's CONNECT tunnel succeeds and
TLS is then reset, so no deny header is ever sent and `curl -D -` shows nothing:
the documented probe cannot see a policy denial at all. Re-probe the same host
over plain `http://`, where the block answers `403` with `x-block-reason:
hostname_blocked`. Note both halves of that header are renamed from the
`x-deny-reason: host_not_allowed` the docs carried. *(seen: 2026-08-03)*
→ [environment/capabilities.md](environment/capabilities.md)

---

### phosphor-weight-is-a-family: an icon renders as nothing at all
`ph-push-pin-fill` is not an icon. Phosphor's weights are font families, not name
suffixes, so the class pair is `{weight} ph-{name}` (`ph-fill ph-push-pin`). A
name the font does not carry produces a zero-width blank with no console error,
so a missing glyph reads as a logic bug and gets debugged as one. Measure the
element's width before suspecting the state that controls it.
*(seen: 2026-07-28)*
→ [../skills/phosphor-icons/SKILL.md](../skills/phosphor-icons/SKILL.md)

---

### daisy-divide-paints-black: hairlines come out black, not grey
`divide-y divide-base-200` renders black lines. daisyUI ships its semantic colours
as its own utilities and `divide-*` is not among them, so `divide-base-200`
compiles to nothing and is dropped silently; Tailwind v4 then defaults
`border-color` to `currentColor` (v3 defaulted to `gray-200`), leaving the
divider painted in the text colour. Use `gap`, or an explicit
`[&>*+*]:border-t border-base-200`. Same trap in `ring-*` and `outline-*`.
*(seen: 2026-07-28)*
→ [../skills/daisy-alpine/SKILL.md](../skills/daisy-alpine/SKILL.md)

---

### x-collapse-needs-x-show: a panel renders at zero size
A component mounts with correct state yet renders at zero size: `x-collapse` with
no companion `x-show` sets `el.hidden` (the plugin keys on `_x_isShown`). Pair
the two, or use a plain `x-if` for presence toggling. A green logic test won't
catch it; only a render does. *(seen: 2026-07-15)*
→ [environment/testing.md](environment/testing.md)

---

### mcp-approval-is-often-routing: an approval prompt that is really a wall
A GitHub MCP call "requires approval" though the same operation runs clean
elsewhere: a reconnected second server (a per-connection UUID twin) is holding
the call. Retry on the stable `mcp__github__*` server before re-approving.
*(seen: 2026-07-15)*
→ [github/mcp-server-routing.md](github/mcp-server-routing.md)
