#!/usr/bin/env python3
"""Emit dump/2026-08-28-question-margin.html.

One reply, paragraph by paragraph, with the question each paragraph answers in
the margin. The reply is the real 3,012-character wrap-up from session
d0aaedcc, chosen because we know what it cost: its fifth paragraph discloses a
defect nobody fixed, and it went unread for 12h37m until the user re-read the
reply by hand. So this is a test with a known answer.

Text is read from the record; the questions are authored.
"""
import json, re, html

REC = '/home/user/web-tools-private/sessions/2026/08/2026-08-26-d0aaedcc.json'
OUT = '/home/user/web-tools/dump/2026-08-28-question-margin.html'

d = json.load(open(REC))
reply = next(r for r in d['replies'] if r['at'].startswith('2026-08-27T02:50:09'))
paras = [p.strip() for p in reply['text'].split('\n\n') if p.strip()]

# question, the answer in one line, and whether that answer is a no or a not-yet
Q = [
 ('Did the back-out and the merge both happen?', 'both, in that order',                    False),
 ('Is Ask Grok gone everywhere it was?',         'chain, README row, both mirrors, PR closed', False),
 ('Did anything from that work survive?',        'a note on why it could not be built blind', False),
 ('What went into the merge?',                   '#22 at 5d2f5f3: five fixes, 221 tests',   False),
 ('Does --publish remove a mirror whose chain is gone?', 'no, and I left it unfixed',       True),
 ('Does the phone need anything?',               'two installs, when convenient',           False),
 (None,                                          None,                                      False),
 ('Where does the branch stand?',                'merged',                                  False),
]

def fmt(p):
    p = html.escape(p)
    p = re.sub(r'\[([^\]]+)\]\((?:[^)]+)\)', r'<u>\1</u>', p)
    p = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', p)
    p = re.sub(r'`([^`]+)`', r'<code class="bg-base-200 px-1 rounded">\1</code>', p)
    return p.replace('\n', '<br>')

rows = [dict(q=q, a=a, flag=f, html=fmt(p)) for p, (q, a, f) in zip(paras, Q)]
payload = json.dumps(dict(at=reply['at'], chars=len(reply['text']), rows=rows), ensure_ascii=False)

PAGE = r'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>The question each paragraph answers</title>
<script src="https://cdn.jsdelivr.net/combine/npm/@tailwindcss/browser@4,npm/alpinejs@3/dist/cdn.min.js" defer></script>
<link href="https://cdn.jsdelivr.net/combine/npm/daisyui@5/themes.css,npm/daisyui@5" rel="stylesheet">
<script>window.R = __PAYLOAD__;</script>
</head>
<body class="bg-base-200">
<div x-data="{ R: window.R, mode: 'prose' }" class="max-w-3xl mx-auto p-4 text-sm">

  <div class="flex items-baseline gap-2 mb-1">
    <span class="font-semibold">One reply, one question a paragraph</span>
    <span class="opacity-40 text-xs tabular-nums"
          x-text="R.at.slice(5,16).replace('T',' ') + ' · ' + R.chars + ' chars'"></span>
    <span class="grow"></span>
    <div class="join">
      <template x-for="m in ['prose','answers','questions']" :key="m">
        <button class="join-item btn btn-xs" :class="mode===m && 'btn-active'"
                @click="mode=m" x-text="m"></button>
      </template>
    </div>
  </div>
  <p class="text-xs opacity-40 mb-3">
    Written as one block of prose. The fifth question is the one that cost 12h37m.
  </p>

  <div class="bg-base-100 rounded p-4">
    <template x-for="(r, i) in R.rows" :key="i">
      <div class="flex gap-4 py-2" :class="i && 'border-t border-base-200'">
        <div class="w-[38%] shrink-0 text-right leading-snug"
             :class="r.flag ? 'text-amber-600 font-medium' : 'opacity-45'">
          <span x-text="r.q || ''"></span>
        </div>
        <div class="grow leading-relaxed" :class="r.flag && 'text-amber-900'"
             x-show="mode==='prose'" x-html="r.html"></div>
        <div class="grow leading-snug" :class="r.flag ? 'text-amber-700' : 'opacity-70'"
             x-show="mode==='answers'" x-text="r.a || ''"></div>
      </div>
    </template>
  </div>

  <p class="text-xs opacity-40 mt-3 leading-relaxed">
    Three readings of one reply. <strong>Prose</strong> leaves it untouched and
    puts the index beside it. <strong>Answers</strong> keeps the shape and drops
    the argument. <strong>Questions</strong> is what the reply was for. The rows
    are ragged on purpose: this is a reading view, not the scannable list.
  </p>
</div>
</body></html>
'''
open(OUT, 'w').write(PAGE.replace('__PAYLOAD__', payload))
print('wrote', OUT, len(open(OUT).read()), 'bytes')
