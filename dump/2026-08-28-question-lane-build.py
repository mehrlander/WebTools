#!/usr/bin/env python3
"""Emit dump/2026-08-28-question-lane.html.

One row per question a session answers, whether or not anyone asked it.

`asked` rows quote the user or Claude; the rest are questions the content
answers without posing, written after the fact. That distinction is the `?`
column and it is an epistemic one, not decoration: an asked row is derived from
somebody's words, an unasked row is authored by a model reading the transcript.

The ledger is a filter over this, not a separate artifact: asked, and still
open after the turn that raised it.
"""
import json

REC = '/home/user/web-tools-private/sessions/2026/08/2026-08-26-d0aaedcc.json'
OUT = '/home/user/web-tools/dump/2026-08-28-question-lane.html'

# raised, settled, who, asked?, question, answer
A, N = True, False
Q = [
 ('08-26T03:00','08-26T03:02','u',A,'Did the double-back-tap work land?',           'no, three pieces stalled'),
 ('08-26T04:23','08-26T04:25','u',A,'How should we proceed?',                       'one tap now, not surgery'),
 ('08-26T04:26','08-26T04:34','c',N,'Can Back-DoubleTap be rebuilt from the repo?', 'yes, recovered at 59 actions'),
 ('08-26T04:42','08-26T04:44','u',A,'Did my probe run give you what you needed?',   'yes'),
 ('08-26T04:49','08-26T04:56','u',A,'Does a shortcut-testing skill exist?',         'no, rule went elsewhere'),
 ('08-26T04:49','08-26T05:04','c',N,'Where does the guidance rule live instead?',   'into the probe receivers'),
 ('08-26T05:04','08-26T05:12','u',A,'Why was Library-Replace not found?',           'never installed on the phone'),
 ('08-26T05:12','08-26T05:14','u',A,'Did the double tap get the list treatment?',   'no, rebuilt it'),
 ('08-26T05:21','08-26T05:32','c',N,'Does the brief block before the target runs?', 'yes, the retest answered 7'),
 ('08-26T05:21','08-26T05:40','c',N,'Can the 20-action menu consolidate after all?','yes, same pass'),
 ('08-26T05:40','08-26T05:52','c',N,'Why did the swapped card break?',              'my edit dropped the identifier'),
 ('08-26T05:43','08-26T05:52','c',A,'Which shortcut should the chunk target?',      'you named it'),
 ('08-26T06:06','08-26T06:11','u',A,'Does Get-FileInfo break on a list?',           'yes, fixed'),
 ('08-26T06:08','08-26T06:11','c',A,'Fix it on this branch, in the private repo?',  'yes'),
 ('08-26T06:11','08-26T06:38','c',N,'Does the rebuilt shortcut fix the list case?', 'built and verified'),
 ('08-26T12:38','08-26T12:42','c',N,'How do I run the test?',                       'two taps, it logs itself'),
 ('08-26T12:42','08-26T12:58','u',A,'Can Get File Info be one shortcut?',           'yes, rebuilt'),
 ('08-26T12:42','08-26T12:58','c',N,'Did the caption fix hold end to end?',         'both log entries landed'),
 ('08-26T13:03','08-26T13:08','u',A,'Minimum way to collapse the text cards?',      '29 actions to 17, one card'),
 ('08-26T13:11','08-26T13:14','u',A,'Do we have the latest SURFACING.md?',          'no, two commits after start'),
 ('08-26T13:23','08-26T14:06','u',A,'Green is used for asks. What marks a decision?','❇️ and ✴️ added'),
 ('08-26T13:23','08-26T13:25','c',N,'Why did the stop hook fire?',                  'my probe left files staged'),
 ('08-26T13:58','08-26T14:06','u',A,'Which orange glyph for "needs you"?',          '✴️'),
 ('08-26T14:06','08-26T18:32','c',N,'Did CI pass on #514?',                         'green, and mergeable'),
 ('08-26T18:32','08-26T18:34','u',A,'Where are we this session?',                   'one goal, four decisions'),
 ('08-26T18:35','08-26T18:37','u',A,'Did you update the surfacing docs?',           'yes, on a branch'),
 ('08-26T19:46','08-26T19:48','u',A,'Where did we leave the shortcuts work?',       'four installed, two verified'),
 ('08-26T19:53','08-26T20:30','u',A,'Why not Show Web View instead of Show HTML?',  'switched to the sheet'),
 ('08-26T21:35','08-26T21:49','c',N,'Does script run inside the sheet?',            'yes, it is a browsing context'),
 ('08-26T21:49','08-26T21:57','c',N,'Does the network work in the sheet?',          'yes, a real fetch resolved'),
 ('08-26T21:57','08-26T22:05','u',A,'Any other capability worth probing?',          'one battery, six at a time'),
 ('08-26T22:05','08-26T22:14','u',A,'Have we not already made copy work?',          'yes, found the page'),
 ('08-26T22:14','08-26T22:51','c',N,'What is the sheet unable to do?',              'only the file:// origin'),
 ('08-26T22:51','08-27T01:45','c',N,'Can Repo-Viewer resolve without a tap?',       'yes, out of the corpus'),
 ('08-27T01:45','08-27T02:50','u',A,'Can dictate call this shortcut on selection?', 'built, then withdrawn'),
 ('08-27T02:11','08-27T02:50','u',A,'Is the menu supposed to work?',                'no, you opened the live page'),
 ('08-27T02:50','08-27T15:34','c',A,'Should --publish drop an orphaned mirror?',    'yes, fixed with a test'),
 ('08-27T02:46','08-27T15:26','c',N,'Can Ask-Grok be withdrawn cleanly?',           'yes, gone in both places'),
 ('08-27T15:26','08-27T15:34','u',A,'Resolve the pruning note you left?',           'done, and my note was half wrong'),
 ('08-27T15:43','08-27T15:48','u',A,'Loose ends, or wrap and merge?',               'none, merged'),
 ('08-27T16:19','08-27T16:25','u',A,'Any reason not to ship #514?',                 'no'),
 ('08-27T16:19','08-27T16:25','c',N,'Was anything lost when the container went?',   'no, the wait was already spent'),
]

d = json.load(open(REC))
asks = sorted(p['at'][5:16] for p in d['prompts']
              if not p['text'].lstrip().startswith(
                  ('Base directory for this skill:', 'Stop hook feedback:')))

items = []
for i, (a, b, w, ask, q, o) in enumerate(sorted(Q)):
    rounds = len([x for x in asks if a < x <= b])
    items.append(dict(i=i, at=a, at2=b, by=w, ask=ask, q=q, o=o, n=rounds,
                      led=ask and rounds > 0))
payload = json.dumps(dict(id=d['short'], items=items), ensure_ascii=False)

PAGE = r'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Every question a session answers</title>
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/alpinejs@3/dist/cdn.min.js" defer></script>
<link href="https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet">
<script>window.Q = __PAYLOAD__;</script>
</head>
<body class="bg-base-200">
<div x-data="lane()" class="max-w-2xl mx-auto p-3 text-[13px] leading-none">

  <div class="flex items-center gap-2 mb-2 leading-normal">
    <span class="font-semibold">Questions</span>
    <span class="opacity-40" x-text="Q.id"></span>
    <span class="grow"></span>
    <div class="join">
      <button class="join-item btn btn-xs" :class="!led && 'btn-active'" @click="led=false"
              x-text="'all ' + Q.items.length"></button>
      <button class="join-item btn btn-xs" :class="led && 'btn-active'" @click="led=true"
              x-text="'open loops ' + Q.items.filter(i=>i.led).length"></button>
    </div>
  </div>

  <div class="bg-base-100 rounded overflow-hidden">
    <template x-for="it in rows" :key="it.i">
      <div class="flex items-center gap-2 h-7 px-2 border-l-[3px] border-b border-b-base-200"
           :class="it.led ? 'border-l-amber-400' : it.ask ? 'border-l-sky-400' : 'border-l-transparent'">
        <span class="w-3 shrink-0 text-center"
              :class="it.ask ? 'opacity-45' : 'opacity-15'" x-text="it.ask ? '?' : '·'"></span>
        <span class="grow sm:grow-0 sm:w-[44%] shrink truncate" x-text="it.q"></span>
        <span class="opacity-25 shrink-0 hidden sm:inline">→</span>
        <span class="grow truncate opacity-55 hidden sm:inline" x-text="it.o"></span>
        <span class="w-5 shrink-0 text-right tabular-nums text-amber-600"
              x-text="it.n ? '×'+it.n : ''"></span>
        <span class="w-14 shrink-0 text-right tabular-nums opacity-35" x-text="lag(it)"></span>
        <span class="w-2 shrink-0 opacity-30" x-text="it.by==='c' ? 'c' : ''"></span>
      </div>
    </template>
  </div>

  <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs opacity-40 leading-normal">
    <span>? somebody asked it</span>
    <span>· nobody asked; the session answered it anyway</span>
    <span class="text-amber-500">▌<span class="text-base-content/40">outlived its turn</span></span>
    <span>×N rounds</span>
    <span>c Claude</span>
  </div>
</div>

<script>
function lane() {
  const span = (a, b) => {
    const m = Math.round((Date.parse('2026-' + b + 'Z') - Date.parse('2026-' + a + 'Z')) / 60000);
    return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
  };
  return {
    Q: window.Q, led: false,
    get rows() { return this.led ? this.Q.items.filter(i => i.led) : this.Q.items },
    lag(it) { return span(it.at, it.at2) },
  }
}
</script>
</body></html>
'''
open(OUT, 'w').write(PAGE.replace('__PAYLOAD__', payload))
print('wrote', OUT, len(open(OUT).read()), 'bytes')
