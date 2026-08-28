#!/usr/bin/env python3
"""Emit dump/2026-08-28-question-lane.html.

One line per question: what was asked, how it was addressed, how many further
asks it outlived, how long it took. Nothing wraps. Three states and two colours.
Timestamps are read from the real record; the rows are hand-authored, which is
the part a live session would write for itself.
"""
import json

REC = '/home/user/web-tools-private/sessions/2026/08/2026-08-26-d0aaedcc.json'
OUT = '/home/user/web-tools/dump/2026-08-28-question-lane.html'

# raised, settled, who asked, question, how it was addressed, state
#   ask     a question that got an answer and moved nothing
#   act     the answer changed the work
Q = [
 ('08-26T03:00','08-26T03:02','u','Did the double-back-tap work land?',        'no, three pieces stalled',   'ask'),
 ('08-26T04:23','08-26T04:25','u','How should we proceed?',                    'one tap now, not surgery',   'act'),
 ('08-26T04:42','08-26T04:44','u','Did my probe run give you what you needed?','yes',                        'ask'),
 ('08-26T04:49','08-26T04:56','u','Does a shortcut-testing skill exist?',      'no, rule went elsewhere',    'ask'),
 ('08-26T05:04','08-26T05:12','u','Why was Library-Replace not found?',        'bad install order, fixed',   'act'),
 ('08-26T05:12','08-26T05:14','u','Did the double tap get the list treatment?','no, rebuilt it',             'act'),
 ('08-26T05:43','08-26T05:52','c','Which shortcut should the chunk target?',   'you named it',               'ask'),
 ('08-26T06:06','08-26T06:11','u','Does Get-FileInfo break on a list?',        'yes, fixed',                 'act'),
 ('08-26T06:08','08-26T06:11','c','Fix it on this branch, in the private repo?','yes',                       'ask'),
 ('08-26T12:42','08-26T12:58','u','Can Get File Info be one shortcut?',        'yes, rebuilt',               'act'),
 ('08-26T13:03','08-26T13:08','u','Minimum way to collapse the text cards?',   'one text action',            'act'),
 ('08-26T13:11','08-26T13:14','u','Do we have the latest SURFACING.md?',       'no, fetched it',             'act'),
 ('08-26T13:23','08-26T14:06','u','Green is used for asks. What marks a decision?','❇️ and ✴️ added',        'act'),
 ('08-26T13:58','08-26T14:06','u','Which orange glyph for "needs you"?',       '✴️',                         'ask'),
 ('08-26T18:35','08-26T18:37','u','Did you update the surfacing docs?',        'yes, on a branch',           'ask'),
 ('08-26T19:46','08-26T19:48','u','Where did we leave the shortcuts work?',    'four threads, two live',     'ask'),
 ('08-26T19:53','08-26T20:30','u','Why not Show Web View instead of Show HTML?','switched to the sheet',     'act'),
 ('08-26T22:05','08-26T22:14','u','Have we not already made copy work?',       'yes, found the page',        'act'),
 ('08-27T01:45','08-27T02:50','u','Can dictate call this shortcut on selection?','built, then withdrawn',    'act'),
 ('08-27T02:11','08-27T02:50','u','Is the menu supposed to work?',             'no, backed it out',          'act'),
 ('08-27T02:50','08-27T15:34','c','Should --publish drop an orphaned mirror?', 'yes, fixed with a test',     'act'),
 ('08-27T15:26','08-27T15:34','u','Resolve the pruning note you left?',        'done',                       'act'),
 ('08-27T15:43','08-27T15:48','u','Loose ends, or wrap and merge?',            'none, merged',               'ask'),
 ('08-27T16:19','08-27T16:25','u','Any reason not to ship #514?',              'no',                         'ask'),
]

d = json.load(open(REC))
asks = sorted(p['at'][5:16]
              for p in d['prompts']
              if not p['text'].lstrip().startswith(('Base directory for this skill:', 'Stop hook feedback:')))

items = []
for i, (a, b, w, q, o, k) in enumerate(Q):
    rounds = len([x for x in asks if a < x <= b])
    items.append(dict(i=i, at=a, at2=b, by=w, q=q, o=o, k=k, n=rounds))
marks = sorted({i['at'] for i in items} | {i['at2'] for i in items})
payload = json.dumps(dict(id=d['short'], items=items, marks=marks), ensure_ascii=False)

PAGE = r'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Questions raised, and how addressed</title>
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/alpinejs@3/dist/cdn.min.js" defer></script>
<link href="https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet">
<script>window.Q = __PAYLOAD__;</script>
</head>
<body class="bg-base-200">
<div x-data="lane()" class="max-w-2xl mx-auto p-3 text-[13px] leading-none">

  <div class="flex items-center gap-2 mb-2 leading-normal">
    <span class="font-semibold">Questions</span>
    <span class="opacity-40 tabular-nums" x-text="rows.length"></span>
    <span class="tabular-nums" :class="nOpen ? 'text-amber-600 font-semibold' : 'opacity-30'"
          x-text="nOpen + ' open'"></span>
    <input type="range" class="range range-xs grow max-w-40" min="0"
           :max="Q.marks.length-1" x-model.number="t">
    <span class="opacity-40 tabular-nums text-xs" x-text="now.slice(3).replace('T',' ')"></span>
  </div>

  <div class="bg-base-100 rounded overflow-hidden">
    <template x-for="it in rows" :key="it.i">
      <div class="flex items-center gap-2 h-7 px-2 border-l-[3px] border-b border-b-base-200"
           :class="open(it) ? 'border-l-amber-400 bg-amber-50/60'
                        : it.k==='act' ? 'border-l-sky-400' : 'border-l-transparent'">
        <span class="grow sm:grow-0 sm:w-[46%] shrink truncate" x-text="it.q"></span>
        <span class="opacity-25 shrink-0 hidden sm:inline">→</span>
        <span class="grow truncate hidden sm:inline" :class="open(it) ? 'opacity-40 italic' : 'opacity-55'"
              x-text="open(it) ? 'open' : it.o"></span>
        <span class="w-6 shrink-0 text-right tabular-nums"
              :class="it.n ? 'text-amber-600' : ''" x-text="it.n ? '×'+it.n : ''"></span>
        <span class="w-14 shrink-0 text-right tabular-nums"
              :class="open(it) ? 'text-amber-600' : 'opacity-35'" x-text="lag(it)"></span>
        <span class="w-2 shrink-0 opacity-30" x-text="it.by==='c' ? 'c' : ''"></span>
      </div>
    </template>
  </div>

  <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs opacity-40 leading-normal">
    <span class="text-sky-500">▌<span class="text-base-content/40">changed the work</span></span>
    <span class="opacity-40">▌answered only</span>
    <span class="text-amber-500">▌<span class="text-base-content/40">open</span></span>
    <span>×N rounds</span>
    <span>c Claude asked</span>
  </div>
</div>

<script>
function lane() {
  const span = (a, b) => {
    const m = Math.round((Date.parse('2026-' + b + 'Z') - Date.parse('2026-' + a + 'Z')) / 60000);
    return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  };
  return {
    Q: window.Q, t: window.Q.marks.length - 1,
    get now() { return this.Q.marks[this.t] },
    get rows() { return this.Q.items.filter(i => i.at <= this.now) },
    get nOpen() { return this.rows.filter(i => this.open(i)).length },
    open(it) { return it.at2 > this.now },
    lag(it) { return span(it.at, this.open(it) ? this.now : it.at2) },
  }
}
</script>
</body></html>
'''
open(OUT, 'w').write(PAGE.replace('__PAYLOAD__', payload))
print('wrote', OUT, len(open(OUT).read()), 'bytes')
