// Idempotency guard: vanilla-bundle is now auto-loaded on every page
// and also injected into frames, so only install if not already present.
if (!window.__vanilla_bundle_loaded) {
  window.__vanilla_bundle_loaded = true

// ── select + read ──
window.ea = (sel, cb = el => el) =>
  [...document.querySelectorAll(sel)].map(cb)

window.el = new Proxy({}, { get: (_, k) => node => node[k] })

// ── id / data-ui lookup ──
const dash  = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
const camel = s => s.replace(/-+(.)/g, (_, c) => c.toUpperCase())

// ids.fooBar → getElementById('foo-bar'). Keyed, so `const { a, b } = ids` is
// order-independent. The then/symbol guard keeps the proxy await-safe.
window.ids = new Proxy({}, {
  get: (_, k) => typeof k === 'string' && k !== 'then'
    ? document.getElementById(dash(k))
    : undefined
})

// ui(root).fooBar → root.querySelector('[data-ui="foo-bar"]'). Scoped and not
// id-unique, so the same name can repeat across component instances.
window.ui = (root = document) => new Proxy({}, {
  get: (_, k) => typeof k === 'string' && k !== 'then'
    ? root.querySelector(`[data-ui="${CSS.escape(dash(k))}"]`)
    : undefined
})

// grab(root) → eager { fooBar: el } snapshot of every [id] under root.
window.grab = (root = document) => Object.fromEntries(
  [...root.querySelectorAll('[id]')].map(el => [camel(el.id), el]))

// ── esc: text on its way into markup ──
// The other half of the branded-HTML decision below. html(markup) says "this is
// markup, place it as nodes"; esc(text) says "this is text, make it inert as
// markup". Between them, every string concatenated into innerHTML has been
// through one or the other, which is what lets tpl's interpolations stay raw.
//
// ESCAPE ONLY, and all five characters, so one helper is safe in a text node
// and inside a quoted attribute alike. Escaping the quotes costs nothing in
// text (&quot; renders as ") and it retires the judgment each call site was
// otherwise making about which context its string lands in. Five local copies
// of this function were each making that judgment separately, to three
// different answers (tracker: consolidate-escape-helpers-gxverk).
//
// It does NOT decode entities first, though the rule it replaces prescribed
// exactly that. Whether a source's "&amp;" is an encoded ampersand or five
// literal characters cannot be read off the string, so a helper that decodes
// every data-derived value corrupts the second case silently. Decoding is a
// property of the SOURCE: it belongs once, at the ingestion boundary where the
// provider's behaviour is known, and it is recorded there. No source ingested
// here needs it today.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
window.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESCAPES[c])

// ── branded HTML: a string value fill places as markup, not text ──
// html(markup) tags a String wrapper with a module-local symbol. It coerces to
// its markup everywhere a string is expected (interpolation, join, innerHTML),
// so producers keep composing by concatenation; fill (below) tests the brand to
// parse and place it as nodes instead of escaping it. Producer and consumer
// share this file, so the brand is a plain local Symbol — no shared global.
const HTML = Symbol('webtools.html')
window.html = markup => {
  const h = new String(markup)
  h[HTML] = true
  return h
}

// ── html presets: daisyUI/Tailwind-configured branded values ──
// The base html() above is style-neutral plumbing; these methods are not — they
// emit daisyUI/Tailwind class strings, so the host page must load that CSS. Each
// hangs off window.html and mints a branded value via html(), so html('<raw>')
// and html.tip(...) yield the same kind of thing. `mods` is an array of short
// tokens (e.g. ['xs','bottom']); recognized tokens map to classes, the rest are
// ignored — pass [] for defaults. For Alpine-flavored decorators that wire
// behavior instead of returning fragments, see x-tip/x-lines/x-btn/x-toolbar in
// alpine-bundle.js.
const sz  = mods => ['xs', 'sm', 'md', 'lg', 'xl'].find(s => mods.includes(s))
const pos = mods => ['top', 'bottom', 'left', 'right'].find(p => mods.includes(p)) || 'bottom'
const gap = mods => ['gap-0', 'gap-1', 'gap-2', 'gap-3', 'gap-4'].find(g => mods.includes(g)) || 'gap-0'

const txt = mods => [
  sz(mods) && `text-${sz(mods)}`,
  ['left', 'center', 'right'].find(a => mods.includes(a)) && `text-${['left', 'center', 'right'].find(a => mods.includes(a))}`,
  mods.includes('bold')     && 'font-bold',
  mods.includes('semibold') && 'font-semibold',
  mods.includes('italic')   && 'italic',
  mods.includes('mono')     && 'font-mono',
  mods.includes('muted')    && 'opacity-60'
].filter(Boolean).join(' ')

// Single daisyUI button. Markup only — wire behavior separately.
window.html.btn = (mods, label) => {
  const variant = ['primary','secondary','accent','info','success','warning','error',
    'ghost','outline','soft','neutral'].find(v => mods.includes(v))
  const classes = ['btn', sz(mods) && `btn-${sz(mods)}`, variant && `btn-${variant}`]
    .filter(Boolean).join(' ')
  return window.html(`<button class="${classes}">${label}</button>`)
}

// daisyUI tooltip with a custom rich content body.
window.html.tip = (mods, trigger, content) => {
  const cls = ['tooltip-content bg-base-100 text-base-content border border-base-300 rounded-box shadow-lg p-3 text-left',
    txt(mods) || 'text-xs'].filter(Boolean).join(' ')
  return window.html(`<div class="tooltip tooltip-${pos(mods)}"><div class="${cls}">${content}</div>${trigger}</div>`)
}

// Stacked column of single-line items.
window.html.lines = (mods, arr) => {
  const cls = ['flex flex-col', gap(mods), txt(mods)].filter(Boolean).join(' ')
  return window.html(`<div class="${cls}">${arr.map(s => `<div>${s}</div>`).join('')}</div>`)
}

// Horizontal toolbar wrapper. `mods` reserved for future use.
window.html.toolbar = (mods, ...items) =>
  window.html(`<div class="flex gap-2 items-center justify-between mb-2">${items.join('')}</div>`)

// Full-screen modal. Caller provides the inner box content.
window.html.modal = (inner) => window.html(`
  <dialog class="modal">
    <div class="modal-box w-full max-w-[95%] h-[80vh] p-0 shadow-lg flex flex-col overflow-hidden rounded-lg">
      ${inner}
    </div>
    <form method="dialog" class="modal-backdrop"><button>close</button></form>
  </dialog>`)

// ── structural write ──
// function → run, array → run each on the matched el, branded HTML → parse +
// place as nodes, object → assign, else → text
window.fill = (root, spec) =>
  Object.entries(spec).forEach(([sel, v]) =>
    root.querySelectorAll(sel).forEach(
      typeof v === 'function' ? v
      : Array.isArray(v)      ? el => v.forEach(f => f(el))
      : v?.[HTML]             ? el => el.replaceChildren(node('' + v))
      : typeof v === 'object' ? el => Object.assign(el, v)
      : el => el.textContent = v))

// ── callback helpers: the non-property writes ──
window.attr   = (k, v)  => el => (el.setAttribute(k, v), el)
window.cls    = (k, on) => el => (el.classList.toggle(k, on), el)
window.listen = (ev, f) => el => (el.addEventListener(ev, f), el)
window.data   = obj     => el => (Object.assign(el.dataset, obj), el)

// ── tpl: build rows into markup, then place ──
// Bare tpl`…`(rows)(el) parses the markup and replaceChildren's it — the
// superset placement, preserving context-sensitive nodes (<tr>, <option>) that
// bare innerHTML would drop. .append / .prepend are the other two placements.
// Scope is element containers; for a raw-text target (textarea/style/title) set
// text via fill or .value/.textContent. Interpolations are raw: the caller
// escapes, with esc() above.
const node = h => {
  const t = document.createElement('template')
  t.innerHTML = h
  return t.content
}
const build = (strings, ...fns) => rows =>
  rows.map(row => strings.reduce((s, seg, i) =>
    s + seg + (typeof fns[i] === 'function' ? fns[i](row) : fns[i] ?? ''), '')).join('')

const verb = method => (...a) => rows => el => el[method](node(build(...a)(rows)))
window.tpl = verb('replaceChildren')
window.tpl.append  = verb('append')
window.tpl.prepend = verb('prepend')

// ── events ──
window.on = (root, type, fn) =>
  (root.addEventListener(type, fn), root)

window.route = (root, type, routes) =>
  on(root, type, e => {
    for (const [sel, fn] of Object.entries(routes)) {
      const match = e.target.closest(sel)
      if (match) return fn(e, match)
    }
  })

// ── clipboard ──
// Stringify value, attempt write via clipboard API with focus-retry fallback,
// then log and return so the value lands in the debugConsole. Falls back to
// textarea+execCommand when the API is unavailable or denied.
window.copy = (v) => {
  const text = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  const fallback = () => {
    const t = Object.assign(document.createElement('textarea'), {
      value: text,
      readOnly: true,
      className: 'absolute w-0 h-0 opacity-0'
    })
    document.body.appendChild(t)
    t.select()
    document.execCommand('copy')
    t.remove()
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => { console.log(text); return text })
      .catch(e => {
        if (e.name === 'NotAllowedError') {
          window.addEventListener('focus', () => {
            navigator.clipboard.writeText(text).catch(() => {})
          }, { once: true })
        }
        fallback()
      })
  } else {
    fallback()
  }
  console.log(text)
  return text
}
}
