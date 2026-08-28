#!/usr/bin/env python3
"""Emit dump/2026-08-28-question-lane.html: the discussion lane read from the real
record, the question lane hand-authored to show what an ideal inventory holds."""
import json, re, html, sys

REC = '/home/user/web-tools-private/sessions/2026/08/2026-08-26-d0aaedcc.json'
OUT = '/home/user/web-tools/dump/2026-08-28-question-lane.html'
NOT_HUMAN = re.compile(r'^(Base directory for this skill:|Stop hook feedback:)')

d = json.load(open(REC))
ev = []
for p in d['prompts']:
    ev.append(('X' if NOT_HUMAN.match(p['text'].lstrip()[:60]) else 'U', p['at'], p['text']))
for r in d['replies']: ev.append(('A', r['at'], r['text']))
for c in d.get('calls', []): ev.append(('T', c['at'], c['name']))
ev.sort(key=lambda e: e[1])

ex, cur = [], None
for k, at, t in ev:
    if k == 'U':
        if cur: ex.append(cur)
        cur = {'at': at, 'ask': ' '.join(t.split()), 'replies': [], 'calls': 0}
    elif cur is None: continue
    elif k == 'A': cur['replies'].append({'at': at, 'text': ' '.join(t.split())})
    elif k == 'T': cur['calls'] += 1
if cur: ex.append(cur)
for i, e in enumerate(ex, 1):
    e['n'] = i
    e['nr'] = len(e['replies']); del e['replies']
    if len(e['ask']) > 220: e['ask'] = e['ask'][:220]

# ── the inventory, hand-authored ───────────────────────────────────────────
# found: 'scan' = the regex extractor caught it; 'read' = only a model read finds it
I = [
 dict(n=1,  at='08-26T03:00', by='user', ex=1, kind='question', found='scan',
      text='Did the double-back-tap revision land in an earlier session?',
      status='answered', at2='08-26T03:02', ex2=1,
      note='Verbatim carried three question marks for one ask.'),
 dict(n=2,  at='08-26T04:23', by='user', ex=2, kind='decision', found='scan',
      text='How should we proceed?', status='answered', at2='08-26T04:25', ex2=2),
 dict(n=3,  at='08-26T04:42', by='user', ex=4, kind='question', found='scan',
      text='Did the probes I ran return what you needed?',
      status='answered', at2='08-26T04:44', ex2=4),
 dict(n=4,  at='08-26T04:49', by='user', ex=5, kind='standing', found='read',
      text='Shortcut prompts should carry their own guidance, so I never have to arrive knowing what to do.',
      status='adopted', at2='08-26T04:56', ex2=5,
      note='A standing instruction inside an otherwise procedural reply. No question mark anywhere.'),
 dict(n=5,  at='08-26T04:49', by='user', ex=5, kind='question', found='read',
      text='Does a shortcut-testing skill exist, and does it say this?',
      verbatim='(Our shortcut testing skill should mention this succinctly if it doesn’t, assuming we have one)',
      status='answered', at2='08-26T04:56', ex2=5,
      note='Parenthetical, conditional, no question mark. The live session caught it; the scan does not.'),
 dict(n=6,  at='08-26T05:04', by='user', ex=6, kind='defect', found='read',
      text='Library-Replace was not found on the first install link.',
      status='fixed', at2='08-26T05:12', ex2=7),
 dict(n=7,  at='08-26T05:12', by='user', ex=7, kind='question', found='scan',
      text='The double-tap shortcut did not get the list treatment, did it?',
      status='answered', at2='08-26T05:14', ex2=7),
 dict(n=8,  at='08-26T05:43', by='claude', ex=9, kind='decision', found='scan',
      text='Which shortcut should the chunk target?',
      status='answered', at2='08-26T05:52', ex2=10),
 dict(n=9,  at='08-26T05:52', by='user', ex=10, kind='request', found='scan',
      text='Give me a clipboard link for the if-app-is-Shortcuts chunk.',
      status='delivered', at2='08-26T05:55', ex2=10),
 dict(n=10, at='08-26T06:06', by='user', ex=11, kind='defect', found='scan',
      text='Get-FileInfo’s caption breaks when Get File Info processed a list.',
      verbatim='Do you see that?',
      status='confirmed → fixed', at2='08-26T06:11', ex2=12,
      note='The scan row reads "Do you see that?" and names nothing. The subject sits in the sentence before it.'),
 dict(n=11, at='08-26T06:08', by='claude', ex=11, kind='confirm', found='scan',
      text='Should the fix go on this branch, in web-tools-private?',
      status='answered', at2='08-26T06:11', ex2=12),
 dict(n=12, at='08-26T12:42', by='user', ex=14, kind='request', found='scan',
      text='Make a simpler one-shortcut version of Get File Info.',
      status='delivered', at2='08-26T12:58', ex2=14),
 dict(n=13, at='08-26T13:03', by='user', ex=15, kind='question', found='scan',
      text='What is the minimum way to collapse the combining text cards into one?',
      status='answered', at2='08-26T13:08', ex2=15),
 dict(n=14, at='08-26T13:11', by='user', ex=16, kind='question', found='scan',
      text='Do we have the latest SURFACING.md?',
      status='answered', at2='08-26T13:14', ex2=16),
 dict(n=15, at='08-26T13:23', by='user', ex=17, kind='critique', found='read',
      text='Greens were telling me what to do, which misuses green. Orange should mean a decision is needed from me, and there is a missing state for "you should investigate this yourself."',
      status='resolved → ❇️ and ✴️ added, PR #514', at2='08-26T14:06', ex2=20,
      note='The largest item in the session and it carries no question mark. A critique that turned into a documentation change.'),
 dict(n=16, at='08-26T13:58', by='user', ex=18, kind='proposal', found='read',
      text='Which orange glyph should mark "needs you"? Five candidates offered.',
      status='resolved → ✴️ chosen', at2='08-26T14:06', ex2=20),
 dict(n=17, at='08-26T14:02', by='user', ex=19, kind='correction', found='read',
      text='You overlooked that colour coding is the point here.',
      status='accepted', at2='08-26T14:06', ex2=20,
      note='A correction of the previous answer. Not a question by any test, and the item most worth surfacing.'),
 dict(n=18, at='08-26T18:35', by='user', ex=22, kind='audit', found='scan',
      text='Did you update the surfacing documentation?',
      status='answered: yes, on a branch', at2='08-26T18:37', ex2=22,
      note='The user auditing item 15 five hours later. A live inventory answers this without a turn.'),
 dict(n=19, at='08-26T19:46', by='user', ex=23, kind='re-entry', found='scan',
      text='Where did we leave the shortcuts work?',
      status='answered', at2='08-26T19:48', ex2=23,
      note='A re-entry ask. Its answer is exactly this inventory.'),
 dict(n=20, at='08-26T19:53', by='user', ex=24, kind='correction', found='read',
      text='Use the Show Web View sheet action, not Show HTML in Safari, so the flow stays inside the shortcut.',
      status='done', at2='08-26T20:30', ex2=25,
      note='Restated once at 20:10 because the first reply reached for Quick View instead.'),
 dict(n=21, at='08-26T21:57', by='user', ex=28, kind='request', found='read',
      text='Run whatever other test exists around the microphone.',
      status='done', at2='08-26T22:05', ex2=29),
 dict(n=22, at='08-26T22:05', by='user', ex=29, kind='correction', found='read',
      text='Copy reportedly failed, but we have made copy work; see the show-recentshortcuts page.',
      status='investigated', at2='08-26T22:14', ex2=30),
 dict(n=23, at='08-27T01:45', by='user', ex=32, kind='request', found='scan',
      text='Update the dictate page to call this new shortcut on selected text.',
      status='delivered → backed out', at2='08-27T02:50', ex2=34,
      note='Superseded by item 24’s sibling: the Ask-Grok chain was withdrawn.'),
 dict(n=24, at='08-27T02:11', by='user', ex=33, kind='question', found='scan',
      text='Is the menu supposed to be working?',
      status='answered: no, back it out', at2='08-27T02:50', ex2=34),
 dict(n=25, at='08-27T02:50', by='claude', ex=34, kind='defect', found='read', flag=True,
      text='Neither pack.py --publish nor plist.py --publish removes a mirror whose chain is gone, so an orphaned artifact keeps serving a withdrawn link.',
      verbatim='One thing I noticed while pruning and did not fix: …',
      status='open 12h 37m → resolved', at2='08-27T15:34', ex2=35,
      note='Raised by Claude, mid-paragraph, inside a 3,005-character wrap-up reply. No question mark, no heading, no closing-state marker. The user had to re-read the reply the next day to find it.'),
 dict(n=26, at='08-27T15:26', by='user', ex=35, kind='reopen', found='scan',
      text='Assess and resolve the pruning note you said you did not fix.',
      verbatim='Is it something you can assess further and possibly resolve?',
      status='resolved', at2='08-27T15:34', ex2=35,
      note='This whole exchange exists only because item 25 had nowhere to be listed.'),
 dict(n=27, at='08-27T15:43', by='user', ex=36, kind='question', found='scan',
      text='Loose ends, or is this a good place to wrap and merge?',
      status='answered', at2='08-27T15:48', ex2=36),
 dict(n=28, at='08-27T16:19', by='user', ex=37, kind='question', found='scan',
      text='Is there a reason not to ship #514?',
      status='answered', at2='08-27T16:25', ex2=37),
]

FP = [
 dict(q='what do they call it?', why='A spoken aside mid-sentence ("the … what do they call it? the web view"). Dictation artifact.'),
 dict(q='Worth knowing before you tap: this overwrites the edit you made by hand.', why='Matched the no-question-mark rule on "worth knowing". It is a statement.'),
 dict(q='I think that’s good for that one for now?', why='An upward inflection on a decision already made, not an open ask.'),
]

meta = dict(
  id=d['short'], day=d['day'], started=d['started'], ended=d['ended'],
  prompts=len(d['prompts']), replies=len(d['replies']), calls=d.get('calls_total', 0),
  exchanges=len(ex), agent=d.get('agent_session', ''),
  opening=d.get('opening_ask', '')[:160],
)
payload = json.dumps(dict(meta=meta, ex=ex, inv=I, fp=FP), ensure_ascii=False)

PAGE = r'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Question lane &mdash; a parallel view of one session</title>
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/@phosphor-icons/web,npm/alpinejs@3/dist/cdn.min.js" defer></script>
<link href="https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet">
<script>window.DATA = __PAYLOAD__;</script>
</head>
<body class="bg-base-200 text-base-content">
<div x-data="lane()" class="max-w-[1500px] mx-auto p-3 sm:p-5">

  <header class="mb-4">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 class="text-xl font-semibold">Question lane</h1>
      <span class="opacity-60 text-sm">a parallel view of session <code x-text="D.meta.id"></code></span>
    </div>
    <p class="text-sm opacity-70 mt-1" x-text="D.meta.opening + '…'"></p>
    <div class="stats stats-horizontal shadow-sm bg-base-100 mt-3 w-full overflow-x-auto">
      <div class="stat py-2 px-4"><div class="stat-title text-xs">exchanges</div><div class="stat-value text-xl" x-text="D.meta.exchanges"></div></div>
      <div class="stat py-2 px-4"><div class="stat-title text-xs">replies</div><div class="stat-value text-xl" x-text="D.meta.replies"></div></div>
      <div class="stat py-2 px-4"><div class="stat-title text-xs">tool calls</div><div class="stat-value text-xl" x-text="D.meta.calls"></div></div>
      <div class="stat py-2 px-4"><div class="stat-title text-xs">items</div><div class="stat-value text-xl text-primary" x-text="D.inv.length"></div></div>
      <div class="stat py-2 px-4"><div class="stat-title text-xs">found by regex</div><div class="stat-value text-xl" x-text="nScan"></div></div>
      <div class="stat py-2 px-4"><div class="stat-title text-xs">needs a read</div><div class="stat-value text-xl text-warning" x-text="nRead"></div></div>
    </div>
  </header>

  <div class="flex flex-wrap gap-2 items-center mb-3">
    <div class="join">
      <button class="join-item btn btn-sm" :class="filter==='all'&&'btn-active btn-primary'" @click="filter='all'">All</button>
      <button class="join-item btn btn-sm" :class="filter==='read'&&'btn-active btn-primary'" @click="filter='read'">Only a read finds these</button>
      <button class="join-item btn btn-sm" :class="filter==='claude'&&'btn-active btn-primary'" @click="filter='claude'">Claude raised</button>
    </div>
    <label class="label cursor-pointer gap-2 text-sm">
      <input type="checkbox" class="toggle toggle-sm" x-model="showVerbatim">
      <span class="opacity-70">show the words as spoken</span>
    </label>
    <span class="grow"></span>
    <button class="btn btn-sm btn-ghost" @click="sel=null">clear</button>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4">

    <!-- discussion lane -->
    <section>
      <h2 class="text-sm uppercase tracking-wide opacity-60 mb-2">The discussion</h2>
      <div class="bg-base-100 rounded-box p-1 max-h-[70vh] overflow-y-auto">
        <template x-for="e in D.ex" :key="e.n">
          <div :id="'ex'+e.n" class="border-l-4 px-3 py-2 my-0.5 rounded-r transition"
               :class="lit(e.n) ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-base-200'">
            <div class="flex items-baseline gap-2">
              <span class="badge badge-xs badge-ghost font-mono" x-text="e.n"></span>
              <span class="font-mono text-xs opacity-50" x-text="e.at.slice(5,16)"></span>
              <template x-for="it in itemsAt(e.n)" :key="it.n">
                <span class="badge badge-xs cursor-pointer" :class="badge(it)"
                      @click="sel = sel===it.n ? null : it.n" x-text="'#'+it.n"></span>
              </template>
              <span class="grow"></span>
              <span class="text-xs opacity-40" x-show="e.calls" x-text="e.calls+' calls'"></span>
            </div>
            <p class="text-sm mt-1 leading-snug" x-text="e.ask.slice(0,190) + (e.ask.length>190?'…':'')"></p>
          </div>
        </template>
      </div>
    </section>

    <!-- question lane -->
    <section>
      <h2 class="text-sm uppercase tracking-wide opacity-60 mb-2">
        The inventory <span class="opacity-50 normal-case" x-text="'('+shown.length+' of '+D.inv.length+')'"></span>
      </h2>
      <div class="bg-base-100 rounded-box p-1 max-h-[70vh] overflow-y-auto">
        <template x-for="it in shown" :key="it.n">
          <div class="px-3 py-2 my-0.5 rounded cursor-pointer transition border-l-4"
               :class="sel===it.n ? 'border-primary bg-primary/10' : (it.flag ? 'border-warning/60 hover:bg-base-200' : 'border-transparent hover:bg-base-200')"
               @click="pick(it.n)">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="badge badge-xs font-mono" :class="badge(it)" x-text="'#'+it.n"></span>
              <span class="badge badge-xs badge-outline" x-text="it.kind"></span>
              <span class="text-xs font-mono opacity-50" x-text="it.at.slice(0,11)"></span>
              <span class="text-xs opacity-60" x-text="it.by==='claude' ? 'Claude asked' : ''"></span>
              <span class="grow"></span>
              <span class="badge badge-xs"
                    :class="it.flag ? 'badge-warning' : (it.found==='read' ? 'badge-ghost' : 'badge-ghost opacity-50')"
                    x-text="it.found==='read' ? 'needs a read' : 'regex'"></span>
            </div>
            <p class="text-sm mt-1 leading-snug" x-text="it.text"></p>
            <p class="text-xs mt-1 font-mono opacity-50 italic" x-show="showVerbatim && it.verbatim"
               x-text="'as spoken: “' + (it.verbatim||'') + '”'"></p>
            <div class="flex items-center gap-2 mt-1.5 text-xs">
              <span class="opacity-70" x-text="it.status"></span>
              <span class="opacity-40" x-show="it.at2" x-text="'→ ' + it.at2"></span>
            </div>
            <p class="text-xs mt-1.5 opacity-70 leading-snug border-l-2 border-base-300 pl-2"
               x-show="sel===it.n && it.note" x-text="it.note"></p>
          </div>
        </template>
      </div>
    </section>
  </div>

  <!-- what the scan got wrong -->
  <section class="mt-5">
    <h2 class="text-sm uppercase tracking-wide opacity-60 mb-2">What the regex found that is not an item</h2>
    <div class="bg-base-100 rounded-box p-3 space-y-2">
      <template x-for="f in D.fp" :key="f.q">
        <div class="text-sm">
          <span class="font-mono text-error/80" x-text="'“'+f.q+'”'"></span>
          <span class="opacity-60" x-text="' · ' + f.why"></span>
        </div>
      </template>
    </div>
  </section>

  <p class="text-xs opacity-50 mt-5 leading-relaxed">
    The discussion lane is read from the record at
    <code>sessions/2026/08/2026-08-26-d0aaedcc.json</code> in web-tools-private.
    The inventory lane is hand-authored, to show what a complete one holds; the
    <em>regex</em> / <em>needs a read</em> chip on each row says which half a
    mechanical extractor would have produced on its own.
  </p>
</div>

<script>
function lane() {
  return {
    D: window.DATA, sel: null, filter: 'all', showVerbatim: false,
    get nScan() { return this.D.inv.filter(i => i.found === 'scan').length },
    get nRead() { return this.D.inv.filter(i => i.found === 'read').length },
    get shown() {
      const f = this.filter;
      return this.D.inv.filter(i =>
        f === 'all' ? true : f === 'read' ? i.found === 'read' : i.by === 'claude');
    },
    itemsAt(n) { return this.D.inv.filter(i => i.ex === n || i.ex2 === n) },
    pick(n) {
      this.sel = this.sel === n ? null : n;
      if (this.sel == null) return;
      const it = this.D.inv.find(i => i.n === n);
      this.$nextTick(() => {
        const el = document.getElementById('ex' + it.ex);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    },
    lit(n) {
      if (this.sel == null) return false;
      const it = this.D.inv.find(i => i.n === this.sel);
      return it && (it.ex === n || it.ex2 === n);
    },
    badge(it) {
      if (it.flag) return 'badge-warning';
      if (it.by === 'claude') return 'badge-secondary';
      return { correction: 'badge-error', critique: 'badge-error', defect: 'badge-error',
               reopen: 'badge-warning' }[it.kind] || 'badge-primary';
    },
  }
}
</script>
</body></html>
'''
open(OUT, 'w').write(PAGE.replace('__PAYLOAD__', payload))
print('wrote', OUT, len(open(OUT).read()), 'bytes')
