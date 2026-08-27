const ViewRegistry = {
  _loadedAssets: new Set(),
  loadAsset(url) {
    if (this._loadedAssets.has(url)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const isCSS = url.includes('.css');
      const el = document.createElement(isCSS ? 'link' : 'script');
      if (isCSS) Object.assign(el, { rel: 'stylesheet', href: url });
      else Object.assign(el, { src: url, async: true });
      el.onload = () => { this._loadedAssets.add(url); resolve(); };
      el.onerror = () => reject(new Error(`Load failed: ${url}`));
      document.head.appendChild(el);
    });
  },
  esc: (s) => new Option(String(s ?? '')).innerHTML,

  // Image extensions, and the media type each needs in a data: URI. Kept here
  // rather than in the module so the same list can answer "is this file even
  // text" from anywhere.
  IMAGE_MIME: { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
                bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml' },
  isImage(ext) { return Object.prototype.hasOwnProperty.call(this.IMAGE_MIME, ext); },
  isPdf(ext) { return ext === 'pdf'; },
  isWorkbook(ext) { return ext === 'xlsx' || ext === 'xlsm'; },

  // The media type a file travels under when a HOST decodes it and hands the
  // viewer a data: URI, which is how every local file arrives: a drop, a paste,
  // a stage item with no repo behind it. Wider than IMAGE_MIME, and kept as its
  // own question rather than merged into that map, because `isImage` decides
  // whether to render an <img> and neither a PDF nor a workbook is one. The
  // stage reads this, so naming a dropped file `.pdf` or `.xlsx` is enough to
  // open it.
  mimeFor(ext) {
    if (this.IMAGE_MIME[ext]) return this.IMAGE_MIME[ext];
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === 'xlsm') return 'application/vnd.ms-excel.sheet.macroEnabled.12';
    return '';
  },

  // WHICH MODE A DELIBERATELY-CHOSEN FILE OPENS IN, as a `defaultMode`
  // function. The viewer's own default is `raw`, which is right where you
  // walked a tree to a file and the question is what is in it, plainly. It is
  // wrong wherever the file was already singled out (searched for, staged,
  // pasted), because there the question is what it SAYS, and raw markdown or a
  // wall of unhighlighted JSON puts a mode switch between the reader and the
  // answer. Markdown renders, JSON gets the tree, delimited data gets the
  // table, everything else is syntax-highlighted.
  //
  // It lives here rather than in one view because two views want it and a
  // third will: it was the Files view's private `READ_MODE` until 2026-08-15,
  // at which point the stage's preview needed the same policy and the choice
  // was to share one or to keep two that would drift. The stage is what made
  // the drift concrete: a spreadsheet paste is named `.tsv` precisely so it
  // opens as a table, and under the viewer's bare default it opened as text,
  // so the naming did nothing where it mattered most.
  //
  // The size guard is not hypothetical: Prism highlights synchronously, and
  // this estate holds files in the megabytes (dist/web-tools.js is 2.5 MB and
  // is browsable). Past the cut a file opens raw and the switch is one tap.
  READ_MODE(f) {
    if (f.content && f.content.length > 300000) return 'raw';
    if (f.ext === 'md') return 'preview';
    // JSON asks a second question, and it is the one the extension cannot
    // answer: an array of records IS a table and reads as one, while any other
    // JSON reads as a tree. Deciding on the extension alone gave a pasted row
    // array a tree, which is the shape this policy's sibling on the data-view
    // page (AUTO_VIEW) has always got right by reading the content. Two
    // policies over one question, disagreeing; settled 2026-08-18 by teaching
    // this one the same distinction. The other modes stay one tap away.
    if (f.ext === 'json') return this.isRowArray(f.content) ? 'table' : 'tree';
    if (f.ext === 'csv' || f.ext === 'tsv') return 'table';
    return 'code';
  },

  // A JSON array of records: non-empty, and every element a plain object, which
  // is what the table mode can lay out as columns. Guarded on the first
  // character so a large non-array file is never parsed to find that out, and
  // silent on a parse failure, since "is it a table" is not where invalid JSON
  // should be reported.
  isRowArray(content) {
    const s = String(content || '').trimStart();
    if (s[0] !== '[') return false;
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) && v.length > 0 &&
             v.every(r => r && typeof r === 'object' && !Array.isArray(r));
    } catch { return false; }
  },

  modules: [
    {
      id: 'raw', label: 'Raw', icon: 'ph-text-t',
      test: () => true,
      render: (f) => `<pre class="m-0 p-4 h-full overflow-auto text-base leading-5 font-mono whitespace-pre-wrap text-base-content">${ViewRegistry.esc(f.content)}</pre>`
    },
    {
      id: 'code', label: 'Code', icon: 'ph-code',
      assets: [
        'https://cdn.jsdelivr.net/combine/npm/prismjs/themes/prism.min.css',
        'https://cdn.jsdelivr.net/combine/npm/prismjs/prism.min.js,npm/prismjs/plugins/autoloader/prism-autoloader.min.js'
      ],
      test: (f) => ['js','ts','py','sh','ps1','html','md','json','yml','css','rb','rs','go','java','cpp','c','sql','xml'].includes(f.ext),
      render: (f) => `<div class="bg-[#f5f2f0] h-full overflow-hidden"><pre class="!m-0 !p-4 !bg-transparent h-full overflow-auto !text-sm leading-5"><code class="language-${f.ext}">${ViewRegistry.esc(f.content)}</code></pre></div>`,
      after: () => {
        if (window.Prism) {
          Prism.plugins.autoloader.languages_path = 'https://cdnjs.cloudflare.com/ajax/libs/prism/components/';
          Prism.highlightAll();
        }
      }
    },
    {
      id: 'preview', label: 'Preview', icon: 'ph-eye',
      test: (f) => ['md', 'html'].includes(f.ext),
      // DOMPurify rides beside marked because this module is the viewer's one
      // path that puts file content into THIS document rather than behind a
      // sandbox. Markdown legally carries inline HTML, marked passes it
      // through by design (its own `sanitize` option was removed in v5), and
      // the result lands via innerHTML. That was tolerable while every file
      // came from a repo the reader had already chosen to open. It stopped
      // being tolerable when toss-render started handing pasted clipboard
      // content to this viewer: content nobody has vetted, rendered on an
      // origin whose localStorage holds a GitHub token. The html branch below
      // was already sandboxed; this closes the other half.
      assets: ['https://cdn.jsdelivr.net/combine/npm/marked/marked.min.js,npm/dompurify/dist/purify.min.js'],
      render: (f) => {
        if (f.ext === 'html') {
          // charset=utf-8, or a page with no <meta charset> is decoded as the
          // locale default and every non-ASCII character mojibakes. Same fix,
          // same reason, as mountFrame in pages/toss-render.html.
          const blob = new Blob([f.content], { type: 'text/html;charset=utf-8' });
          return `<iframe src="${URL.createObjectURL(blob)}" class="w-full h-full bg-white" sandbox="allow-scripts allow-modals"></iframe>`;
        }
        // Two elements, not one, and the reason is the scrollbar. When the
        // scroll container is also the measured column, its scrollbar sits at
        // the END OF THE TEXT rather than at the edge of the pane: a bar
        // stranded mid-card with empty space to its right, which reads as a
        // layout bug and was reported as one.
        //
        // It used to be one element carrying `max-w-none`, which never took.
        // Tailwind v4 emits utilities into `@layer utilities`, and the
        // typography plugin's stylesheet is UNLAYERED, so `.prose{max-width:
        // 65ch}` beat `.max-w-none` on the cascade-layer rule rather than on
        // specificity or order: an unlayered declaration wins against any
        // layered one. Nothing in the class list looked wrong, which is why it
        // survived. Measured at 506px inside a 1118px parent.
        //
        // So the column keeps the plugin's own measure, which is a considered
        // value and was never the complaint, and is centered instead of left
        // over a wide pane. Any future width override belongs here as an
        // inline style, the one place a cascade layer cannot reach.
        // Degrade to escaped source rather than to raw injection: if the
        // sanitizer failed to load, the honest fallback is the text itself,
        // not the markup it was going to clean.
        // FRONTMATTER GOES BEFORE THE PARSE. A leading `---` block is typed
        // metadata across this estate, and markdown has never heard of it: the
        // opening fence reads as a horizontal rule and the line under it as a
        // setext heading, so a document opens on "date: 2026-07-26" set large
        // and bold, above its own title. Every index generator in these repos
        // already inlines the body only; this is that same rule at read time.
        //
        // Deliberately strict about the opening fence being the FIRST thing in
        // the file. A `---` further down is a horizontal rule and means it.
        const text = ViewRegistry.stripFrontmatter(f.content);
        const body = window.DOMPurify
          ? DOMPurify.sanitize(marked.parse(text))
          : `<pre class="whitespace-pre-wrap">${ViewRegistry.esc(text)}</pre>`;
        return `<div class="overflow-auto h-full w-full bg-base-100">
          <div class="prose prose-sm mx-auto px-6 py-4">${body}</div>
        </div>`;
      },
      // A wide table is the one markdown element that can widen this pane past
      // the viewport: its min-content width (the longest unbreakable run in
      // each column) is a floor no ancestor can shrink below, so the outer
      // `overflow-auto` starts scrolling the WHOLE document sideways, prose and
      // all. kits/md-doc.js puts each table in a scroller of its own instead.
      // Loaded here rather than through `assets`, which is for CDN URLs, and
      // done after the render because the markup is already in place by then.
      // Best effort: no kit, no containment, and the prose is unaffected.
      after: (f, ctx) => {
        if (f.ext !== 'md') return;
        const wrap = () => window.mdDoc && ctx?.alive?.() !== false
          && window.mdDoc.contain(ctx?.root || document);
        if (window.mdDoc) wrap();
        else window.gh?.load('kits/md-doc.js').then(wrap).catch(() => {});
      }
    },
    {
      id: 'table', label: 'Table', icon: 'ph-table',
      assets: [
        'https://unpkg.com/tabulator-tables@6.3.0/dist/css/tabulator_simple.min.css',
        'https://unpkg.com/tabulator-tables@6.3.0/dist/js/tabulator.min.js'
      ],
      // A JSON array of records, or a delimited table. CSV/TSV get no other
      // structured mode (they aren't in the code module's language list), so
      // without this a data file renders as raw text and nothing else.
      test: (f) => (f.ext === 'json' && f.content.trim().startsWith('[')) ||
                   ['csv', 'tsv'].includes(f.ext),
      // NO TOOLBAR OF ITS OWN. Both of this mode's controls go to the viewer's
      // header through ctx.controls, so the content box is the table and
      // nothing else. The strip that used to sit here cost a band of a phone
      // screen and put a labelled checkbox in a row of icon buttons, which is
      // two idioms for one job.
      render: () => `<div class="h-full w-full"><div data-table="target" class="h-full"></div></div>`,
      after: (f, ctx) => {
        requestAnimationFrame(() => {
          const target = ctx?.root?.querySelector('[data-table="target"]');
          if (!target || !ctx.alive()) return;
          try {
            const h = target.clientHeight || 500;
            const table = new Tabulator(target, {
              data: ViewRegistry.tableRows(f),
              autoColumns: true,
              autoColumnsDefinitions: (defs) => defs.map(d => ({ ...d, headerFilter: 'input' })),
              layout: "fitData",
              height: h + "px",
              ...ViewRegistry.headerFilter(ctx.opts),
            });
            // The two controls, both in the viewer's header. Filters is a
            // TOGGLE (a state, shown by the glyph) and the deck is an ACTION
            // (a verb), the same split fab.js draws between a page's `toggles`
            // and its `actions`.
            //
            // Invocation stays the HOST's: this surface offers the button and
            // no gesture. A tap on a Tabulator row is a selection idiom here,
            // and a row tap belongs to a surface that has decided it wants one
            // rather than to the shared viewer. The rows and their ORDER come
            // off the grid at tap time, so a reader who filtered to four and
            // sorted them gets those four in that order.
            ViewRegistry.mountTableControls(ctx?.controls, table, target, f);
          } catch (e) {
            target.innerHTML = `<div class="p-4 text-error font-mono text-base">Could not read ${ViewRegistry.esc(f.name)} as a table: ${ViewRegistry.esc(e.message)}</div>`;
          }
        });
      }
    },
    {
      // Tree mode mounts vanilla-jsoneditor in 'tree' mode. The editor is
      // editable; changes fire a `viewer:tree-change` CustomEvent on document
      // with the editor's updated content ({ json } when valid, { text } when
      // mid-edit and not parseable). Pages that want to persist edits listen
      // for that event. The editor instance is stashed on the mount element
      // as `el.__jse` so callers that need imperative access can find it.
      id: 'tree', label: 'Tree', icon: 'ph-tree-view',
      test: (f) => f.ext === 'json',
      render: () => `<div class="jse-mount h-full w-full bg-base-100"></div>`,
      after: (f) => {
        requestAnimationFrame(async () => {
          const target = document.querySelector('.jse-mount');
          if (!target) return;
          try {
            ViewRegistry._jseMod ??= await import('https://cdn.jsdelivr.net/npm/vanilla-jsoneditor/standalone.js');
            // A blocked or empty CDN response still resolves the import, so
            // check for the export rather than trusting the module object; the
            // alternative is an unhandled TypeError instead of this message.
            if (typeof ViewRegistry._jseMod?.createJSONEditor !== 'function') {
              throw new Error('the editor module loaded without createJSONEditor (CDN blocked or empty)');
            }
          } catch (e) {
            ViewRegistry._jseMod = null;   // don't cache a dud; a later retry can succeed
            target.innerHTML = `<pre class="p-4 text-error font-mono text-base">Failed to load JSON editor: ${ViewRegistry.esc(e?.message || e)}</pre>`;
            return;
          }
          let parsed;
          try { parsed = JSON.parse(f.content); }
          catch (e) {
            target.innerHTML = `<pre class="p-4 text-error font-mono text-base">Invalid JSON: ${ViewRegistry.esc(e.message)}</pre>`;
            return;
          }
          const editor = ViewRegistry._jseMod.createJSONEditor({
            target,
            props: {
              content: { json: parsed },
              mode: 'tree',
              onChange: (updatedContent) => {
                document.dispatchEvent(new CustomEvent('viewer:tree-change', {
                  detail: { content: updatedContent, file: f.name }
                }));
              }
            }
          });
          target.__jse = editor;
        });
      }
    },
    {
      // The one module that cannot work from `content`, and the reason there
      // was no image mode for so long. Every other module reads the text the
      // viewer was handed; a PNG's bytes do not survive being decoded as UTF-8,
      // so `content` for an image is lossy garbage that can never be turned
      // back into a picture. The module therefore goes and gets the bytes
      // itself, base64 from the contents API through the page's own `gh`, which
      // is also what makes it work in a PRIVATE repo, where a raw.githubusercontent
      // or jsDelivr src would 404 and a naive implementation would look correct
      // on the public hub and fail everywhere else.
      //
      // Three sources, in order: a data: URI already in hand (a pasted image,
      // or any local file the host decoded itself), SVG (text, so it survived
      // the trip and needs no fetch), and a repo file (fetched).
      //
      // `exclusive` because a host's blanket defaultMode ('raw' in show-repo's
      // file view) cannot tell "raw for a text file" from "raw for a PNG", and
      // the second is never what anyone meant.
      id: 'image', label: 'Image', icon: 'ph-image',
      exclusive: true, binary: true,
      test: (f) => ViewRegistry.isImage(f.ext),
      render: () => `<div class="h-full w-full overflow-auto bg-base-200 grid place-items-center p-4">
        <img data-img="el" class="hidden max-w-full object-contain shadow-sm bg-base-100" alt="">
        <div data-img="msg" class="text-sm text-base-content/50 flex items-center gap-2">
          <span class="loading loading-spinner loading-sm"></span> Reading the image…
        </div>
      </div>`,
      // Scoped to this viewer's root, for the reason the pdf module states at
      // length: two mounted viewers meant two elements with one id, and the
      // second one's image landed in the first one's frame.
      after: async (f, host) => {
        const img = host?.root?.querySelector('[data-img="el"]');
        const msg = host?.root?.querySelector('[data-img="msg"]');
        if (!img || !msg) return;
        // Report the two facts the header could not otherwise state truthfully:
        // the pixel size, known only once the image decodes, and the byte size,
        // known only from the fetch (`bytes` stays null for a data: URI or an
        // SVG, where no fetch happened and the base64 length is not the file).
        let bytes = null;
        const show = (src) => {
          img.onload = () => {
            msg.remove();
            img.classList.remove('hidden');
            const px = `${img.naturalWidth} × ${img.naturalHeight}`;
            host?.report(bytes == null ? px : `${px} · ${(bytes / 1024).toFixed(1)} KB`);
          };
          img.onerror = () => { msg.textContent = 'That file did not decode as an image.'; };
          img.src = src;
        };
        const fail = (why) => { msg.textContent = why; };
        const mime = ViewRegistry.IMAGE_MIME[f.ext] || 'image/png';
        try {
          const content = String(f.content || '');
          if (/^data:/.test(content.trim())) return show(content.trim());
          // SVG is text all the way down, so the content is already the file.
          // Encoded through the UTF-8 byte path, since btoa on a string with
          // any non-Latin-1 character throws.
          if (f.ext === 'svg') {
            const bytes = new TextEncoder().encode(content);
            let s = ''; for (const b of bytes) s += String.fromCharCode(b);
            return show('data:image/svg+xml;base64,' + btoa(s));
          }
          if (!f.repo || !f.name) return fail('No repo behind this file, so its bytes cannot be fetched.');
          if (!window.gh) return fail('window.gh is not on this page, so the bytes cannot be fetched.');
          const at = f.ref ? '?ref=' + encodeURIComponent(f.ref) : '';
          const data = await gh.req(`/repos/${f.repo}/contents/${f.name}${at}`);
          if (Array.isArray(data)) return fail('That path is a directory.');
          // Over 1 MB the contents API empties `content`; the blobs API serves
          // the same bytes by sha up to 100 MB. Same fallback gh.get makes.
          const b64 = data.content || (await gh.req(`/repos/${f.repo}/git/blobs/${data.sha}`)).content;
          if (!b64) return fail('GitHub returned no bytes for that file.');
          const clean = b64.replace(/\s/g, '');
          // The contents API reports `size`; fall back to deriving it from the
          // base64 length, which is exact once padding is subtracted.
          bytes = typeof data.size === 'number' ? data.size
                : Math.floor(clean.length * 3 / 4) - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0);
          show('data:' + mime + ';base64,' + clean);
        } catch (e) {
          fail('Could not read the image: ' + ((e && e.message) || String(e)));
        }
      }
    },
    {
      // A PDF is the first subject here whose readings are not all renderings,
      // and the split is deliberate. This module is the FIRST LOOK: a page on a
      // canvas, a pager, the file's real size. That is what someone browsing a
      // repo wants, and usually all they want. The WORKBENCH is
      // pages/pdf-inspect.html, and this links to it rather than trying to be
      // it: overlays, trim boxes, the page stack and the two table readings are
      // a tool with state of its own, and folding that into a preview pane
      // would make a worse tool and a worse preview at once.
      //
      // Cheap on purpose, in two ways that both matter on a phone. It loads
      // pdf.js and not pdf-lib, which is why kits/pdf.js splits its loader; and
      // it renders ONE page through pdf.js directly rather than calling
      // pdf.open(), which parses every page's text and operator list up front.
      // A 200-page budget submittal opens on page 1 either way. Only one of
      // them makes the reader wait for the other 199 first.
      //
      // `exclusive` for the same reason images are: a host's blanket
      // defaultMode ('raw' in show-repo's file view) cannot tell "raw for a
      // text file" from "raw for a PDF", and the second is a screen of mojibake
      // that this estate served for as long as it has browsed repos holding
      // PDFs. The mode strip still offers raw one tap away.
      id: 'pdf', label: 'PDF', icon: 'ph-file-pdf',
      exclusive: true, binary: true,
      test: (f) => ViewRegistry.isPdf(f.ext),
      // DATA ATTRIBUTES, NOT IDS, and that is the whole repair. An id is a
      // promise that the thing is unique on the page, and this markup is a
      // component's body: the stage reader mounts three viewers at once, so
      // three elements carried id="viewer-pdf" and every getElementById below
      // resolved to whichever came first in document order. Scoping the
      // lookups to `ctx.root` is what fixes the bug; dropping the ids is what
      // keeps the next reader from reaching for getElementById again.
      // NO CHROME ROW OF ITS OWN. Everything this module offers goes to the
      // VIEWER'S header through `ctx.controls`, the slot the table mode
      // already uses, and the position readout goes to a pill that floats over
      // the page. What is left here is the document and nothing else.
      //
      // The bar this replaces was a third band of chrome. Inside the stage
      // reader a PDF sat under the deck's header (the file, its repo, the
      // deck's own position) and then the viewer's header (the file again,
      // its size, its buttons) and then this: a pager, a byte size, a flow
      // switch and an "Inspect" link. Three rows before the page began, two
      // of them naming the same file. The viewer's header comment already
      // states the rule this now follows, having learned it from the table
      // mode's filter checkbox: two rows of chrome for one file is one too
      // many.
      render: () => `<div data-pdf="root" class="h-full w-full">
        <div data-pdf="stage" class="h-full w-full relative bg-base-200">
          <div data-pdf="msg" class="absolute inset-0 grid place-items-center text-sm text-base-content/50">
            <span class="flex items-center gap-2"><span class="loading loading-spinner loading-sm"></span> Reading the PDF…</span>
          </div>
        </div>
      </div>`,
      after: async (f, ctx) => {
        const root = ctx?.root?.querySelector('[data-pdf="root"]');
        if (!root) return;
        const el = (k) => root.querySelector(`[data-pdf="${k}"]`);
        const stage = el('stage'), msg = el('msg');
        if (!stage || !msg) return;

        // Every await below can outlive the file it was started for: switching
        // rows in a list is faster than fetching a document. `ctx.alive` is
        // read after each await, so a superseded render stops instead of
        // painting the previous file's page over the current one. It is scoped
        // to THIS viewer (see _afterSeq); the registry-wide counter it replaces
        // made three concurrent viewers cancel each other.
        const stale = () => !ctx.alive();
        const fail = (why) => { if (!stale()) msg.textContent = why; };

        const toBytes = (b64) => {
          const bin = atob(String(b64).replace(/\s/g, ''));
          return Uint8Array.from(bin, (c) => c.charCodeAt(0));
        };

        try {
          // Two sources, the same pair the image module reads and for the same
          // reason: a local file was already decoded by its host and arrives as
          // a data: URI, a repo file has to be fetched as bytes because the
          // text pipeline destroyed it on the way in.
          let bytes, size;
          const content = String(f.content || '').trim();
          const carried = /^data:[^;,]*;base64,([\s\S]*)$/.exec(content);
          if (carried) {
            bytes = toBytes(carried[1]);
            size = bytes.length;
          } else if (f.repo && f.name && window.gh) {
            const at = f.ref ? '?ref=' + encodeURIComponent(f.ref) : '';
            const data = await gh.req(`/repos/${f.repo}/contents/${f.name}${at}`);
            if (stale()) return;
            if (Array.isArray(data)) return fail('That path is a directory.');
            // Over 1 MB the contents API empties `content`; the blobs API
            // serves the same bytes by sha up to 100 MB. Same fallback gh.bytes
            // makes, repeated here because this module addresses another repo.
            const b64 = data.content || (await gh.req(`/repos/${f.repo}/git/blobs/${data.sha}`)).content;
            if (stale()) return;
            if (!b64) return fail('GitHub returned no bytes for that file.');
            bytes = toBytes(b64);
            size = typeof data.size === 'number' ? data.size : bytes.length;
          } else if (f.local) {
            return fail('This file is local and its bytes did not survive the trip. Drop it again to read it.');
          } else {
            return fail('No repo behind this file, so its bytes cannot be fetched.');
          }

          // gh.load honours ?use=, so a branch preview reads the branch's kit.
          // The CDN copy is the fallback for a page with no gh at all.
          const need = async (global, path) => {
            if (window[global]) return;
            if (window.gh?.load) await gh.load(path);
            else await ViewRegistry.loadAsset('https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/lib/' + path);
          };
          // Only the pdf kit now. swipe-deck came with the horizontal page
          // deck and left with it: a continuous column is plain DOM, so a PDF
          // no longer drags a deck kit onto every page that shows one.
          await need('pdf', 'kits/pdf.js');
          if (stale()) return;

          // firstLook, not open(): open() parses every page's text content and
          // operator list before it returns, which is what a table read needs
          // and what showing page 1 does not. It is also the kit's one copy of
          // the fit-and-oversample arithmetic, which this module used to keep a
          // second version of; alpineComponents/file-review.js became the third
          // caller and made the duplicate worth removing rather than watching.
          const look = await window.pdf.firstLook(bytes);
          if (stale()) return;

          const pages = look.pages;
          // THE SIZE GOES BACK TO THE HOST'S HEADER LINE, through `ctx.report`,
          // which is the hook a module uses to say "I measured the real bytes"
          // and which `stats` prefers over anything derived from the text.
          //
          // It was moved OUT of that line once, when the line read
          // "3 pages · 175.8 KB" directly above a pager reading "1 / 3": the
          // page count was stated twice and the position was the better of the
          // two. The size followed the pager into a bar of its own, which was
          // the wrong half to move. With the page count gone from the chrome
          // entirely and the position living on the floating pill, the header
          // line can carry the size alone, which is the one fact about the
          // document as an object that never changes while you read it.
          ctx?.report?.(`${(size / 1024).toFixed(1)} KB`);

          // PAGES ARE VERTICAL CONTENT, and the axis is the whole point.
          //
          // A PDF is read inside things that are themselves paged: the stage
          // reader swipes the staged files, and each of its slides mounts one
          // of these viewers. Paging this document horizontally therefore put
          // a horizontal deck inside a horizontal deck, and the inner track
          // carries `overscroll-x-contain`, so with a thumb over the page a
          // sideways swipe meant "next page" and a few pixels outside it the
          // same gesture meant "next document". Measured 2026-08-25 in a
          // mobile-emulated Chromium: on a multi-page document the gesture is
          // captured and the outer deck never moves, so there is no swipe that
          // leaves a document; on a single-page one the track is not a scroll
          // container and the gesture chains straight through. One gesture,
          // two meanings, and which one you get depends on how many pages the
          // file happens to have.
          //
          // A continuous column dissolves that: pages take the vertical axis,
          // the way any other long document is read, and horizontal is left
          // meaning "document" at every level of the nest.
          //
          // A VERTICAL SNAP DECK WOULD NOT DO, and this is the reason it was
          // never built rather than an argument about taste. A page is fitted
          // to the pane's WIDTH, so on any pane wider than it is tall the page
          // is taller than its slide and already scrolls vertically inside it.
          // Snapping pages vertically would overload the vertical axis exactly
          // as the horizontal one was overloaded. A continuous column has no
          // inner scroller to collide with.
          //
          // A page-at-a-time flow shipped beside this one for a day, behind a
          // header toggle, so the two could be compared on a real stage of
          // eight budget submittals. The comparison came back one-sided and
          // the toggle is gone with it: a mode that nobody chooses is a second
          // shape for every test, every handle and every piece of chrome to
          // carry. What it taught survives as the paragraph above.
          // ── the floating pager ─────────────────────────────────────────────
          //
          // The position is the one readout that CHANGES while you read, and
          // chrome that changes wants to be near what it describes rather than
          // in a band above it. So it floats over the foot of the page and
          // fades when it has nothing to say: present the moment you move,
          // gone a second and a half later, and the document has the pane back.
          //
          // It also carries the arrows and the page jump, which is why it is a
          // pill rather than a label. Nothing else offers either: the deck's
          // contents sheet lists the DOCUMENTS in a stage, never the pages of
          // one, so before this a reader who wanted page 40 of a 200-page
          // submittal could only scroll for it.
          //
          // Built only when there is more than one page. A one-page PDF has no
          // position to report and no page to jump to.
          const pager = pages > 1 ? (() => {
            const wrap = document.createElement('div');
            wrap.className = 'viewer-pdf-pager pointer-events-none absolute inset-x-0 bottom-3 z-20 '
                           + 'flex justify-center opacity-0 transition-opacity duration-300';
            wrap.innerHTML = `
              <div class="pointer-events-auto flex items-center gap-0.5 rounded-full border border-base-300
                          bg-base-100/90 px-1 py-0.5 shadow-lg backdrop-blur">
                <button data-pdf="prev" type="button" title="Previous page"
                        class="btn btn-xs btn-circle btn-ghost"><i class="ph ph-caret-left"></i></button>
                <details data-pdf="jump" class="dropdown dropdown-top dropdown-center">
                  <summary class="btn btn-xs btn-ghost rounded-full px-2 font-mono tabular-nums"
                           title="Jump to a page"><span data-pdf="page">1 / 1</span></summary>
                  <ul data-pdf="jumplist" class="dropdown-content menu mb-2 max-h-64 w-32 flex-nowrap
                      overflow-y-auto overscroll-contain rounded-box border border-base-300
                      bg-base-200 p-2 shadow-xl"></ul>
                </details>
                <button data-pdf="next" type="button" title="Next page"
                        class="btn btn-xs btn-circle btn-ghost"><i class="ph ph-caret-right"></i></button>
              </div>`;
            stage.append(wrap);
            return wrap;
          })() : null;

          // The zoom readout, and the way back out. Present whenever the page
          // is not at fit-to-width and absent otherwise, which is the OPPOSITE
          // of the pager's fade, on purpose. A position is a fact you glance
          // at; a zoom level is a state you can get stuck in, and immersive
          // taught this the hard way on a phone: a state with no visible exit
          // reads as a broken page rather than as a state.
          //
          // Its own pill rather than a cell of the pager, because the pager is
          // built only for a multi-page document and a one-page PDF is exactly
          // the case where zooming is the only thing left to do.
          const zoomPill = (() => {
            const wrap = document.createElement('div');
            // Bottom LEFT, which is the one free corner. The pager owns the
            // centre, and bottom right is where the estate's pages float their
            // own panel: at 560px on data-view the panel sat squarely over this
            // button, so the escape hatch was there and untappable, which is
            // the same failure as not having one.
            wrap.className = 'viewer-pdf-zoom hidden absolute bottom-3 left-3 z-20';
            wrap.innerHTML = `
              <button data-pdf="zoomreset" type="button" title="Fit to width"
                      class="btn btn-xs gap-1 rounded-full border-base-300 bg-base-100/90
                             font-mono tabular-nums shadow-lg backdrop-blur">
                <i class="ph ph-arrows-in-simple"></i><span data-pdf="zoomlevel">100%</span>
              </button>`;
            stage.append(wrap);
            return wrap;
          })();

          const label = el('page'), prev = el('prev'), next = el('next');
          const jump = el('jump'), jumpList = el('jumplist');
          const zoomLevel = el('zoomlevel'), zoomReset = el('zoomreset');

          // Visible while it is being used, and while it has just been used.
          // The dropdown holds it open on its own: a list that vanished under
          // the finger reaching for it would be worse than no list.
          let fade = 0;
          const reveal = () => {
            if (!pager) return;
            pager.classList.remove('opacity-0');
            clearTimeout(fade);
            fade = setTimeout(() => {
              if (!jump?.open) pager.classList.add('opacity-0');
            }, 1500);
          };

          const sync = (a) => {
            if (label) label.textContent = `${a + 1} / ${pages}`;
            if (prev) prev.disabled = a <= 0;
            if (next) next.disabled = a >= pages - 1;
            aimInspect(a);
            jumpList?.querySelectorAll('a[data-page]').forEach((row) => {
              const here = Number(row.dataset.page) === a;
              // BOTH class names. daisyUI 5 marks a menu row with
              // `menu-active`; the bare `active` this estate's older menus use
              // is inert there, so marking only that put the reader's page in
              // the list looking exactly like every other row. `active` stays
              // as the selector everything else keys on.
              row.classList.toggle('menu-active', here);
              row.classList.toggle('active', here);
            });
            reveal();
          };

          // THE READING MODEL IS THE KIT'S, not this module's. It used to be
          // 400 lines here: the reserved page-shaped holes, the lazy render
          // window, the seek pinning, the zoom and its anchor. All of it moved
          // to `pdf.flow` on 2026-08-25, unchanged, because the budget-drs
          // submittal reader needs the same column and copying it would have
          // been the second implementation of one answer with nothing
          // comparing them. What stays here is the chrome the kit refuses to
          // own: the floating pager, the page-jump list, and the workbench
          // link, all driven from `onPage`.
          let mount = null, at = 0;

          // ── the handoff to the workbench ───────────────────────────────────
          //
          // A ROW IN THE OPEN-ELSEWHERE DROPDOWN, through `ctx.links`, not a
          // button of this module's own. That dropdown is already the list of
          // places this file opens (GitHub, Raw, CDN, and `Toss render` for an
          // HTML file), so a second control for the same idea was a whole
          // button spent saying what one row says. The row also gets to carry
          // a WORD, which a lone magnifier could not: "PDF workbench p6" says
          // where it goes and what it will show, and the icon beside it in a
          // list is a hint rather than the entire message.
          //
          // The workbench is pages/pdf-inspect.html, which takes a document
          // APART rather than reading it: text containers, characters and
          // vector rules drawn as layers over the page, detected columns and
          // lattice cells, and the table read two independent ways so
          // agreement is visible (docs/pdf-structure.md).
          //
          // Its main mode is PAGE-SCOPED, so the row carries the page the
          // reader is on and is re-aimed by `sync` as they scroll. Before
          // 2026-08-25 it always landed on page 1 and the reader's position was
          // thrown away at the door, which is the sort of loss a link cannot
          // report: a handoff that drops what it was given looks exactly like
          // one that was never asked for anything.
          const addr = f.repo && f.name
            ? f.repo + (f.ref ? '@' + f.ref : '') + ':' + f.name
            : '';
          // ?use= rides along so a branch preview keeps its ref. A change to
          // pdf-inspect's own shell needs a toss instead, which is the
          // documented trap and not this link's job to solve.
          const use = new URLSearchParams(location.search).get('use');
          const aimInspect = (a) => {
            if (!addr || !ctx?.links || stale()) return;
            ctx.links([{
              // "Workbench", not "PDF workbench": the row sits under GitHub,
              // Raw and CDN in a list opened from a pane showing a PDF, so the
              // "PDF" was context the reader already had, and at 390px in a
              // w-40 menu it was the word that pushed the label onto a second
              // line. The page rides along, which is the part that could not
              // be said at all while this was a lone magnifier.
              l: pages > 1 ? `Workbench p${a + 1}` : 'Workbench',
              i: 'ph-magnifying-glass-plus',
              u: 'https://mehrlander.github.io/web-tools/pages/pdf-inspect.html'
                 + (use ? '?use=' + encodeURIComponent(use) : '')
                 + '#gh=' + addr + (pages > 1 ? '&page=' + (a + 1) : ''),
            }]);
          };

          mount = await window.pdf.flow(look, stage, {
            alive: () => !stale(),
            // The pager reads the flow's position rather than keeping one, so
            // an arrow and a thumb cannot disagree: there is one position, and
            // both are ways of moving it.
            onPage: (i) => { at = i; sync(i); },
            // Not only when the page changes. The pill is a "you are scrolling"
            // indicator as much as a position, and a long page would otherwise
            // let it fade mid-scroll.
            onScroll: () => reveal(),
            onZoom: (z) => {
              if (!zoomPill) return;
              zoomPill.classList.toggle('hidden', Math.abs(z - 1) < 0.001);
              if (zoomLevel) zoomLevel.textContent = Math.round(z * 100) + '%';
            },
          });
          if (stale() || !mount) return;
          root.__pdfFlow = mount;
          // The pill is built once, outside the flow, so its one job is wired
          // here: tapping the readout is what "fit to width" means.
          zoomReset?.addEventListener('click', () => mount?.setZoom(1));
          sync(0);
          msg.classList.add('hidden');

          // ── wiring the floating pager ──────────────────────────────────────
          //
          // The arrows DRIVE the mounted flow rather than keeping a page number
          // of their own. That is the whole reason the pager and the gesture
          // cannot disagree: there is one position, the scroll offset of
          // whatever is mounted, and an arrow and a thumb are two ways of
          // moving it.
          prev?.addEventListener('click', () => mount && mount.go(mount.active() - 1));
          next?.addEventListener('click', () => mount && mount.go(mount.active() + 1));

          // The jump list is built on FIRST OPEN, not on mount. A 200-page
          // submittal is exactly the document worth having a jump list for and
          // exactly the one where building 200 rows nobody asked for is waste.
          if (jump && jumpList) {
            jump.addEventListener('toggle', () => {
              if (!jump.open) { reveal(); return; }
              clearTimeout(fade);
              if (!jumpList.childElementCount) {
                const frag = document.createDocumentFragment();
                for (let i = 0; i < pages; i++) {
                  const li = document.createElement('li');
                  const a = document.createElement('a');
                  a.dataset.page = String(i);
                  a.className = 'font-mono tabular-nums';
                  a.textContent = `Page ${i + 1}`;
                  a.addEventListener('click', () => {
                    jump.open = false;
                    mount?.go(i);
                  });
                  li.append(a);
                  frag.append(li);
                }
                jumpList.append(frag);
              }
              sync(mount ? mount.active() : at);
              // Open ON the reader's page rather than at page 1, which is the
              // difference between a jump list and a list you scroll twice.
              jumpList.querySelector('a.active')?.scrollIntoView({ block: 'center' });
            });
            // A <details> in imperative markup gets no `data-auto-close`
            // handler, since that directive is Alpine's and this subtree is
            // never parsed by it. Closing on an outside tap is the whole of
            // what it would have done.
            //
            // Bound to the STAGE, not to `document`. A document-level listener
            // would outlive this viewer, and nothing here is asked to be torn
            // down: the stage reader releases a slide by emptying it, which
            // takes any listener inside the subtree with it and leaves a
            // document-level one behind holding a reference to the dead tree.
            // Three viewers alive at once means three leaks per file read.
            stage.addEventListener('pointerdown', (e) => {
              if (jump.open && !jump.contains(e.target)) jump.open = false;
            });
          }
        } catch (e) {
          fail('Could not read the PDF: ' + ((e && e.message) || String(e)));
        }
      }
    },
    {
      // A workbook, read the way a reader means it: sheets by name, cells as
      // values. Before this an .xlsx ran through gh.get(), which is bytes plus
      // a UTF-8 decode, so a ZIP came back as a screen of replacement
      // characters. Not a blank pane, a corrupted-looking one, on every surface
      // in this estate that shows a file.
      //
      // `exclusive` for the reason images and PDFs are: a host's blanket
      // defaultMode ('raw' in show-repo's file view) cannot tell "raw for a
      // text file" from "raw for a ZIP", and the second is never what anyone
      // meant. The mode strip still offers raw one tap away.
      //
      // It shows VALUES, not structure. kits/xlsx.js can also report the part
      // graph, the shared-string table, the calc chain and the queries, and
      // none of that belongs in a preview pane: someone browsing a repo wants
      // to know what is in the spreadsheet. Structure is a workbench question,
      // and the kit's living demo is where it is answered today.
      //
      // Formatted, deliberately: sheetRows is passed the workbook so dates read
      // as dates. A serial is what is stored; a date is what the file means,
      // and a reader comparing this to Excel needs the second.
      id: 'xlsx', label: 'Sheets', icon: 'ph-table',
      exclusive: true,
      assets: [
        'https://unpkg.com/tabulator-tables@6.3.0/dist/css/tabulator_simple.min.css',
        'https://unpkg.com/tabulator-tables@6.3.0/dist/js/tabulator.min.js'
      ],
      test: (f) => ViewRegistry.isWorkbook(f.ext),
      render: () => `<div data-xlsx="root" class="h-full w-full flex flex-col bg-base-200">
        <div data-xlsx="tabs" class="hidden shrink-0 flex-wrap items-center gap-1 px-2 py-1.5 border-b border-base-300 bg-base-100"></div>
        <div data-xlsx="stage" class="flex-1 min-h-0 relative">
          <div data-xlsx="msg" class="absolute inset-0 grid place-items-center text-sm text-base-content/50">
            <span class="flex items-center gap-2"><span class="loading loading-spinner loading-sm"></span> Opening the workbook…</span>
          </div>
        </div>
      </div>`,
      after: async (f, host) => {
        const root = host?.root?.querySelector('[data-xlsx="root"]');
        if (!root) return;
        const el = (k) => root.querySelector(`[data-xlsx="${k}"]`);
        const stage = el('stage'), msg = el('msg'), tabs = el('tabs');
        if (!stage || !msg) return;

        // Same guard the pdf module carries, for the same reason: switching
        // rows in a list is faster than fetching and unzipping a workbook, so a
        // superseded render must stop rather than paint the previous file's
        // sheets over the current one. Per viewer, not per page: see _afterSeq.
        const stale = () => !host.alive();
        const fail = (why) => { if (!stale()) msg.textContent = why; };
        const toBytes = (b64) => Uint8Array.from(atob(String(b64).replace(/\s/g, '')), c => c.charCodeAt(0));

        try {
          // Two sources, the same pair the image and pdf modules read: a local
          // file was decoded by its host and arrives as a data: URI, a repo
          // file has to be fetched as bytes because the text pipeline destroyed
          // them on the way in.
          let bytes, size;
          const content = String(f.content || '').trim();
          const carried = /^data:[^;,]*;base64,([\s\S]*)$/.exec(content);
          if (carried) {
            bytes = toBytes(carried[1]);
            size = bytes.length;
          } else if (f.repo && f.name && window.gh) {
            const at = f.ref ? '?ref=' + encodeURIComponent(f.ref) : '';
            const data = await gh.req(`/repos/${f.repo}/contents/${f.name}${at}`);
            if (stale()) return;
            if (Array.isArray(data)) return fail('That path is a directory.');
            // Over 1 MB the contents API empties `content`; the blobs API
            // serves the same bytes by sha. Same fallback gh.bytes makes.
            const b64 = data.content || (await gh.req(`/repos/${f.repo}/git/blobs/${data.sha}`)).content;
            if (stale()) return;
            if (!b64) return fail('GitHub returned no bytes for that file.');
            bytes = toBytes(b64);
            size = typeof data.size === 'number' ? data.size : bytes.length;
          } else if (f.local) {
            return fail('This file is local and its bytes did not survive the trip. Drop it again to read it.');
          } else {
            return fail('No repo behind this file, so its bytes cannot be fetched.');
          }

          // gh.load honours ?use=, so a branch preview reads the branch's kit.
          // The CDN copy is the fallback for a page with no gh at all.
          if (!window.xlsxKit) {
            if (window.gh?.load) await gh.load('kits/xlsx.js');
            else await ViewRegistry.loadAsset('https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/lib/kits/xlsx.js');
          }
          if (stale()) return;

          let result;
          try {
            result = await window.xlsxKit.readZip(bytes);
          } catch (e) {
            return fail('That file did not open as a workbook. A .xlsx is a ZIP, so a truncated or renamed file fails here.');
          }
          if (stale()) return;

          const xl = result.xl;
          // Workbook order, not part-file order. They differ the moment a tab
          // has been dragged, and the reader means the order they see in Excel.
          const sheets = Object.entries(xl.sheets)
            .map(([key, s]) => ({ key, s }))
            .sort((a, b) => (a.s.index ?? 1e9) - (b.s.index ?? 1e9) || a.key.localeCompare(b.key));
          if (!sheets.length) return fail('That workbook has no worksheets.');

          const queries = xl.powerQuery?.sections?.length || 0;
          host?.report([
            `${sheets.length} sheet${sheets.length === 1 ? '' : 's'}`,
            queries ? `${queries} quer${queries === 1 ? 'y' : 'ies'}` : null,
            `${(size / 1024).toFixed(1)} KB`,
          ].filter(Boolean).join(' · '));

          msg.remove();
          const target = document.createElement('div');
          target.className = 'absolute inset-0';
          stage.replaceChildren(target);

          let table = null;
          const show = (i) => {
            const { key, s } = sheets[i];
            [...tabs.children].forEach((b, n) => b.classList.toggle('btn-active', n === i));
            // Formatted values: xl carries the number formats, so a date column
            // reads as dates rather than as five-digit serials.
            const rows = window.xlsxKit.sheetRows(s, xl);
            table?.destroy();
            table = null;
            if (!rows.length) {
              target.innerHTML = `<div class="p-4 text-sm text-base-content/50">${ViewRegistry.esc(s.name || key)} is empty.</div>`;
              return;
            }
            target.replaceChildren();
            try {
              table = new Tabulator(target, {
                data: rows,
                autoColumns: true,
                autoColumnsDefinitions: (defs) => defs.map(d => ({ ...d, headerFilter: 'input' })),
                layout: 'fitData',
                height: (target.clientHeight || 500) + 'px',
                // Applied to every sheet, not only the one the reference
                // opened on: a column the sheet does not have is a no-op in
                // Tabulator, so this narrows wherever it means something and
                // is silent everywhere else.
                ...ViewRegistry.headerFilter(host.opts),
              });
            } catch (e) {
              target.innerHTML = `<div class="p-4 text-error font-mono text-sm">Could not draw that sheet: ${ViewRegistry.esc(e.message)}</div>`;
            }
          };

          tabs.replaceChildren(...sheets.map(({ key, s }, i) => {
            const b = document.createElement('button');
            b.className = 'btn btn-xs';
            // A sheet the workbook never claimed keeps its part name, which is
            // the honest answer rather than a guessed label.
            b.textContent = s.name || key;
            b.title = `${s.cellCount} cell${s.cellCount === 1 ? '' : 's'}`;
            b.addEventListener('click', () => show(i));
            return b;
          }));
          tabs.classList.remove('hidden');
          tabs.classList.add('flex');

          // WHAT THE HOST CAN DO WITH THE SHEETS, published the way the pdf
          // module publishes its flow. The tabs above are this module's answer
          // to "which sheet", and they are the right answer inside a pane: one
          // row, always visible, fine at three sheets. They are the wrong one
          // on a phone at ten, which is why home's submittal page reads a
          // workbook one sheet per screen through a swipe deck instead.
          //
          // A deck cannot be built from the tabs, because a deck needs to know
          // how many sheets there are and what each is called BEFORE it opens,
          // and it drives which one is shown from outside. So the list and the
          // switch are what get published, and nothing about the deck itself:
          // whether to offer one, and what it looks like, belong to the host
          // that decided it wanted one.
          //
          // Named per mount rather than globally, since a page can hold three
          // viewers and each has its own workbook open.
          host.root.__sheets = {
            list: sheets.map(({ key, s: sh }) => ({
              name: sh.name || key, cellCount: sh.cellCount ?? 0,
            })),
            show: (i) => { if (!stale() && i >= 0 && i < sheets.length) show(i); },
          };

          requestAnimationFrame(() => { if (!stale()) show(0); });
        } catch (e) {
          fail('Could not read the workbook: ' + ((e && e.message) || String(e)));
        }
      }
    },
    {
      // WORD, for the same reason the workbook module exists: nothing in a
      // browser draws a .docx unaided, so without this the all-purpose viewer
      // sends the reader to a download for a whole class of document. It came
      // up against a packet of budget submittals where 30 of 70 files are
      // .docx, .xlsx or .xlsm, and the page reading them had grown its own
      // reader rather than gain one here.
      //
      // What it recovers, stated because the pane should not imply more
      // fidelity than it has: mammoth reads a .docx for its STRUCTURE and
      // discards the styling. Headings, lists, tables and emphasis survive.
      // Page breaks, fonts, headers and footers do not. That is the right
      // trade for a document read for what it says.
      id: 'docx', label: 'Document', icon: 'ph-file-doc',
      exclusive: true,
      // mammoth ships a UMD browser bundle rather than a module, so it is
      // loaded as a script and read off window. DOMPurify rides beside it on
      // the preview module's reasoning, which applies here in full: this puts
      // file content into THIS document via innerHTML, on an origin whose
      // localStorage holds a GitHub token, and the viewer now takes pasted
      // content as well as repo files.
      assets: [
        'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
        'https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js'
      ],
      test: (f) => f.ext === 'docx',
      // Every rule the rendered document gets is here, and deliberately plain:
      // this is a reading surface for somebody else's document, so styling of
      // ours would be a claim about how it looked. Tables get rules and tabular
      // numerals, the one place a default actively misleads, since a column of
      // right-aligned dollars is unreadable in proportional figures.
      render: () => `<div data-docx="root" class="h-full w-full overflow-auto bg-base-100">
        <style>
          [data-docx="body"] { font-size: 13px; line-height: 1.55; }
          [data-docx="body"] p { margin: .6em 0; }
          [data-docx="body"] h1, [data-docx="body"] h2, [data-docx="body"] h3 { font-weight: 600; margin: 1.1em 0 .4em; }
          [data-docx="body"] h1 { font-size: 1.25em; }
          [data-docx="body"] h2 { font-size: 1.1em; }
          [data-docx="body"] ul, [data-docx="body"] ol { margin: .6em 0; padding-left: 1.4em; }
          [data-docx="body"] ul { list-style: disc; }
          [data-docx="body"] ol { list-style: decimal; }
          [data-docx="body"] a { color: var(--color-primary); text-decoration: underline; }
          [data-docx="body"] table { border-collapse: collapse; margin: .8em 0; font-variant-numeric: tabular-nums; }
          [data-docx="body"] td, [data-docx="body"] th { border: 1px solid var(--color-base-300); padding: .25em .5em; vertical-align: top; }
          /* A WORD TABLE CELL HOLDS A SENTENCE, so it wraps, and the table is
             held to the pane rather than growing to its widest cell. This is
             the one place a document table and a SPREADSHEET table want
             opposite rules: a sheet cell holds a value and must NOT wrap,
             since a wrapped figure breaks its column. The case that settled
             it is an IT budget addendum whose every question table is prose,
             which without this ran off the side of the pane. */
          [data-docx="body"] table { width: 100%; table-layout: fixed; }
          [data-docx="body"] td { overflow-wrap: anywhere; }
          [data-docx="body"] img { max-width: 100%; height: auto; }
        </style>
        <div data-docx="msg" class="grid h-full place-items-center text-sm text-base-content/50">
          <span class="flex items-center gap-2"><span class="loading loading-spinner loading-sm"></span> Opening the document…</span>
        </div>
        <div data-docx="body" class="hidden px-4 py-3"></div>
      </div>`,
      after: async (f, host) => {
        const root = host?.root?.querySelector('[data-docx="root"]');
        if (!root) return;
        const msg = root.querySelector('[data-docx="msg"]');
        const body = root.querySelector('[data-docx="body"]');
        if (!msg || !body) return;

        // Same staleness guard the pdf and xlsx modules carry: switching rows
        // is faster than fetching and unzipping, so a superseded render must
        // stop rather than paint the previous file over the current one.
        const stale = () => !host.alive();
        const fail = (why) => { if (!stale()) msg.textContent = why; };
        const toBytes = (b64) => Uint8Array.from(atob(String(b64).replace(/\s/g, '')), c => c.charCodeAt(0));

        try {
          // The same two sources the image, pdf and xlsx modules read.
          let bytes;
          const carried = /^data:[^;,]*;base64,([\s\S]*)$/.exec(String(f.content || '').trim());
          if (carried) {
            bytes = toBytes(carried[1]);
          } else if (f.repo && f.name && window.gh) {
            const at = f.ref ? '?ref=' + encodeURIComponent(f.ref) : '';
            const data = await gh.req(`/repos/${f.repo}/contents/${f.name}${at}`);
            if (stale()) return;
            if (Array.isArray(data)) return fail('That path is a directory.');
            const b64 = data.content || (await gh.req(`/repos/${f.repo}/git/blobs/${data.sha}`)).content;
            if (stale()) return;
            if (!b64) return fail('GitHub returned no bytes for that file.');
            bytes = toBytes(b64);
          } else if (f.local) {
            return fail('This file is local and its bytes did not survive the trip. Drop it again to read it.');
          } else {
            return fail('No repo behind this file, so its bytes cannot be fetched.');
          }

          const lib = window.mammoth;
          if (!lib) return fail('The Word reader loaded but exported nothing.');

          let value;
          try {
            // Word embeds diagrams as EMF and WMF, Windows metafile formats no
            // browser draws. mammoth's default hands them through as an <img>
            // with a content type the browser rejects, which renders as a
            // broken-image icon: worse than nothing, because it reads as a
            // failure of this pane rather than as a format the web does not
            // have. Drawable types inline; anything else becomes nothing.
            const DRAWABLE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];
            ({ value } = await lib.convertToHtml({ arrayBuffer: bytes.buffer }, {
              convertImage: lib.images.imgElement(image =>
                image.read('base64').then(data => (
                  DRAWABLE.includes(image.contentType)
                    ? { src: 'data:' + image.contentType + ';base64,' + data }
                    : {}))),
            }));
          } catch (e) {
            return fail('That file did not open as a document. A .docx is a ZIP, so a truncated or renamed file fails here.');
          }
          if (stale()) return;

          body.innerHTML = window.DOMPurify ? DOMPurify.sanitize(value) : '';
          if (!window.DOMPurify) return fail('The sanitizer did not load, so the document was not rendered.');
          msg.classList.add('hidden');
          body.classList.remove('hidden');
        } catch (e) {
          fail('Could not read the document: ' + ((e && e.message) || String(e)));
        }
      }
    },
    {
      id: 'codepen', label: 'CodePen', icon: 'ph-codepen-logo',
      test: (f) => ['html', 'js', 'css'].includes(f.ext),
      assets: ['https://public.codepenassets.com/embed/index.js'],
      render: (f) => {
        const lang = ['html','css','js'].includes(f.ext) ? f.ext : 'html';
        return `<div data-cp="box" class="h-full w-full bg-base-100">
          <div class="codepen" data-version="2" data-prefill data-height="100%" data-theme-id="light" data-default-tab="${lang},result" style="height:100%; display:flex; align-items:center; justify-content:center;">
            <pre data-lang="${lang}">${ViewRegistry.esc(f.content)}</pre>
          </div>
        </div>`;
      },
      // The one module that still needs an id, because __CPEmbed takes a
      // SELECTOR STRING and so cannot be handed an element. It gets a unique
      // one per mount rather than the shared 'cpBox' it used to carry, which
      // two viewers would have collided on exactly as the pdf module did.
      after: (f, ctx) => {
        if (!window.__CPEmbed) return;
        const box = ctx?.root?.querySelector('[data-cp="box"]');
        if (!box || !ctx.alive()) return;
        box.id = 'cpBox-' + (ViewRegistry._cpSeq = (ViewRegistry._cpSeq || 0) + 1);
        const h = box.offsetHeight || box.parentElement.offsetHeight;
        const embed = box.querySelector('.codepen');
        if (h > 0) embed.setAttribute('data-height', h);
        __CPEmbed('#' + box.id + ' .codepen');
      }
    }
  ],
  // RFC4180-ish split: quoted fields, "" as an escaped quote, CRLF or LF rows.
  // Small enough to keep inline; adding a CSV library would put a download in
  // front of every consumer of this component for one mode.
  parseDelimited(text, ch) {
    const s = String(text).replace(/\r\n?/g, '\n');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c !== '"') { field += c; continue; }
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === ch) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  },
  // Rows for the table mode, from either shape. A delimited file's first row
  // is the header; a blank or duplicate header cell falls back to a positional
  // name so no column silently disappears into another.
  // A leading YAML block, removed. Shared rather than inlined because the
  // preview module is not the only thing that will read a markdown body, and
  // because the anchor is the part worth stating once: `^` with no multiline
  // flag, so only a fence that opens the file counts.
  stripFrontmatter(text) {
    return String(text ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  },

  tableRows(f) {
    if (f.ext === 'csv' || f.ext === 'tsv') {
      const rows = this.parseDelimited(f.content, f.ext === 'tsv' ? '\t' : ',');
      if (!rows.length) return [];
      const seen = new Set();
      const headers = rows[0].map((h, i) => {
        const base = String(h).trim();
        const key = base && !seen.has(base) ? base : 'col' + (i + 1);
        seen.add(key);
        return key;
      });
      return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
    }
    const parsed = JSON.parse(f.content);
    if (!Array.isArray(parsed)) throw new Error('expected a JSON array of records');
    return parsed;
  },
  // A lib file, from the loader when the page has one and from jsDelivr when
  // it does not. Lifted out of the xlsx and pdf modes, which each carried this
  // pair inline; the fallback exists because the viewer is embedded on pages
  // that never boot a gh chain.
  loadLib(path) {
    if (window.gh?.load) return gh.load(path);
    return this.loadAsset('https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/lib/' + path);
  },
  // A ghost icon button in the viewer's header idiom. One helper because the
  // header's own buttons are written in the template and a mode's are built
  // here, and two spellings of the same button is how a row stops looking like
  // a row.
  headerBtn(icon, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-square btn-ghost hover:text-primary';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = `<i class="ph text-lg ${icon}"></i>`;
    b.addEventListener('click', onClick);
    return b;
  },
  // The table mode's two header controls.
  //
  // A TOGGLE SHOWS ITS STATE IN THE GLYPH, which is the whole reason the
  // checkbox could move here at all. A checkbox says what it is in a word and
  // needs the word; an icon has to say it in the mark, so filters-on is the
  // solid funnel and filters-off is the struck-through one, and the tooltip
  // says which way a tap will move it. Anything that cannot pass that test
  // stays a labelled control and does not belong in this row.
  //
  // ON tableBuilt, NOT ON CONSTRUCTION. Tabulator builds asynchronously, so
  // getRows() straight after `new Tabulator` returns an empty array and the
  // count that decides whether to offer the deck at all would be 0 for every
  // table.
  mountTableControls(slot, table, target, f) {
    if (!slot) return;
    // A SEQUENCE, because clearing in switchMode is not enough on its own.
    // This module mounts from inside a requestAnimationFrame, so two rapid
    // switches interleave: clear, clear, append, append, and the row ends up
    // with two funnels and two decks. The clear cannot see a mount that has
    // not run yet; the token can, so each mount claims the slot and any older
    // one that wakes up afterwards finds it has been superseded and stops.
    // Same shape as data-explorer.js's `mine()` guard on its grids, and for
    // the same reason: Tabulator's build is asynchronous and destroy() does
    // not cancel it.
    const seq = (slot.__seq = (slot.__seq || 0) + 1);
    const live = () => slot.__seq === seq && slot.isConnected;
    let filters = true;
    const filterBtn = this.headerBtn('ph-funnel', 'Hide the header filters', () => {
      filters = !filters;
      target.querySelectorAll('.tabulator-header-filter').forEach(el => {
        el.style.display = filters ? '' : 'none';
      });
      const t = filters ? 'Hide the header filters' : 'Show the header filters';
      filterBtn.title = t;
      filterBtn.setAttribute('aria-label', t);
      filterBtn.querySelector('i').className =
        'ph text-lg ' + (filters ? 'ph-funnel' : 'ph-funnel-x');
      table.redraw(true);
    });
    slot.replaceChildren(filterBtn);

    const count = () => { try { return table.getRows('active').length; } catch { return 0; } };
    table.on('tableBuilt', async () => {
      if (!live() || !count()) return;   // superseded, or an empty table
      if (!window.swipeDeck) {
        try { await this.loadLib('kits/swipe-deck.js'); } catch (e) { return; }
      }
      const entry = window.swipeDeck?.entry;
      if (!entry || !live()) return;     // the await is the other place to lose the race
      const btn = entry({
        count: count(), noun: 'record', tone: 'ghost', size: 'md',
        onOpen: async () => {
          try {
            if (!window.recordDeck) await this.loadLib('kits/record-deck.js');
            window.recordDeck?.fromGrid(table, { title: f.name || 'Records' });
          } catch (e) { console.warn('record deck:', e?.message || e); }
        },
      });
      slot.append(btn);
      // The count is a promise about what tapping gives you, so it follows the
      // filters. A grid narrowed to three rows opens a deck of three, and a
      // button still offering 27 would be describing the file rather than the
      // deck.
      table.on('dataFiltered', () => {
        if (!live()) return;
        const n = count();
        const t = entry.title(n, 'record');
        btn.setAttribute('title', t);
        btn.setAttribute('aria-label', t);
        btn.disabled = !n;
      });
    });
  },
  getModes(file) { return this.modules.filter(m => m.test(file)); },
  // AN ADDRESSABLE ROW NARROWING, contributed by a host as `{ col, find }`.
  // Rendered as Tabulator's initialHeaderFilter rather than setFilter, so the
  // narrowing arrives IN the header input the reader can see and clear. A
  // filter applied invisibly is a table that silently disagrees with its own
  // row count, and the reader has no way back to the whole file.
  //
  // It exists because a reference can be about particular rows: home's
  // submittal page addresses a table as `…/vabs_fund.csv?col=Fund Approp
  // Type&find=600-6`, and without a way in, that page had to keep a private
  // table reader to honour it.
  headerFilter(opts) {
    const col = opts && opts.filter && opts.filter.col;
    const find = opts && opts.filter && opts.filter.find;
    return col && find ? { initialHeaderFilter: [{ field: String(col), value: String(find) }] } : {};
  },

  async prepare(moduleId) {
    const mod = this.modules.find(m => m.id === moduleId);
    if (mod?.assets) await Promise.all(mod.assets.map(asset => this.loadAsset(asset)));
    return mod;
  }
};

// Exposed so the registry can be inspected, unit-tested, or extended with a
// host-specific module without forking the component. The Alpine component
// below closes over it either way, so nothing here depends on the global.
window.ViewRegistry = ViewRegistry;

document.addEventListener('alpine:init', function() {
  Alpine.data('viewer', function(opts) {
    opts = opts || {};
    // Embedded hosts (the stage preview modal) opt out of the activeFile store
    // binding and drive show() directly, and set fill so the body grows to the
    // host's height instead of the Files page's fixed calc. Defaults preserve
    // the Files view exactly.
    const bindStore = opts.bindStore !== false;
    const bodyClass = opts.fill ? 'flex-1 min-h-0' : 'h-[calc(100vh-180px)]';
    // WHAT A HOST CONTRIBUTES TO ONE MODULE, keyed by module id:
    // `{ pdf: { start, onPaint, onMount } }`. Namespaced rather than flat
    // because the alternative is a factory option per module per hook, and the
    // module is what knows which hooks it has. A module that reads none of
    // this is unaffected, and a host that passes none gets today's behavior.
    //
    // It exists because a host can address a file more precisely than the file
    // knows: home's submittal page points at a table AND the rows a reference
    // is about. Today the only reader is ViewRegistry.headerFilter; the slot is
    // general because the alternative was a `filter` factory option that only
    // two of eleven modules would ever read.
    const moduleOpts = opts.modules || {};
    return {
      // The registry above is the list, so name it rather than a plausible one.
      // This line advertised an `image` mode for a long time before one existed.
      description: 'Multi-mode file viewer (raw, code, preview, table, tree, image, docx, xlsx) with ' +
        'pluggable render modules. The image and xlsx modules re-fetch the file as base64 through ' +
        "window.gh, since a binary's bytes do not survive the text pipeline, so they work in a " +
        'private repo too; they are the modules marked exclusive, which outranks a host\'s blanket ' +
        'defaultMode.',

      template: `
        <!-- data-sd-chrome marks this row as chrome that steps aside inside an
             immersive deck (kits/swipe-deck.js). Inert everywhere else, which
             is why it can be declared unconditionally: the component says what
             kind of thing the row is, and the host decides whether that
             matters. Without it the stage reader hid its own two bands and
             left this one sitting alone above the document, which is not full
             screen, it is one band instead of three. -->
        <div data-sd-chrome class="flex items-center justify-between mb-2 gap-2" x-show="file && identify">
          <!-- Wrapping is the last piece, and without it the row is simply
               over-subscribed at phone width: a filename, a stat line and three
               buttons do not fit across 390px, so the name was still being cut
               to "DP-ML…" after the truncation was pointed the right way.
               Wrapping lets the stats drop under the name and hands the name
               the row, which is the right thing to give a whole line to. -->
          <div class="flex items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-wrap">
            <!-- Truncating a PATH from the right drops the one part that
                 identifies it: at phone width this read "docs/…" for a file
                 whose name was the whole point. So the DIRECTORY gives way
                 first, the shape alpineComponents/file-review.js already uses
                 for a changed file's row.
                 The shrink FACTORS are what make it safe, and a plain shrink-0
                 on the name was not: a 38-character filename then refused to
                 give up anything and ran straight through the buttons to its
                 right. Weighting the directory at 9999 means it absorbs
                 essentially all of the shrinking, so the name is only ever
                 truncated once the directory is already gone, and it can still
                 be truncated rather than overflowing. The stats hold their
                 width outright, being short and the reason the row exists. -->
            <span class="text-sm sm:text-base font-mono min-w-0 flex items-baseline basis-full sm:basis-auto" :title="file">
              <!-- Gone entirely below sm, not merely shrunk. Weighted
                   shrinking does stop the directory from crowding the name,
                   but on a phone it does not stop at zero: a deep path was
                   cut to the single character "p" and an ellipsis, sitting in
                   front of the filename as though it were part of it. A stub
                   that short carries no information and costs legibility, so
                   the narrow screen gets the name alone and the full path
                   stays in the title. -->
              <span x-show="dirPart" class="hidden sm:inline opacity-50 truncate min-w-0 shrink-[9999]" x-text="dirPart"></span>
              <span class="truncate min-w-0 shrink" x-text="namePart"></span>
            </span>
            <span class="text-base text-base-content/50 font-mono whitespace-nowrap shrink-0" x-text="stats"></span>
          </div>
          <div class="flex items-center gap-0.5 shrink-0">
            <!-- WHERE A MODE PUTS ITS OWN CONTROLS, and the reason it is here
                 rather than inside the mode's own body. A mode that needs a
                 control had only one place to put it: a strip of its own above
                 the content. The table mode grew one, carrying a "Header
                 filters" checkbox, and it read as a second toolbar under the
                 first, in a different idiom (a labelled checkbox against a row
                 of icon buttons), costing a band of a phone screen to say one
                 thing. Two rows of chrome for one file is one too many.
                 The class is "contents" so the mode's buttons become siblings
                 of the copy and mode buttons and inherit this row's spacing,
                 rather than forming a box inside it. Filled imperatively by a
                 module's after() through ctx.controls, since the controls a table
                 offers depend on a grid that does not exist until Tabulator
                 has built it. Cleared by switchMode, so a control never
                 outlives the mode that put it there. -->
            <span data-view-controls class="contents"></span>
            <!-- NOT FOR A BINARY. copy() writes the viewer's text content,
                 which for a PDF or an image is the mangled UTF-8 decode of its
                 bytes, so the button was offering a screenful of replacement
                 characters as though it were the file. Same reason the header
                 line goes silent for a binary rather than deriving a lie from
                 that text (see the stats getter), and it takes a button out of
                 the row while it is at it. -->
            <button x-show="showCopy && !binaryMode" @click="copy()" class="btn btn-square btn-ghost hover:text-primary">
              <i class="ph text-lg" :class="copied ? 'ph-check' : 'ph-copy'"></i>
            </button>
            <details class="dropdown dropdown-end" data-auto-close>
              <summary class="btn btn-square btn-ghost hover:text-primary">
                <i class="ph text-lg" :class="modeIcon"></i>
              </summary>
              <ul class="dropdown-content z-[1] menu p-2 shadow-lg bg-base-200 rounded-box w-32 mt-1 border border-base-300">
                <template x-for="m in availableModes">
                  <li><a @click="switchMode(m.id)" :class="mode === m.id ? 'active' : ''">
                    <i class="ph" :class="m.icon"></i>
                    <span x-text="m.label"></span>
                  </a></li>
                </template>
              </ul>
            </details>
            <details x-show="fileUrls.length" class="dropdown dropdown-end" data-auto-close>
              <summary class="btn btn-square btn-ghost hover:text-primary">
                <i class="ph text-lg ph-arrow-square-out"></i>
              </summary>
              <ul class="dropdown-content z-[1] menu p-2 shadow-lg bg-base-200 rounded-box w-40 mt-1 border border-base-300">
                <template x-for="u in fileUrls">
                  <li><a :href="u.u" target="_blank">
                    <i class="ph" :class="u.i"></i>
                    <span x-text="u.l"></span>
                  </a></li>
                </template>
              </ul>
            </details>
          </div>
        </div>
        <div x-show="viewLoading" class="flex justify-center py-20">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>
        <div x-show="!viewLoading" class="${bodyClass} border border-base-300 rounded-lg bg-base-100 overflow-hidden">
          <div class="h-full" x-html="viewHtml"></div>
        </div>`,

      file: '',
      content: '',
      mode: '',
      // Set when the shown file came from somewhere other than the store's
      // open repo@ref (a cross-repo staged item): { repo, ref }. The repo/ref
      // getters prefer it, so the external links point at the file's true home.
      origin: null,
      // What a render module measured about the file, when it knows something
      // the host cannot derive from the text. Only the image module reports,
      // and only after its fetch; `stats` prefers it. Cleared by every show().
      meta: null,
      // WHERE ELSE THIS FILE OPENS, contributed by the active module and
      // concatenated into `fileUrls`. Third of the module hooks, beside
      // `report` (what the module measured) and `controls` (the header
      // buttons), and it exists for the same reason they do: a mode knows
      // something about the file that the host cannot derive, and the host
      // owns the place it is shown.
      //
      // A LINK RATHER THAN A BUTTON is the whole saving. The pdf module's
      // handoff to the workbench had a header button of its own, and the
      // open-elsewhere dropdown beside it was already the list of places this
      // file opens, carrying a `Toss render` row for HTML by exactly this
      // logic. Two controls for one idea, one of them a whole button.
      // Cleared by switchMode, so a link never outlives the mode that offered
      // it.
      modeLinks: [],
      viewLoading: false,
      commits: [],
      commitsFor: '',
      showCopy: opts.copy !== false,
      // WHETHER THIS VIEWER NAMES ITS OWN FILE. True everywhere it is the only
      // thing on the surface (the data view, the Files pane, a dropped file),
      // which is why it names the file at all. False where the HOST already
      // does, which in practice means inside the stage reader: swipe-deck's
      // header title is set per slide to the file being read, so the viewer's
      // header repeated it directly underneath and the reader saw one name
      // twice. The deck header is not "the set" and the viewer's "the file";
      // both are the file, and only one of them should say so.
      identify: opts.identify !== false,
      // The mode a freshly shown file opens in. Three forms, see resolveDefaultMode.
      defaultMode: opts.defaultMode || 'raw',
      copied: false,

      init() {
        this.$root.__viewer = this;
        this.$el.innerHTML = this.template;
        // `isConnected`: a viewer dropped within a tick of mounting would
        // otherwise init a detached tree, and every expression in the template
        // above throws against the popped scope. The pdf mode makes that
        // ordinary rather than exotic, since swipe-deck releases a slide once
        // the reader is two pages away. Diagnosed and explained in full at the
        // same guard in alpineComponents/file-review.js.
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        if (bindStore) this.$watch(
          () => Alpine.store('browser')?.activeFile,
          (f) => { if (f) this.show(f.path, f.content, f.origin); }
        );
      },

      get repo() { return this.origin?.repo || Alpine.store('browser')?.repo; },
      // THE LINK-BUILDING BOUNDARY, in lib/kits/repo-address.js's terms: an address
      // that names no @ref parses as '' (unspecified, so the contents API
      // resolves the repo's default branch), and '' is exactly what fileUrls
      // below cannot hold, since it yields blob//path and @/path. So the
      // fallback is resolved here, once, rather than guessed at parse time.
      // Prefer a default branch the shell actually scanned, and only for the
      // repo it scanned it for; 'main' is the last resort, not the first.
      get ref() {
        const store = Alpine.store('browser');
        const scanned = (repo) => (store && store.repo === repo && store.defaultRef) || '';
        if (this.origin) return this.origin.ref || scanned(this.origin.repo) || 'main';
        return (store && store.ref) || (store && store.defaultRef) || 'main';
      },
      get ext() { return this.file ? this.file.split('.').pop().toLowerCase() : ''; },
      // The path split so the header can let one half go and keep the other.
      // The slash rides with the DIRECTORY, so what is dropped is a whole
      // segment and the filename never arrives wearing a leading slash.
      get dirPart() { const i = this.file.lastIndexOf('/'); return i < 0 ? '' : this.file.slice(0, i + 1); },
      get namePart() { const i = this.file.lastIndexOf('/'); return i < 0 ? this.file : this.file.slice(i + 1); },
      // What a module is handed. `repo`/`ref`/`local` joined the trio when the
      // image module arrived: every module before it could work from the text,
      // and that one has to know WHERE the file is, because an image's bytes do
      // not survive the text pipeline and have to be fetched again. Reading the
      // resolved getters rather than `origin` keeps the ref-defaulting rule in
      // the one place that owns it.
      get fileContext() {
        return { name: this.file, ext: this.ext, content: this.content,
                 repo: this.origin?.local ? '' : (this.repo || ''),
                 ref: this.origin?.local ? '' : this.ref,
                 local: !!this.origin?.local };
      },
      get availableModes() { return ViewRegistry.getModes(this.fileContext); },
      get modeIcon() {
        const mod = ViewRegistry.modules.find(m => m.id === this.mode);
        return mod ? mod.icon : 'ph-text-t';
      },
      // Whether the open mode's file is BINARY: its bytes did not survive the
      // text pipeline, so the text this component holds is not the file. Two
      // modules declare it rather than the getters naming extensions, which is
      // what they used to do. The list was going to grow by one for every such
      // module, in two places, and the second place was already wrong for PDFs
      // before this: viewHtml asked isImage, so a PDF that arrived with empty
      // content rendered nothing at all rather than the pane that goes and
      // fetches its own bytes.
      get binaryMode() {
        return !!ViewRegistry.modules.find(m => m.id === this.mode)?.binary;
      },
      get stats() {
        // A module that measured the file outranks the text: for an image the
        // "lines" are however many newline bytes fall in the binary and the KB
        // is the size of the mangled decode, both false. This line goes silent
        // for a binary rather than lie, and speaks again when the module has
        // fetched real bytes and reported true numbers.
        if (this.meta) return this.meta;
        if (this.binaryMode) return '';
        if (!this.content) return '';
        return this.content.split('\n').length + ' lines · ' + (new Blob([this.content]).size / 1024).toFixed(1) + ' KB';
      },
      get viewHtml() {
        // A binary is the one kind whose pane is worth drawing with no content
        // behind it: the module fetches its own bytes, so empty text is a
        // normal state rather than nothing to show.
        if (!this.file) return '';
        if (!this.content && !this.binaryMode) return '';
        const mod = ViewRegistry.modules.find(m => m.id === this.mode) || ViewRegistry.modules[0];
        return mod.render(this.fileContext);
      },
      get fileUrls() {
        // A local-only file (origin.local, e.g. a dropped file in the stage
        // preview) has no GitHub home, so it gets no repo links.
        if (this.origin?.local) return [];
        const r = this.repo;
        const ref = this.ref;
        if (!r || !this.file) return [];
        const urls = [
          { l: 'GitHub', i: 'ph-github-logo', u: 'https://github.com/' + r + '/blob/' + ref + '/' + this.file },
          { l: 'Raw',    i: 'ph-file-text',   u: 'https://raw.githubusercontent.com/' + r + '/' + ref + '/' + this.file },
          { l: 'CDN',    i: 'ph-cloud-arrow-down', u: 'https://cdn.jsdelivr.net/gh/' + r + '@' + ref + '/' + this.file }
        ];
        // HTML in an allowlisted repo also opens live at this ref via
        // toss-render's address mode (same-origin, so its lib chain works —
        // unlike the Preview mode's opaque blob iframe).
        if (this.ext === 'html' && r.split('/')[0] === 'mehrlander') {
          urls.push({ l: 'Toss render', i: 'ph-disc',
            u: 'https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=' + r + '@' + ref + ':' + this.file });
        }
        // The active mode's own, last: a module's row is about this file read
        // THIS way, so it belongs under the three that are true of any file.
        return urls.concat(this.modeLinks);
      },

      // Resolve which of the available modes a freshly shown file opens in.
      // `defaultMode` accepts three forms, in increasing generality:
      //   string    'preview'                              one mode for every file
      //   ext map   { md: 'preview', json: 'tree', '*': 'raw' }   keyed by extension, '*' catch-all
      //   function  (file) => modeId                       file is { name, ext, content },
      //                                                    so it can key on size (content.length), etc.
      // The resolved id is honored only when that mode is actually available for
      // the file (its module test() passed); otherwise it falls back to raw, then
      // to the first available mode. A map/function may return a falsy value to
      // defer to that same fallback.
      //
      // An EXCLUSIVE available mode outranks all of that. Images claimed it
      // first and workbooks claim it now, and the two make the same argument: a
      // host that sets `defaultMode: 'raw'` for its file view is saying how to
      // open a text file, since that is the only kind it had; it cannot
      // distinguish that from asking for a PNG's mangled bytes, or a ZIP's, as
      // text, which nobody has ever wanted. So a module that alone can display
      // the file wins, and the mode strip still offers raw one tap away. A
      // caller naming the exclusive mode explicitly gets the same answer, so
      // the rule only ever redirects a default.
      //
      // Exclusive modes are mutually exclusive by construction, since each
      // tests a disjoint set of extensions; the find below takes the first if
      // that ever stops being true.
      resolveDefaultMode(file, modes) {
        const only = modes.find(m => m.exclusive);
        if (only) return only;
        const dm = this.defaultMode;
        let id;
        try {
          if (typeof dm === 'function') id = dm(file);
          else if (dm && typeof dm === 'object') id = dm[file.ext] ?? dm['*'];
          else id = dm;
        } catch (e) { id = null; }
        return modes.find(m => m.id === id) || modes.find(m => m.id === 'raw') || modes[0];
      },

      async show(file, content, origin) {
        this.file = file;
        this.content = content;
        this.origin = origin || null;
        // Anything a module published about the LAST file, dropped before the
        // next one loads. A host reading __sheets between the show() and the
        // module's mount would otherwise get the previous workbook's tabs and
        // a switch that moves a table nobody is looking at.
        this.$root.__sheets = null;
        this.meta = null;
        this.modeLinks = [];
        this.commits = [];
        this.commitsFor = '';
        this.viewLoading = true;
        const modes = this.availableModes;
        const preferred = this.resolveDefaultMode(this.fileContext, modes);
        await this.switchMode((preferred || modes[0]).id);
      },

      // WHICH after() IS STILL THE CURRENT ONE, per viewer instance. This was
      // a counter on the REGISTRY, which is a singleton, so it answered "the
      // most recent call anywhere on the page" and not "the most recent call
      // in this viewer". One viewer could not tell the difference; three can,
      // and the stage reader mounts three (the deck builds the reader's slide
      // and its neighbours). Each new mount bumped the shared counter, so the
      // viewers already in flight read themselves as superseded and stopped at
      // their next await, leaving a slide on "Reading the PDF…" for good.
      _afterSeq: 0,

      async switchMode(id) {
        this.viewLoading = true;
        // Before the new mode mounts, not after: a control belongs to one mode,
        // and the raw view inheriting the table view's filter toggle would be
        // a button that operates something no longer on screen.
        // Found by attribute rather than through $refs, the same way openUrls
        // reaches its dialog: this template is injected as a string, so an
        // x-ref on it is not registered and $refs.controls reads undefined,
        // which is a slot that silently never fills rather than an error.
        this.controlSlot()?.replaceChildren();
        this.modeLinks = [];
        const mod = await ViewRegistry.prepare(id);
        this.mode = id;
        const seq = ++this._afterSeq;
        this.$nextTick(() => {
          // `after` gets a way back, not just the file. Only one module needs
          // `report`: the image module learns the file's REAL byte count and
          // pixel size when it fetches, facts the host cannot derive from the
          // text it holds and had been printing wrongly. Anything a module
          // reports is scoped to the file on screen and cleared by the next
          // show().
          //
          // `root` and `alive` are what make a module SAFE TO MOUNT TWICE, and
          // both were missing. A module used to find its own markup with
          // document.getElementById, which is a page-wide question with one
          // answer, so the second viewer on a page rendered into the FIRST
          // one's DOM: its pager, its page count, its byte size and its canvas
          // all landed on a slide showing a different document, and its own
          // slide was never touched. `root` is this viewer's element, and
          // `alive` is this call's own claim on it.
          if (mod.after) mod.after(this.fileContext, {
            report: (m) => { this.meta = m || null; },
            links: (list) => { this.modeLinks = Array.isArray(list) ? list : []; },
            controls: this.controlSlot(),
            root: this.$root,
            alive: () => this._afterSeq === seq && this.$root.isConnected,
            // This module's slice of the host's contributions, never the whole
            // bag: a module has no business reading another's options.
            opts: moduleOpts[id] || {},
          });
          this.viewLoading = false;
        });
      },

      controlSlot() { return this.$root.querySelector('[data-view-controls]'); },

      openUrls() {
        const el = this.$root.querySelector('dialog.viewer-urls');
        if (el) el.showModal();
      },

      async copy() {
        if (!this.content) return;
        await navigator.clipboard.writeText(this.content);
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 1500);
      }
    };
  });
});
