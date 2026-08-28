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

# question, and whether its answer is a no or a not-yet
Q = [
 ('Did the back-out and the merge both happen?',            False),
 ('Is Ask Grok gone everywhere it was?',                    False),
 ('Did anything from that work survive?',                   False),
 ('What went into the merge?',                              False),
 ('Does --publish remove a mirror whose chain is gone?',    True),
 ('Does the phone need anything?',                          False),
 (None,                                                     False),   # the links P6 promised
 ('Where does the branch stand?',                           False),
]

def fmt(p):
    p = html.escape(p)
    p = re.sub(r'\[([^\]]+)\]\((?:[^)]+)\)', r'<u>\1</u>', p)
    p = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', p)
    p = re.sub(r'`([^`]+)`', r'<code class="bg-base-200 px-1 rounded">\1</code>', p)
    return p.replace('\n', '<br>')

rows = [dict(q=q, flag=f, html=fmt(p)) for p, (q, f) in zip(paras, Q)]
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
<div x-data="{ R: window.R, only: false }" class="max-w-3xl mx-auto p-4 text-sm">

  <div class="flex items-baseline gap-2 mb-1">
    <span class="font-semibold">One reply, one question a paragraph</span>
    <span class="opacity-40 text-xs tabular-nums"
          x-text="R.at.slice(5,16).replace('T',' ') + ' · ' + R.chars + ' chars'"></span>
    <span class="grow"></span>
    <label class="label cursor-pointer gap-2 text-xs">
      <input type="checkbox" class="toggle toggle-xs" x-model="only">
      <span class="opacity-60">margin only</span>
    </label>
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
             x-show="!only" x-html="r.html"></div>
      </div>
    </template>
  </div>

  <p class="text-xs opacity-40 mt-3 leading-relaxed">
    Rows are ragged on purpose: this is a reading view, not the scannable list.
    The margin is the index; the prose is unchanged. Toggle to read the margin
    alone and the reply becomes seven lines.
  </p>
</div>
</body></html>
'''
open(OUT, 'w').write(PAGE.replace('__PAYLOAD__', payload))
print('wrote', OUT, len(open(OUT).read()), 'bytes')
