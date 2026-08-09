// vanilla-demo.js — the living-documentation demo format, distilled from
// pages/drop/live-docs-concept.html. A page hands it a `sections` config; it
// renders the whole literate document: numbered sections, each holding compact
// examples that pair prose with an editable snippet and a live proof (rendered
// markup, markup in a host context, JS drawing into a frame, or console output).
//
// Sibling to vanilla-bundle.js: a framework-free, DOM-rendering module loaded
// via gh.load. Not a logic kit (it renders), not an Alpine component (no
// framework). Depends on kits/cm6.js for the editor and kits/proof.js for
// the sandboxed proof documents (load both before this file), and on
// Tailwind + daisyUI + Phosphor being present on the host page for styling.
// The proof iframes are isolated (sandbox allow-scripts, opaque origin) and
// bring their own minimal CSS — plus Tailwind (`tw:true`), the full daisyUI
// stack (`daisy:true`), and any `inject` scripts a block opts into. The
// `parent` kind is the deliberate exception: it runs in the host page,
// unsandboxed.
//
//   demo.mount({ sections, sectionsEl, displayEl?, legendEl?, base? })
//
//   base — URL prefix that repo-relative `inject` paths resolve against, so
//          injected <script src> honor the page's ?use=<ref> (e.g.
//          'https://cdn.jsdelivr.net/gh/owner/repo@<ref>'). Absolute http(s)
//          inject entries are used verbatim.
//
// Config shape:
//   sections: [{ title, intro?, examples: [example] }]
//   example:  { title, prose?, lang: 'html'|'js', code,
//               kind: 'render'|'context'|'jsrender'|'console'|'parent',
//               tw?: bool,        // inject Tailwind into the proof frame
//               daisy?: bool,     // inject Tailwind + daisyUI + Phosphor (implies tw)
//               inject?: string[],// <script src> loaded into the frame head, in order
//               context?: string  // host template with a {{slot}} marker (kind:'context')
//             }
//
// The five kinds:
//   render    — the snippet is body markup; the proof is what it renders.
//   context   — the snippet is injected at {{slot}} inside a host template.
//   jsrender  — the snippet is JS that builds nodes into the frame body.
//   console   — the snippet is JS run in a sandboxed frame; the proof is
//                captured console output (Run / Mod-Enter). Wrapped in an async
//                IIFE, so it can `await` and use any injected globals.
//   parent    — the snippet is JS run in the HOST page (not isolated), for code
//                that needs real storage, downloads, the clipboard, or the
//                page's already-loaded kits. Runs only on Run / Mod-Enter,
//                never on edit, so file dialogs don't fire while you type.

(() => {
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k);
    return n;
  };
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
  const ser = a => { try { return a instanceof Error ? a.message : typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return String(a); } };
  const copyText = async t => {
    try { await navigator.clipboard.writeText(t); }
    catch { const ta = h('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); try { document.execCommand('copy'); } finally { ta.remove(); } }
  };

  // ── shared editor settings, applied across every block via the Display control ──
  const settings = { size: 13, nums: false, wrap: true };
  const editors = [];
  const editorHosts = [];   // inline block hosts, checked once by the load fail-safe
  const loadIndicators = []; // per-host loading spinners, live-updated from cm6.loadStatus()
  const applyTo = ed => { ed.setFontSize(settings.size); ed.setLineNumbers(settings.nums); ed.setWrap(settings.wrap); };
  const applySettings = () => editors.forEach(applyTo);

  // ── isolated proof documents — built by kits/proof.js ──
  // `base` (set by mount) prefixes repo-relative inject paths so injected
  // <script src> load from the same ?use=<ref> as the host page. Read at
  // call time: mount() sets it before any block builds a doc.
  let base = '';

  const PROOF_META = {
    render:   { label: 'Render',           icon: 'ph-eye' },
    context:  { label: 'Render · context', icon: 'ph-frame-corners' },
    jsrender: { label: 'Render · JS',      icon: 'ph-chart-bar' },
    console:  { label: 'Console',          icon: 'ph-terminal-window' },
    parent:   { label: 'Console · host',   icon: 'ph-browsers' },
  };

  const iconBtn = (icon, label, onClick, accent = false) => {
    const b = h('button', { class: `btn btn-ghost btn-xs gap-1 font-mono text-[10px] ${accent ? 'text-base-content' : 'opacity-50 hover:opacity-100'}` });
    const ic = h('i', { class: `ph ${icon} text-[13px]` });
    const tx = h('span', {}, label);
    b.append(ic, tx);
    b.addEventListener('click', () => onClick({ ic, tx }));
    return b;
  };

  const copyBtn = getText => iconBtn('ph-copy', 'Copy', async ({ ic, tx }) => {
    await copyText(getText());
    ic.className = 'ph ph-check text-[13px]'; tx.textContent = 'Copied';
    setTimeout(() => { ic.className = 'ph ph-copy text-[13px]'; tx.textContent = 'Copy'; }, 1300);
  });

  // ── Display control: a small popover that drives every editor at once ──
  function buildDisplayControl(mount) {
    const wrap = h('div', { class: 'fixed top-3 right-4 z-50 pointer-events-auto' });
    const btn = h('button', { class: 'btn btn-sm btn-ghost gap-1.5 font-mono text-[10px] tracking-widest uppercase bg-base-100/80 backdrop-blur-md border border-base-300 shadow-sm' },
      h('i', { class: 'ph ph-text-aa text-[13px]' }), h('span', {}, 'Display'));
    const pop = h('div', { class: 'absolute right-0 top-full mt-1 z-50 w-52 rounded-box bg-base-100 border border-base-300 shadow-lg p-3 hidden' });

    pop.append(h('p', { class: 'font-mono text-[9px] tracking-widest uppercase opacity-40 mb-2' }, 'All editors'));
    const row = (label, ctrl) => h('div', { class: 'flex items-center justify-between gap-3 py-1' },
      h('span', { class: 'text-[11px] opacity-70' }, label), ctrl);

    const sizes = [11, 13, 15];
    const seg = h('div', { class: 'join' });
    const segBtns = sizes.map(s => {
      const b = h('button', {}, String(s));
      b.addEventListener('click', () => { settings.size = s; applySettings(); paintSeg(); });
      seg.append(b); return [s, b];
    });
    const paintSeg = () => segBtns.forEach(([s, b]) =>
      b.className = 'btn btn-xs join-item font-mono ' + (s === settings.size ? 'btn-neutral' : 'btn-ghost'));
    paintSeg();

    const toggle = (get, set) => {
      const t = h('input', { type: 'checkbox', class: 'toggle toggle-sm' });
      t.checked = get();
      t.addEventListener('change', () => { set(t.checked); applySettings(); });
      return t;
    };

    pop.append(
      row('Code size', seg),
      h('div', { class: 'h-px bg-base-300 my-1.5' }),
      row('Line numbers', toggle(() => settings.nums, v => settings.nums = v)),
      row('Wrap lines', toggle(() => settings.wrap, v => settings.wrap = v)),
    );

    btn.addEventListener('click', e => { e.stopPropagation(); pop.classList.toggle('hidden'); });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) pop.classList.add('hidden'); });

    wrap.append(btn, pop);
    mount.append(wrap);
  }

  // ── host-template dialog (kind:'context') — read-only CM6 view of the harness ──
  function buildHostDialog(context) {
    const dlg = h('dialog', { class: 'modal' });
    const closeBtn = h('button', { class: 'btn btn-ghost btn-xs btn-circle' }, h('i', { class: 'ph ph-x text-[14px]' }));
    const head = h('div', { class: 'flex items-center justify-between px-3 py-2 border-b border-base-300 sticky top-0 bg-base-100 z-10' },
      h('div', { class: 'flex items-center gap-2' },
        h('i', { class: 'ph ph-frame-corners text-[14px] opacity-60' }),
        h('span', { class: 'font-mono text-[10px] tracking-widest uppercase opacity-60' }, 'Host template')),
      h('div', { class: 'flex items-center gap-1' }, copyBtn(() => context), closeBtn));
    const cmHost = h('div', { class: 'rounded-box border border-base-300 overflow-hidden' });
    const note = h('p', { class: 'px-1 pt-2 text-[11px] leading-snug opacity-60', html: 'The snippet you edit is injected where <code class="font-mono text-[0.9em] bg-base-200 border border-base-300 rounded px-1">{{slot}}</code> appears.' });
    const box = h('div', { class: 'modal-box max-w-2xl p-0' }, head, h('div', { class: 'p-3' }, cmHost, note));
    dlg.append(box, h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
    document.body.append(dlg);

    let made = false;
    closeBtn.addEventListener('click', () => dlg.close());
    return () => {
      dlg.showModal();
      if (!made) { made = true; cm6.create(cmHost, { value: context, language: 'html', readOnly: true, wrap: true, fontSize: 12 }); }
    };
  }

  // ── the live demo block: editor + proof. Returns the card synchronously;
  //    the CM6 editor mounts async and wires the proof once ready. ──
  function block(cfg) {
    const meta = PROOF_META[cfg.kind];
    const isParent = cfg.kind === 'parent';
    const live = cfg.kind !== 'console' && !isParent;
    const docOpts = () => ({ tw: cfg.tw, daisy: cfg.daisy, inject: cfg.inject, base, context: cfg.context });

    const card = h('div', { class: 'rounded-box overflow-hidden bg-base-100 border border-base-300 shadow-sm' });

    const langTag = h('div', { class: 'flex items-center gap-1.5 font-mono text-[9.5px] opacity-50' },
      h('span', { class: 'inline-block w-1.5 h-1.5 bg-base-content/30 rounded-sm' }),
      h('span', {}, cfg.lang === 'js' ? 'javascript' : 'html'));
    const codeActions = h('div', { class: 'flex items-center' });
    const topBar = h('div', { class: 'flex items-center justify-between bg-base-200/40 pl-2.5 pr-1 py-1 border-b border-base-300' }, langTag, codeActions);

    const editorHost = h('div', { class: 'bg-base-100 px-2 py-1.5' });
    editorHosts.push(editorHost);
    const indicator = loadingPlaceholder();
    editorHost.append(indicator.el);
    loadIndicators.push(indicator);

    const proofZone = h('div', { class: 'bg-base-200/40 border-t border-base-300' });
    const chip = h('span', { class: 'inline-flex items-center gap-1 rounded-box bg-base-100 border border-base-300 px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase opacity-70 shadow-sm' },
      h('i', { class: `ph ${meta.icon} text-[11px]` }), h('span', {}, meta.label));
    const seamActions = h('div', { class: 'flex items-center' });
    const seam = h('div', { class: 'flex items-center gap-2 px-2 py-1.5' },
      chip, h('div', { class: 'h-px flex-1 bg-base-300' }), seamActions);

    if (cfg.kind === 'context') {
      chip.classList.add('cursor-pointer', 'hover:bg-base-200');
      chip.setAttribute('role', 'button');
      chip.setAttribute('title', 'View host template');
      chip.append(h('i', { class: 'ph ph-arrow-square-out text-[10px] opacity-50' }));
      chip.addEventListener('click', buildHostDialog(cfg.context));
    }

    const proofBody = h('div', {});
    proofZone.append(seam, proofBody);

    let ed = null;
    const getCode = () => ed ? ed.getValue() : cfg.code;

    // console-style output area + line painter, shared by `console` and `parent`.
    const consoleOut = () => {
      const out = h('div', { class: 'mx-2 mb-2 rounded-box bg-base-100 border border-base-300 p-2 font-mono text-[11px] leading-relaxed min-h-[2.4rem] shadow-sm' });
      const line = (level, text) => {
        const tone = { log: 'text-base-content', info: 'text-info', warn: 'text-warning', error: 'text-error', debug: 'opacity-50' }[level] || 'text-base-content';
        const mark = { log: '›', info: 'ℹ', warn: '⚠', error: '✗', debug: '·' }[level] || '›';
        const markTone = level === 'error' ? 'text-error' : level === 'warn' ? 'text-warning' : 'opacity-30';
        out.append(h('div', { class: 'flex gap-2 whitespace-pre-wrap break-words' },
          h('span', { class: 'select-none ' + markTone }, mark), h('span', { class: tone }, text)));
      };
      return { out, line };
    };

    if (live) {
      const frame = h('iframe', { class: 'w-full block bg-transparent', sandbox: 'allow-scripts', style: 'height:40px' });
      proofBody.append(frame);
      addEventListener('message', e => {
        if (e.source === frame.contentWindow && e.data && typeof e.data.__h === 'number')
          frame.style.height = Math.max(32, e.data.__h) + 'px';
      });
      const build = () => { frame.srcdoc = proof.doc(cfg.kind, getCode(), docOpts()); };
      build();
      seamActions.append(iconBtn('ph-arrow-clockwise', 'Refresh', ({ ic }) => {
        ic.style.transition = 'transform .4s'; ic.style.transform = 'rotate(360deg)';
        setTimeout(() => { ic.style.transition = 'none'; ic.style.transform = 'none'; }, 420);
        build();
      }, true));
      cfg._rebuild = build;
      cfg._run = build;
    } else if (isParent) {
      // Runs in the host page — no iframe, full page capabilities. Never fires
      // on edit; only Run / Mod-Enter execute it, so a real user gesture backs
      // file dialogs, downloads, and clipboard calls. console is patched for
      // the duration of the run and restored after.
      const { out, line } = consoleOut();
      out.append(h('div', { class: 'opacity-40' }, 'press Run to execute in this page'));
      proofBody.append(out);
      const run = async () => {
        out.replaceChildren();
        const levels = ['log', 'info', 'warn', 'error', 'debug'];
        const saved = {};
        levels.forEach(l => { saved[l] = console[l]; console[l] = (...a) => { line(l, a.map(ser).join(' ')); try { saved[l].apply(console, a); } catch (_) {} }; });
        try { await AsyncFn(getCode())(); }
        catch (e) { line('error', e.message); }
        finally { levels.forEach(l => { console[l] = saved[l]; }); }
      };
      seamActions.append(iconBtn('ph-play-fill', 'Run', () => run(), true));
      cfg._rebuild = () => {};   // edits don't re-run host code
      cfg._run = run;
    } else {
      const { out, line } = consoleOut();
      proofBody.append(out);
      let runFrame = null;
      addEventListener('message', e => {
        if (runFrame && e.source === runFrame.contentWindow && e.data && e.data.__c)
          line(e.data.__c.level, e.data.__c.text);
      });
      const run = () => {
        out.replaceChildren();
        if (runFrame) runFrame.remove();
        runFrame = h('iframe', { sandbox: 'allow-scripts', style: 'display:none' });
        document.body.append(runFrame);
        runFrame.srcdoc = proof.doc('console', getCode(), docOpts());
      };
      run();
      seamActions.append(iconBtn('ph-play-fill', 'Run', run, true));
      cfg._rebuild = run;
      cfg._run = run;
    }

    codeActions.append(copyBtn(getCode));
    codeActions.append(iconBtn('ph-arrow-counter-clockwise', 'Reset', () => {
      if (ed) ed.setValue(cfg.code);
      cfg._rebuild();
    }));

    cm6.create(editorHost, {
      value: cfg.code,
      language: cfg.lang === 'js' ? 'js' : 'html',
      wrap: settings.wrap, lineNumbers: settings.nums, fontSize: settings.size,
      onChange: debounce(() => cfg._rebuild(), 260),
      onRun: live ? undefined : () => cfg._run(),
    }).then(handle => { ed = handle; editors.push(handle); applyTo(handle); indicator.el.remove(); });

    card.append(topBar, editorHost, proofZone);
    return card;
  }

  let exSeq = 0;
  function example(cfg, si, ei) {
    const sec = h('div', { class: 'mb-6' });
    const kicker = h('p', { class: 'font-mono text-[9px] tracking-widest mb-1 opacity-40' }, `${si + 1}.${ei + 1}`);
    const title = h('h3', { class: 'text-[1.05rem] leading-tight font-semibold' }, cfg.title);
    const prose = cfg.prose ? h('div', { class: 'mt-1 text-[0.9rem] leading-relaxed opacity-70 max-w-[66ch]', html: cfg.prose }) : null;
    const wrap = h('div', { class: 'mt-2.5' }, block(cfg));

    sec.append(kicker, title);
    if (prose) sec.append(prose);
    sec.append(wrap);
    sec.animate(
      [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
      { duration: 400, delay: 60 + exSeq++ * 50, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' }
    );
    return sec;
  }

  function section(cfg, si) {
    const wrap = h('section', { class: 'mb-10' });
    const head = h('header', { class: 'mb-5 pb-2 border-b border-base-300' },
      h('p', { class: 'font-mono text-[10px] tracking-widest opacity-40 mb-1' }, String(si + 1).padStart(2, '0')),
      h('h2', { class: 'text-[1.4rem] leading-tight font-bold tracking-tight' }, cfg.title));
    if (cfg.intro) head.append(h('p', { class: 'mt-1.5 text-[0.95rem] leading-relaxed opacity-70 max-w-[64ch]' }, cfg.intro));
    wrap.append(head);
    cfg.examples.forEach((ex, ei) => wrap.append(example(ex, si, ei)));
    return wrap;
  }

  function legend(mount, kinds) {
    const order = Object.keys(PROOF_META);
    const show = (kinds && kinds.length ? [...new Set(kinds)] : order).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const k of show) {
      const m = PROOF_META[k];
      if (!m) continue;
      mount.append(h('span', { class: 'inline-flex items-center gap-1.5 rounded-box bg-base-100 border border-base-300 px-2 py-0.5 font-mono text-[9.5px] tracking-widest uppercase opacity-70 shadow-sm' },
        h('i', { class: `ph ${m.icon} text-[11px]` }), h('span', {}, m.label)));
    }
  }

  // ── editor load fail-safe ──────────────────────────────────────────────
  // Every block's editor awaits one shared module load (cm6's modsPromise,
  // surfaced as cm6.preload()). cm6 retries transient import failures itself;
  // this is the backstop for when retries are exhausted or the load hangs. We
  // verify once, and if any host never got a CM6 view, we replace it with a
  // plain message + a copyable diagnostics blob to bring back.
  const LOAD_CHECK_TIMEOUT = 5000;

  // While the shared CM6 load is in flight, each editor host shows a spinner.
  // A healthy load resolves well under a second, so the spinner barely flashes;
  // if it lingers, it reveals how many modules have settled and names the ones
  // still pending — making a stall visible live, before the fail-safe fires.
  function loadingPlaceholder() {
    const label = h('span', {}, 'Loading editor…');
    const el = h('div', { class: 'flex items-center gap-2 py-2 text-[11px] opacity-50' },
      h('span', { class: 'loading loading-spinner loading-xs' }), label);
    return {
      el,
      update(status) {
        if (!status || !status.imports || !(status.elapsedMs > 1200)) return;
        const entries = Object.entries(status.imports);
        const done = entries.filter(([, v]) => v.state === 'fulfilled').length;
        if (done === entries.length) return;
        const waiting = entries.filter(([, v]) => v.state === 'pending' || v.state === 'retrying').map(([k]) => k);
        label.textContent = `Loading editor… ${done}/${entries.length} modules`
          + (waiting.length ? ` · waiting on ${waiting.join(', ')}` : '');
      },
    };
  }

  // Diagnostics-only re-fetch of a failed import URL: captures HTTP status,
  // redirect, and content-type to tell an esm.sh serving fault (4xx/5xx/odd
  // redirect) apart from a transient/parse failure (a clean 200 on refetch).
  // Never throws and self-times-out, so a probe can't hang the notice.
  async function probeUrl(url) {
    const out = { url };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      out.status = res.status;
      out.ok = res.ok;
      out.redirected = res.redirected;
      out.type = res.type;
      if (res.url !== url) out.finalUrl = res.url;
      out.contentType = res.headers.get('content-type') || undefined;
    } catch (e) {
      out.fetchError = String((e && e.message) || e);
    }
    return out;
  }

  function loadFailureNotice(getPayload) {
    const wrap = h('div', { class: 'rounded-box border border-warning/40 bg-warning/10 px-3 py-2.5 text-[12px] leading-relaxed' });
    const head = h('div', { class: 'flex items-center gap-2 font-semibold text-warning' },
      h('i', { class: 'ph ph-warning-circle text-[14px]' }), h('span', {}, 'Editor didn’t load'));
    const msg = h('p', { class: 'mt-1 opacity-80' },
      'The code editor couldn’t load its modules — usually a temporary hiccup fetching them. Refreshing the page normally fixes it.');
    const reload = h('button', { class: 'btn btn-xs btn-warning' }, 'Reload');
    reload.addEventListener('click', () => location.reload());
    const copy = iconBtn('ph-copy', 'Copy details', async ({ ic, tx }) => {
      await copyText(getPayload());
      ic.className = 'ph ph-check text-[13px]'; tx.textContent = 'Copied';
      setTimeout(() => { ic.className = 'ph ph-copy text-[13px]'; tx.textContent = 'Copy details'; }, 1300);
    });
    wrap.append(head, msg, h('div', { class: 'mt-2 flex items-center gap-2' }, reload, copy));
    return wrap;
  }

  function verifyEditors(loadState, reason) {
    const missing = editorHosts.filter(host => host.isConnected && !host.querySelector('.cm-editor'));
    if (!missing.length) return;   // all editors rendered — nothing to do
    const failedImports = reason && reason.failedImports;
    const status = (window.cm6 && cm6.loadStatus) ? cm6.loadStatus() : null;
    // A stall never rejects, so failedImports is absent; the still-pending set
    // from loadStatus names the stuck URL(s) instead. Either path yields the
    // `suspects` we probe below.
    const pending = status && status.imports
      ? Object.entries(status.imports).filter(([, v]) => v.state === 'pending' || v.state === 'retrying').map(([key, v]) => ({ key, url: v.url }))
      : [];
    const conn = navigator.connection || {};
    const payload = {
      issue: 'cm6 editors failed to load',
      loadState,
      reason: reason ? String(reason.message || reason) : undefined,
      durationMs: (reason && reason.durationMs) || (status && status.elapsedMs) || undefined,
      failedImports,
      pending: pending.length ? pending : undefined,
      importStatus: status && status.imports,
      expected: editorHosts.length,
      mounted: editorHosts.length - missing.length,
      ref: window.__bundleRef,
      url: location.href,
      when: new Date().toISOString(),
      ua: navigator.userAgent,
      // Rules a site-wide network stall in or out, independent of esm.sh.
      // navigator.connection is absent on Safari; those fields just drop out.
      net: { online: navigator.onLine, effectiveType: conn.effectiveType, rtt: conn.rtt, downlink: conn.downlink, saveData: conn.saveData },
      errors: (window.__consoleLogs || []).filter(l => l.level === 'error').slice(-12),
    };
    // The Copy button reads this getter at click time, so probe results that
    // land after render are picked up without re-rendering the notice.
    let payloadStr = JSON.stringify(payload, null, 2);
    missing.forEach(host => host.replaceChildren(loadFailureNotice(() => payloadStr)));
    console.error('[vanilla-demo] editors failed to load:', loadState, reason || '');

    // Probe the suspects — URLs that rejected (mods() threw) or, on a stall,
    // those still pending — to tell an esm.sh serving fault from a transient
    // one, and re-snapshot errors, which can land after this synchronous build.
    const suspects = (failedImports && failedImports.length) ? failedImports : pending;
    if (suspects.length) {
      Promise.all(suspects.map(f => probeUrl(f.url))).then(probes => {
        payload.probes = probes;
        payload.errors = (window.__consoleLogs || []).filter(l => l.level === 'error').slice(-12);
        payloadStr = JSON.stringify(payload, null, 2);
      });
    }
  }

  // One verification pass, anchored to the shared load. preload() is the same
  // promise the editors await, so its settle is exactly "they should be up by
  // now"; the timeout covers a load that never settles at all.
  function scheduleLoadCheck() {
    if (!editorHosts.length || !(window.cm6 && cm6.preload)) return;
    let done = false;
    const tick = setInterval(() => {
      if (window.cm6 && cm6.loadStatus) {
        const s = cm6.loadStatus();
        loadIndicators.forEach(p => p.update(s));
      }
    }, 400);
    const once = (state, reason) => { if (done) return; done = true; clearInterval(tick); verifyEditors(state, reason); };
    cm6.preload().then(() => once('loaded'), err => once('failed', err));
    setTimeout(() => once('timeout'), LOAD_CHECK_TIMEOUT);
  }

  function mount({ sections, sectionsEl, displayEl, legendEl, base: baseUrl }) {
    if (baseUrl) base = String(baseUrl).replace(/\/$/, '');
    if (legendEl) legend(legendEl, sections.flatMap(s => s.examples.map(e => e.kind)));
    if (displayEl) buildDisplayControl(displayEl);
    sections.forEach((cfg, si) => sectionsEl.append(section(cfg, si)));
    scheduleLoadCheck();
  }

  window.demo = { mount, section, example, block, legend, displayControl: buildDisplayControl, verifyEditors, PROOF_META, settings };
})();
