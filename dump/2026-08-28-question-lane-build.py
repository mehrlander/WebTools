#!/usr/bin/env python3
"""Emit dump/2026-08-28-question-lane.html.

The smallest thing that answers "can we track questions": one row per question,
a state, and how long it stayed open. Timestamps come from the real record; the
question list is hand-authored, which is the part a live session would write.
"""
import json

REC = '/home/user/web-tools-private/sessions/2026/08/2026-08-26-d0aaedcc.json'
OUT = '/home/user/web-tools/dump/2026-08-28-question-lane.html'

d = json.load(open(REC))

# raised, resolved, who asked, the question in one line.
Q = [
 ('2026-08-26T03:00', '2026-08-26T03:02', 'u', 'Did the double-back-tap revision land in an earlier session?'),
 ('2026-08-26T04:23', '2026-08-26T04:25', 'u', 'How should we proceed?'),
 ('2026-08-26T04:42', '2026-08-26T04:44', 'u', 'Did the probes I ran return what you needed?'),
 ('2026-08-26T04:49', '2026-08-26T04:56', 'u', 'Does a shortcut-testing skill exist, and does it say this?'),
 ('2026-08-26T05:04', '2026-08-26T05:12', 'u', 'Why was Library-Replace not found on the first install link?'),
 ('2026-08-26T05:12', '2026-08-26T05:14', 'u', 'The double-tap shortcut did not get the list treatment, did it?'),
 ('2026-08-26T05:43', '2026-08-26T05:52', 'c', 'Which shortcut should the chunk target?'),
 ('2026-08-26T06:06', '2026-08-26T06:11', 'u', 'Does Get-FileInfo’s caption break when Get File Info processed a list?'),
 ('2026-08-26T06:08', '2026-08-26T06:11', 'c', 'Should the fix go on this branch, in web-tools-private?'),
 ('2026-08-26T12:42', '2026-08-26T12:58', 'u', 'Can Get File Info be one shortcut instead of several?'),
 ('2026-08-26T13:03', '2026-08-26T13:08', 'u', 'What is the minimum way to collapse the combining text cards?'),
 ('2026-08-26T13:11', '2026-08-26T13:14', 'u', 'Do we have the latest SURFACING.md?'),
 ('2026-08-26T13:23', '2026-08-26T14:06', 'u', 'Green is being used for asks. What marks a decision I owe you?'),
 ('2026-08-26T13:58', '2026-08-26T14:06', 'u', 'Which orange glyph should mark "needs you"?'),
 ('2026-08-26T18:35', '2026-08-26T18:37', 'u', 'Did you update the surfacing documentation?'),
 ('2026-08-26T19:46', '2026-08-26T19:48', 'u', 'Where did we leave the shortcuts work?'),
 ('2026-08-26T19:53', '2026-08-26T20:30', 'u', 'Why not the Show Web View sheet instead of Show HTML in Safari?'),
 ('2026-08-26T22:05', '2026-08-26T22:14', 'u', 'Copy reportedly failed, but have we not already made copy work?'),
 ('2026-08-27T01:45', '2026-08-27T02:50', 'u', 'Can the dictate page call this new shortcut on selected text?'),
 ('2026-08-27T02:11', '2026-08-27T02:50', 'u', 'Is the menu supposed to be working?'),
 ('2026-08-27T02:50', '2026-08-27T15:34', 'c', 'Should --publish remove a mirror whose chain is gone? Noticed, not fixed.'),
 ('2026-08-27T15:26', '2026-08-27T15:34', 'u', 'Can you assess and resolve the pruning note?'),
 ('2026-08-27T15:43', '2026-08-27T15:48', 'u', 'Loose ends, or is this a good place to wrap and merge?'),
 ('2026-08-27T16:19', '2026-08-27T16:25', 'u', 'Is there a reason not to ship #514?'),
]

items = [dict(i=i, at=a, at2=b, by=w, q=t) for i, (a, b, w, t) in enumerate(Q)]
marks = sorted({i['at'] for i in items} | {i['at2'] for i in items})
payload = json.dumps(dict(
    id=d['short'], day=d['day'], items=items, marks=marks), ensure_ascii=False)

PAGE = r'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Questions &mdash; a compact lane</title>
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/alpinejs@3/dist/cdn.min.js" defer></script>
<link href="https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet">
<script>window.Q = __PAYLOAD__;</script>
</head>
<body class="bg-base-200">
<div x-data="lane()" class="max-w-md mx-auto p-3 text-sm">

  <div class="flex items-baseline gap-2 mb-1">
    <span class="font-semibold">Questions</span>
    <span class="opacity-50" x-text="Q.id"></span>
    <span class="grow"></span>
    <span class="tabular-nums" :class="open.length ? 'text-warning font-semibold' : 'opacity-50'"
          x-text="open.length + ' open'"></span>
  </div>

  <input type="range" class="range range-xs mb-3" min="0" :max="Q.marks.length-1" x-model.number="t">
  <div class="-mt-2 mb-2 text-xs opacity-40 tabular-nums" x-text="'as of ' + now.slice(5).replace('T',' ')"></div>

  <template x-for="it in open" :key="it.i">
    <div class="flex gap-2 py-1 border-l-2 border-warning pl-2">
      <span class="tabular-nums text-warning w-16 shrink-0" x-text="since(it.at)"></span>
      <span x-text="it.q"></span>
      <span class="opacity-40 shrink-0" x-show="it.by==='c'">c</span>
    </div>
  </template>

  <div class="h-px bg-base-300 my-2" x-show="open.length && done.length"></div>

  <template x-for="it in done" :key="it.i">
    <div class="flex gap-2 py-1 pl-2 opacity-45">
      <span class="tabular-nums w-16 shrink-0" x-text="took(it)"></span>
      <span x-text="it.q"></span>
      <span class="shrink-0" x-show="it.by==='c'">c</span>
    </div>
  </template>

  <p class="text-xs opacity-40 mt-4 leading-relaxed">
    Drag to move through the session. Left column is how long a question has been
    open, or how long it took. <code>c</code> marks one Claude raised.
  </p>
</div>

<script>
function lane() {
  const span = (a, b) => {
    const m = Math.round((Date.parse(b + 'Z') - Date.parse(a + 'Z')) / 60000);
    return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  };
  return {
    Q: window.Q, t: window.Q.marks.length - 1,
    get now() { return this.Q.marks[this.t] },
    get open() { return this.Q.items.filter(i => i.at <= this.now && i.at2 > this.now) },
    get done() { return this.Q.items.filter(i => i.at2 <= this.now).reverse() },
    since(at) { return span(at, this.now) || '0m' },
    took(it) { return span(it.at, it.at2) },
  }
}
</script>
</body></html>
'''
open(OUT, 'w').write(PAGE.replace('__PAYLOAD__', payload))
print('wrote', OUT, len(open(OUT).read()), 'bytes')
