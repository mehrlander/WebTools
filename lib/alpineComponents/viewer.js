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
  isDocument(ext) { return ext === 'docx'; },

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
    if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
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
    return this.KIND_VIEW[this.KIND(f)] || 'code';
  },

  // WHAT KIND OF CONTENT A FILE IS, which is the question READ_MODE was
  // answering without naming. Splitting the two is what lets one answer serve
  // three readers: the mode this opens in, the toss route that addresses it,
  // and the units a note can be pinned to inside it. docs/routes-kinds.csv
  // owns the table and joins those three columns to the tables beside it;
  // tools/test/routes-manifest.test.mjs holds this classifier to its rows.
  //
  // THE EXCLUSIVE KINDS ARE ANSWERED FIRST AND THEIR VIEW IS NEVER READ.
  // resolveDefaultMode returns an exclusive module before it ever calls
  // defaultMode, so a PNG's answer here is unused either way. It is stated
  // rather than left to fall through to 'code', because a classifier whose
  // answer for four kinds is wrong-but-ignored is a trap for the next reader.
  //
  // JSON asks a second question the extension cannot answer: an array of
  // records IS a table and reads as one, while any other JSON reads as a tree.
  // Deciding on the extension alone gave a pasted row array a tree. Three
  // implementations of that one test were live on 2026-08-31: this one, the
  // table module's own availability test (first character only), and
  // pages/data-view.html's AUTO_VIEW (first character only). The 2026-08-18
  // note here recorded the drift and fixed one side. All three read isRowArray
  // now.
  KIND(f) {
    const ext = f.ext;
    if (this.isImage(ext)) return 'image';
    if (this.isPdf(ext)) return 'pdf';
    if (this.isWorkbook(ext)) return 'workbook';
    if (ext === 'docx') return 'document';
    if (ext === 'html') return 'page';
    if (ext === 'md') return 'markdown';
    if (ext === 'json') return this.isRowArray(f.content) ? 'records' : 'tree';
    if (ext === 'csv' || ext === 'tsv') return 'delimited';
    return 'code';
  },

  // A kind's resting view. `page` reads as `code` on purpose: a browser over a
  // repo is showing SOURCE, and an .html file that rendered itself instead
  // would be answering a question nobody asked there. Preview is one tap away,
  // and the way a page is meant to be SHOWN is a toss, which is the shown_by
  // column rather than this one.
  KIND_VIEW: {
    page: 'code', markdown: 'preview', records: 'table', tree: 'tree',
    delimited: 'table', code: 'code', image: 'image', pdf: 'pdf',
    workbook: 'sheet', document: 'page',
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
      // Highlight, then declare. The order is load-bearing in one direction
      // only: highlighting rewrites the box's children and would drop nothing,
      // since the declaration lives on the box itself, but the source has to be
      // the file as fetched and Prism never changes a character of it.
      after: (f, ctx) => {
        if (window.Prism) {
          // JSDELIVR, AND THE SAME PACKAGE THE CORE CAME FROM. The cdnjs
          // path this used has no version segment, which that CDN requires:
          // every language the autoloader asked for 404'd, so a code pane
          // highlighted only what Prism's core bundles (markup, css, clike,
          // javascript) and .py, .go, .rb, .rs and .sql rendered plain.
          // Measured 2026-08-31: the unversioned path 404s and
          // .../prism/1.29.0/components/prism-javascript.min.js 200s. Pointing
          // at npm/prismjs here rather than pinning a cdnjs version keeps both
          // halves resolving from the one package the assets line above loads,
          // so they cannot drift to different Prism versions.
          Prism.plugins.autoloader.languages_path = 'https://cdn.jsdelivr.net/npm/prismjs/components/';
          Prism.highlightAll();
        }
        // A note anywhere in here then reads `lib/kits/peek.js:340-360` rather
        // than a css path. kits/code-doc.js carries the reasoning; the pair is
        // loaded the same way the preview module loads md-doc's.
        const go = () => {
          if (ctx?.alive?.() === false || !window.codeDoc) return;
          const box = (ctx?.root || document).querySelector('code');
          if (!box) return;
          const addr = f.repo && f.ref
            ? { repo: f.repo, ref: f.ref, path: f.name,
                url: `https://github.com/${f.repo}/blob/${f.ref}/${f.name}` }
            : {};
          window.codeDoc.declare(box, { source: f.content, addr });
        };
        if (window.codeDoc) go();
        else window.gh?.load('kits/src-doc.js')
          .then(() => window.gh.load('kits/code-doc.js')).then(go).catch(() => {});
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
        // The column is UNCAPPED and flush left, which is daisy-alpine rule 3:
        // the pane sets the width, the text does not set its own. It carried
        // `mx-auto` over the typography plugin's 65ch measure until 2026-09-03,
        // on the reading that the measure was a considered value and centering
        // was the tidy way to spend a wide pane. What that produced was a 506px
        // column adrift in a 1118px pane with dead space on both sides, and it
        // was the second of two corridors down one screen: the Files pane's own
        // max-w-7xl cap was the first.
        //
        // THE BANG IS THE WHOLE FIX and a plain `max-w-none` is not. Tailwind v4
        // emits utilities into `@layer utilities` while the typography plugin's
        // stylesheet is UNLAYERED, and an unlayered declaration beats a layered
        // one whatever the specificity or source order; `!max-w-none` emits
        // `!important`, which no cascade layer can outrank. An inline style also
        // reaches, and this file used to claim it was the only thing that did.
        // Measured 2026-09-03 in Chromium against the CDN pair the app loads
        // (typography.min.css by <link>, @tailwindcss/browser@4): bare `prose`
        // 506px, `prose max-w-none` 506px, `prose !max-w-none` uncapped.
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
        // Two elements and not one, per the scrollbar note above: the PANE
        // scrolls and the column is its child. The width override rides the
        // column, in the `!max-w-none` form the note argues for.
        // tools/test/viewer.test.mjs holds both.
        return `<div class="overflow-auto h-full w-full bg-base-100">
          <div class="prose prose-sm !max-w-none px-6 py-4">${body}</div>
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
      //
      // IT DECLARES, which containment alone never did. The kit was loaded here
      // and used for its narrowest job, so this pane rendered markdown and
      // announced nothing: opening a .md file through #data= got no heading
      // menus and no Section aim, while the same file in the file deck got
      // both. Nothing reported it, because a declaration that never happens
      // looks exactly like a page with no markdown on it. enhance() contains
      // the tables as a first step, so this is the same call doing more.
      //
      // The STRIPPED text goes in, not f.content: it is what was parsed, and a
      // section's line numbers are counted against it. Passing the original
      // would offset every reference by the frontmatter.
      after: (f, ctx) => {
        if (f.ext !== 'md') return;
        const box = () => (ctx?.root || document).querySelector('.prose');
        const go = () => {
          if (!window.mdDoc || ctx?.alive?.() === false) return;
          const el = box();
          if (!el) return;
          const addr = f.repo && f.ref
            ? { repo: f.repo, ref: f.ref, path: f.name,
                url: `https://github.com/${f.repo}/blob/${f.ref}/${f.name}` }
            : {};
          window.mdDoc.enhance(el, ViewRegistry.stripFrontmatter(f.content), { addr });
        };
        if (window.mdDoc) go();
        else window.gh?.load('kits/src-doc.js')
          .then(() => window.gh.load('kits/md-doc.js')).then(go).catch(() => {});
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
      test: (f) => (f.ext === 'json' && ViewRegistry.isRowArray(f.content)) ||
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
            ViewRegistry.showHeaderFilter(table, ctx.opts);
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

          // ── find: Ctrl+F for a canvas the browser's own find cannot read ───
          //
          // The page is rasterised, so there is no DOM text to search; the kit
          // searches the extracted items instead (look.find) and the flow lays
          // the highlight over the canvas (mount.find / findGo). This is the
          // chrome for it: a magnifier that opens a small bar, the same floating
          // idiom as the pager, and bound to the STAGE for the same reason the
          // jump list is, so emptying the slide takes every listener with it.
          const findToggle = (() => {
            const b = document.createElement('button');
            b.type = 'button';
            b.title = 'Find in document';
            b.dataset.pdf = 'findtoggle';
            b.className = 'viewer-pdf-findtoggle absolute right-3 top-3 z-20 btn btn-xs btn-circle '
                        + 'border-base-300 bg-base-100/90 shadow-lg backdrop-blur';
            b.innerHTML = '<i class="ph ph-magnifying-glass"></i>';
            stage.append(b);
            return b;
          })();
          const findBar = (() => {
            const wrap = document.createElement('div');
            wrap.dataset.pdf = 'findbar';
            wrap.className = 'viewer-pdf-findbar hidden absolute right-3 top-3 z-30 '
                           + 'flex items-center gap-1 rounded-full border border-base-300 '
                           + 'bg-base-100/90 px-1.5 py-1 shadow-lg backdrop-blur';
            wrap.innerHTML = `
              <i class="ph ph-magnifying-glass text-base-content/50 pl-1"></i>
              <input data-pdf="findinput" type="text" placeholder="Find" spellcheck="false"
                     class="input input-xs w-32 border-0 bg-transparent px-1 focus:outline-none" />
              <span data-pdf="findcount" class="min-w-[3.5rem] px-1 text-center font-mono text-xs
                    tabular-nums text-base-content/50"></span>
              <button data-pdf="findprev" type="button" title="Previous match"
                      class="btn btn-xs btn-circle btn-ghost"><i class="ph ph-caret-up"></i></button>
              <button data-pdf="findnext" type="button" title="Next match"
                      class="btn btn-xs btn-circle btn-ghost"><i class="ph ph-caret-down"></i></button>
              <button data-pdf="findclose" type="button" title="Close (Esc)"
                      class="btn btn-xs btn-circle btn-ghost"><i class="ph ph-x"></i></button>`;
            stage.append(wrap);
            return wrap;
          })();
          const findInput = el('findinput'), findCount = el('findcount');
          const findPrev = el('findprev'), findNext = el('findnext'), findClose = el('findclose');

          let findResult = { count: 0 }, findSeq = 0, findTimer = 0;
          const showCount = () => {
            const n = mount.findCount();
            if (!findInput.value.trim()) { findCount.textContent = ''; }
            else if (!n) { findCount.textContent = 'None'; }
            else { findCount.textContent = `${mount.activeFind() + 1}/${n}`; }
            const none = !n;
            if (findPrev) findPrev.disabled = none;
            if (findNext) findNext.disabled = none;
          };
          // Each run carries a token: a slow document parsed while the reader
          // keeps typing must not let an older query's hits land over a newer.
          const runSearch = async (q) => {
            const mine = ++findSeq;
            if (!q.trim()) { mount.findClear(); findResult = { count: 0 }; showCount(); return; }
            let res;
            try { res = await look.find(q); } catch { return; }
            if (stale() || mine !== findSeq) return;
            findResult = res;
            mount.find(res.hits, 0);
            if (res.count) mount.findGo(0);
            showCount();
          };
          findInput.addEventListener('input', () => {
            clearTimeout(findTimer);
            findTimer = setTimeout(() => { if (!stale()) runSearch(findInput.value); }, 160);
          });
          const step = (d) => { if (mount.findCount()) { mount.findGo(mount.activeFind() + d); showCount(); } };
          findNext.addEventListener('click', () => step(1));
          findPrev.addEventListener('click', () => step(-1));
          findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
            // Keep typing from reaching the stage's own key handling.
            e.stopPropagation();
          });
          const openFind = () => {
            findBar.classList.remove('hidden');
            findToggle.classList.add('hidden');
            findInput.focus();
            findInput.select();
            if (findInput.value.trim()) runSearch(findInput.value);
          };
          const closeFind = () => {
            clearTimeout(findTimer);
            findSeq++;
            mount.findClear();
            findBar.classList.add('hidden');
            findToggle.classList.remove('hidden');
            findCount.textContent = '';
          };
          findToggle.addEventListener('click', openFind);
          findClose.addEventListener('click', closeFind);

          // Ctrl/Cmd+F opens it, over the browser's own find, but only while the
          // reader is in this pane: the listener is on the stage, and a click in
          // the reader is steered to focus the stage so the shortcut lands here
          // rather than opening a native find that would search a canvas and
          // find nothing. Bound to the stage, never the document, so it dies
          // with the slide (the jump list's comment above is the full argument).
          stage.tabIndex = 0;
          stage.style.outline = 'none';
          stage.addEventListener('pointerdown', (e) => {
            if (!findBar.contains(e.target) && !findToggle.contains(e.target)) {
              stage.focus({ preventScroll: true });
            }
          }, true);
          stage.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
              e.preventDefault();
              openFind();
            }
          });
        } catch (e) {
          fail('Could not read the PDF: ' + ((e && e.message) || String(e)));
        }
      }
    },
    {
      // A WORKBOOK AS A PAGE. The grid below this reads a sheet as data; this
      // reads it as a document: merges as spans, the author's column widths and
      // row heights, and every cell painted with the font, fill, border and
      // alignment its style names. It is the default for a workbook because
      // most of what this estate opens are OFM's budget FORMS, where the
      // banding and the ruled boxes are not decoration but the thing that says
      // which cells an agency is meant to fill in.
      //
      // Both readings stay, because they answer different questions and the
      // right one depends on the sheet, not on a preference. A fee-code
      // reference with 94,000 cells wants sorting and a header filter; a
      // two-column form wants to look like the form. The mode strip carries
      // both and this one opens first.
      //
      // `exclusive` for the reason images and PDFs are: a host's blanket
      // defaultMode ('raw' in show-repo's file view) cannot tell "raw for a
      // text file" from "raw for a ZIP".
      id: 'sheet', label: 'Sheet', icon: 'ph-microsoft-excel-logo',
      exclusive: true,
      test: (f) => ViewRegistry.isWorkbook(f.ext),
      render: () => `<div data-sheet="root" class="h-full w-full flex flex-col bg-base-200">
        <div data-sheet="tabs" class="hidden shrink-0 flex-wrap items-center gap-1 px-2 py-1.5 border-b border-base-300 bg-base-100"></div>
        <div data-sheet="stage" class="flex-1 min-h-0 relative">
          <div data-sheet="msg" class="absolute inset-0 grid place-items-center text-sm text-base-content/50">
            <span class="flex items-center gap-2"><span class="loading loading-spinner loading-sm"></span> Opening the workbook…</span>
          </div>
        </div>
      </div>`,
      after: async (f, host) => {
        const root = host?.root?.querySelector('[data-sheet="root"]');
        if (!root) return;
        const el = (k) => root.querySelector(`[data-sheet="${k}"]`);
        const stage = el('stage'), msg = el('msg'), tabs = el('tabs');
        if (!stage || !msg) return;
        const stale = () => !host.alive();
        const fail = (why) => { if (!stale()) msg.textContent = why; };

        try {
          const { xl, sheets, size } = await ViewRegistry.openWorkbook(f, host);
          if (stale()) return;
          if (!sheets.length) return fail('That workbook has no worksheets.');

          const queries = xl.powerQuery?.sections?.length || 0;
          host?.report([
            `${sheets.length} sheet${sheets.length === 1 ? '' : 's'}`,
            queries ? `${queries} quer${queries === 1 ? 'y' : 'ies'}` : null,
            `${(size / 1024).toFixed(1)} KB`,
          ].filter(Boolean).join(' · '));

          msg.remove();
          const pane = document.createElement('div');
          pane.className = 'absolute inset-0 overflow-auto';
          stage.replaceChildren(pane);

          let current = -1;
          const show = (i, opts) => {
            const { key, s } = sheets[i];
            [...tabs.children].forEach((b, n) => b.classList.toggle('btn-active', n === i));
            // Assigned rather than scrollTo(), which jsdom does not implement and
            // which would throw inside the mount the tests drive.
            pane.scrollTop = 0; pane.scrollLeft = 0;
            pane.replaceChildren(ViewRegistry.drawSheet(s, xl, key, opts));
            current = i;
          };

          // WHERE A CITE LANDS. Three ways in, and they compose: a sheet name,
          // a cell address, and a phrase. A phrase with no sheet searches every
          // sheet, which is the thing a host cannot do for itself without
          // drawing each one; a cell address is resolved through the merges,
          // since a covered cell is never emitted and `H11` inside a merged
          // block has to land on the block.
          const locate = async (address) => {
            if (stale()) return null;
            const want = ViewRegistry.readPlace(address, sheets);
            const named = (i) => sheets[i].s.name || sheets[i].key;

            let idx = current < 0 ? 0 : current;
            if (want.sheet) {
              const n = ViewRegistry.sheetIndex(sheets, want.sheet);
              if (n < 0) return null;
              idx = n;
            }
            if (want.text) {
              // Only where the sheet was not named: a cite that says which
              // sheet means that sheet, even if the phrase also appears on
              // another one.
              const needle = ViewRegistry.normText(want.text);
              const holds = ({ s }) => (s.rows || []).some(r =>
                Object.values(r.cells).some(v => ViewRegistry.normText(v).includes(needle)));
              if (!want.sheet) {
                const n = holds(sheets[idx]) ? idx : sheets.findIndex(holds);
                if (n >= 0) idx = n;
              }
            }

            // A REDRAW ONLY WHERE THE ADDRESS IS OUT OF REACH, and reach is how
            // far this draw GOT rather than how many rows the sheet has. The
            // two differ exactly when the cap bit, which is the only case that
            // needs the redraw: the fee-code sheet has 11,829 rows and draws
            // 2,000, so a cite on row 5,000 compared itself against 11,829,
            // decided it was already covered, and missed.
            const row = want.cell ? Number(/(\d+)$/.exec(want.cell)?.[1]) : 0;
            const drawnTo = Number(pane.querySelector('tbody tr:last-child th')?.textContent) || 0;
            if (idx !== current || (row && row > drawnTo)) {
              show(idx, row ? { reach: row } : undefined);
            }
            const here = named(idx);
            if (!want.cell && !want.text) return { sheet: here, cell: null };

            let el = null;
            if (want.cell) {
              el = pane.querySelector(`[data-c="${want.cell}"]`);
              if (!el) {
                // Covered by a merge: the block's anchor is what is drawn.
                const col = [...want.cell.replace(/\d+$/, '')]
                  .reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
                const m = (sheets[idx].s.merges || []).find(x =>
                  row >= x.r1 && row <= x.r2 && col >= x.c1 && col <= x.c2);
                if (m) el = pane.querySelector(`[data-c="${window.xlsxKit.colLetter(m.c1)}${m.r1}"]`);
              }
            } else {
              const needle = ViewRegistry.normText(want.text);
              for (const td of pane.querySelectorAll('td')) {
                if (!ViewRegistry.normText(td.textContent).includes(needle)) continue;
                // Shortest wins: a heading is a substring of the paragraph
                // quoting it, and the heading is what was cited.
                if (!el || td.textContent.length < el.textContent.length) el = td;
              }
            }
            if (!el) return { sheet: here, cell: null };
            ViewRegistry.landOnCell(pane, el);
            return { sheet: here, cell: el.getAttribute('data-c') };
          };

          ViewRegistry.mountSheetTabs(tabs, sheets, show);
          ViewRegistry.publishSheets(host, sheets, show, stale, locate);
          show(0);

          // EVERY NOTE IN THE WORKBOOK, TOGETHER. Excel shows a comment on the
          // cell it sits on, one at a time, on hover, so a sheet carrying
          // guidance is read by wandering over it hoping to find them all. The
          // list is the other reading, and it is only useful because the cite
          // it hands back lands: tapping a row is a `locate` on that cell.
          //
          // In the mode's control slot rather than as a mode of its own: a
          // reader wants the sheet underneath, so that landing on a cell means
          // seeing it in place.
          ViewRegistry.mountNotesPanel(host, xl, root, locate);
        } catch (e) {
          fail(e?.reader ? e.message : 'Could not read the workbook: ' + ((e && e.message) || String(e)));
        }
      }
    },
    {
      // THE SAME WORKBOOK AS DATA: one row per row, one column per column,
      // sortable and filterable. It was the only workbook view until
      // 2026-09-04, and it stays because a sheet that IS a table is better read
      // this way than as a picture of one.
      //
      // Not `exclusive`, because the sheet module above is: two exclusive
      // modules testing the same extension would make resolveDefaultMode's
      // "take the first" arbitrary. `claims` is how it takes the default back
      // for the one case that is genuinely its own, a narrowed reference.
      //
      // Keeps the id `xlsx`, which is a host contract rather than a name: a
      // page contributes options per module id (home's submittal page passes
      // `xlsx: { filter }` for `?col=&find=` references), and renaming it would
      // silently drop the narrowing on the floor.
      id: 'xlsx', label: 'Grid', icon: 'ph-table',
      assets: [
        'https://unpkg.com/tabulator-tables@6.3.0/dist/css/tabulator_simple.min.css',
        'https://unpkg.com/tabulator-tables@6.3.0/dist/js/tabulator.min.js'
      ],
      test: (f) => ViewRegistry.isWorkbook(f.ext),
      // A `?col=&find=` reference names ROWS, and rows are what this mode can
      // narrow to. Opening the sheet render there would show the whole form
      // with the reference's whole point discarded.
      claims: (f, opts) => ViewRegistry.isWorkbook(f.ext) && !!(opts?.filter?.col && opts?.filter?.find),
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

        try {
          const { xl, sheets, size } = await ViewRegistry.openWorkbook(f, host);
          if (stale()) return;
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
          let current = -1;
          // WHEN THE ROWS EXIST, which is not when the table is constructed.
          // Tabulator builds asynchronously, so a host calling locate() the
          // moment show() resolves asked a table with no rows in it and was
          // told the cite missed. Raced against a timeout so a build that never
          // completes cannot hang the caller instead.
          let built = Promise.resolve();
          const show = (i) => {
            const { key, s } = sheets[i];
            current = i;
            [...tabs.children].forEach((b, n) => b.classList.toggle('btn-active', n === i));
            // Formatted values: xl carries the number formats, so a date column
            // reads as dates rather than as five-digit serials and a currency
            // column reads as money.
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
                // NOT autoColumns, which builds fields from data[0] ALONE. A
                // sheet whose first row is a title in column A got a
                // one-column grid and silently dropped every other column:
                // the WaTech IT workbook drew its year header as FY2027,
                // FY2030, FY2031 because E and F were missing from row 1, and
                // the prioritization worksheet's instructions, all of which
                // live in column B, did not appear at all.
                columns: ViewRegistry.sheetFields(rows).map(field => ({
                  title: field, field,
                  headerFilter: 'input',
                  // Without a cap, layout:'fitData' sizes a column to its
                  // longest cell: one 300-character sentence in column A made
                  // the DP Addendum 5,647px wide and pushed B through M off
                  // the right edge behind a scrollbar nobody finds.
                  maxWidth: 420,
                  tooltip: true,
                })),
                layout: 'fitData',
                height: (target.clientHeight || 500) + 'px',
                // Applied to every sheet, not only the one the reference
                // opened on: a column the sheet does not have is a no-op in
                // Tabulator, so this narrows wherever it means something and
                // is silent everywhere else.
                ...ViewRegistry.headerFilter(host.opts),
              });
              built = Promise.race([
                new Promise(r => table.on('tableBuilt', r)),
                new Promise(r => setTimeout(r, 2000)),
              ]);
              ViewRegistry.showHeaderFilter(table, host.opts);
            } catch (e) {
              target.innerHTML = `<div class="p-4 text-error font-mono text-sm">Could not draw that sheet: ${ViewRegistry.esc(e.message)}</div>`;
            }
          };

          // THE GRID'S ANSWER TO THE SAME CONTRACT, at the granularity it has.
          // A cell is a Tabulator div this cannot address, so a cite lands on
          // the ROW and says so by returning the row rather than the cell. A
          // host that switched modes keeps a working cite instead of a silent
          // one, which is the whole reason both modes publish the same thing.
          const locate = async (address) => {
            if (stale() || !table) return null;
            const want = ViewRegistry.readPlace(address, sheets);
            let idx = current < 0 ? 0 : current;
            if (want.sheet) {
              const n = ViewRegistry.sheetIndex(sheets, want.sheet);
              if (n < 0) return null;
              idx = n;
            }
            if (idx !== current) show(idx);
            await built;
            if (stale()) return null;
            const here = sheets[idx].s.name || sheets[idx].key;

            let n = want.cell ? Number(/(\d+)$/.exec(want.cell)?.[1]) : 0;
            if (!n && want.text) {
              const needle = ViewRegistry.normText(want.text);
              const hit = table.getRows().find(r => Object.values(r.getData())
                .some(v => ViewRegistry.normText(v).includes(needle)));
              n = hit ? hit.getData().Row : 0;
            }
            if (!n) return { sheet: here, cell: null };
            const row = table.getRows().find(r => r.getData().Row === n);
            if (!row) return { sheet: here, cell: null };
            try { row.scrollTo(); } catch (e) { /* a table still building */ }
            const el = row.getElement();
            target.querySelectorAll('.landed').forEach(x => x.classList.remove('landed'));
            el.classList.add('landed');
            setTimeout(() => el.classList.remove('landed'), 4000);
            return { sheet: here, cell: 'A' + n, row: n };
          };

          ViewRegistry.mountSheetTabs(tabs, sheets, show);
          ViewRegistry.publishSheets(host, sheets, show, stale, locate);

          // THE FIRST SHEET IS DRAWN INSIDE THIS MOUNT, not on a frame left
          // running after it. The frame itself stays, because Tabulator sizes
          // off its container and the container has not been laid out until it
          // runs; what changed is that this function does not return until the
          // draw is done. Left unawaited, a host selecting a sheet the moment
          // show() resolved was overwritten by a frame that had not fired yet:
          // it asked for sheet 2, got sheet 0 under sheet 2's heading, and the
          // only thing keeping that from happening was the 100ms interval of
          // the poll the host used instead of awaiting.
          await new Promise(r => requestAnimationFrame(r));
          if (!stale()) show(0);
        } catch (e) {
          fail(e?.reader ? e.message : 'Could not read the workbook: ' + ((e && e.message) || String(e)));
        }
      }
    },
    {
      // A WORD DOCUMENT AS THE PAGES IT PRINTS TO. The reading view below
      // this recovers a .docx's structure and discards how it looked; this
      // one draws the file as Word prints it: page size and margins, the
      // header with the agency seal and the footer with its page number, the
      // grey bands and blue totals rows a form uses to say which cells to
      // fill, the fonts, the tab stops, and list numbering that continues
      // across table cells (the IT Addendum's questions are A, B, C, D, E;
      // the reading view says 1, 1, 1). It is the default for the reason the
      // sheet render is a workbook's: most of what this estate opens are
      // OFM's FORMS, and a form read for what it says is half the form.
      //
      // The painter is docx-preview (Apache-2.0, 75 KB, one dependency:
      // JSZip), from a PINNED build, and the file is prepared by kits/docx.js
      // before the painter sees it: content controls inside table rows and
      // cells, which the painter drops, are unwrapped, and Symbol-font
      // bullets are mapped to glyphs any font draws. The kit's header says
      // what was measured and where the two gaps came from.
      //
      // `exclusive` for the reason the sheet render is: a host's blanket
      // defaultMode cannot tell "raw for a text file" from "raw for a ZIP".
      // The reading view stays in the strip one tap away, not exclusive, on
      // the grid's reasoning one module up.
      id: 'page', label: 'Page', icon: 'ph-microsoft-word-logo',
      exclusive: true,
      test: (f) => ViewRegistry.isDocument(f.ext),
      render: () => `<div data-page="root" class="h-full w-full flex flex-col bg-base-200">
        <div data-page="stage" class="flex-1 min-h-0 relative">
          <div data-page="msg" class="absolute inset-0 grid place-items-center text-sm text-base-content/50">
            <span class="flex items-center gap-2"><span class="loading loading-spinner loading-sm"></span> Opening the document…</span>
          </div>
        </div>
      </div>`,
      after: async (f, host) => {
        const root = host?.root?.querySelector('[data-page="root"]');
        if (!root) return;
        const stage = root.querySelector('[data-page="stage"]');
        const msg = root.querySelector('[data-page="msg"]');
        if (!stage || !msg) return;
        const stale = () => !host.alive();
        const fail = (why) => { if (!stale()) msg.textContent = why; };

        try {
          const { bytes, size } = await ViewRegistry.fileBytes(f);
          if (stale()) return;
          const { painter, kit } = await ViewRegistry.openDocument();
          if (stale()) return;

          let prepared;
          try {
            prepared = await kit.prepare(bytes);
          } catch (e) {
            return fail('That file did not open as a document. A .docx is a ZIP, so a truncated or renamed file fails here.');
          }
          if (stale()) return;

          // Scoped per mount: the painter writes one stylesheet per document,
          // keyed by this class, and a page can hold three viewers.
          const uid = 'wd' + Math.random().toString(36).slice(2, 8);
          const pane = document.createElement('div');
          pane.className = 'absolute inset-0 overflow-auto';
          const styles = document.createElement('div');
          // `shell` carries the gesture-time transform and `body` the committed
          // zoom, on two elements because a transform written on a zoomed
          // element is measured in its zoomed pixels, and the anchor maths
          // below is in the pane's.
          const shell = document.createElement('div');
          const body = document.createElement('div');
          shell.append(body);
          pane.append(styles, shell);

          await painter.renderAsync(prepared.bytes, body, styles, {
            className: uid,
            inWrapper: true,
            // Each section as one tall page, the painter's default, and the
            // pages are then cut here (paginate, below). Word's saved break
            // markers are NOT honoured: measured across home's 30 forms they
            // reproduce Word's own page count in 14, missing where a break
            // fell inside a table and stale where the file was edited after
            // its last full save, and honouring them gave one form a page
            // 2.75 pages tall. Explicit page breaks and section breaks still
            // start a page, in this mode as in any.
            ignoreLastRenderedPageBreak: true,
            renderHeaders: true, renderFooters: true,
            renderFootnotes: true, renderEndnotes: true,
            // Tab stops computed from the paragraph's stops rather than
            // approximated as a fixed width.
            experimental: true,
          });
          if (stale()) return;

          ViewRegistry.scrubLinks(body);
          // PAGES OF PAGE HEIGHT. The painter does not flow: a section is one
          // box that grows to its content. Cut each into pages here, at block
          // boundaries and at table rows, each page a clone of the box with
          // its header and footer, so a form reads as the pages it prints to
          // and the footer counts them. Measured at the body's own width,
          // before any scale, since the cut is in the page's pixels, and in
          // the document, since a detached box measures as nothing.
          const extra = document.createElement('style');
          extra.textContent = ViewRegistry.pageCss(uid);
          styles.append(extra);
          body.style.width = 'max-content';
          msg.remove();
          stage.replaceChildren(pane);
          ViewRegistry.paginate(body, uid);
          // The page number and the page count, written where the kit left its
          // sentinels for the PAGE and NUMPAGES fields: only now, with the
          // pages made, does anyone know either number.
          const sections = [...body.querySelectorAll(`section.${uid}`)];
          if (kit.PAGE_FIELD) {
            const marks = new RegExp(`${kit.PAGE_FIELD}|${kit.NUMPAGES_FIELD}`, 'g');
            sections.forEach((sec, i) => {
              const walk = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
              for (let t = walk.nextNode(); t; t = walk.nextNode()) {
                if (t.nodeValue.includes('\uE000')) {
                  t.nodeValue = t.nodeValue.replace(marks, m => m === kit.PAGE_FIELD ? String(i + 1) : String(sections.length));
                }
              }
            });
          }
          // FIT, THEN ZOOM. A page is drawn at its own width (8.5in is 816px)
          // and a docked pane or a phone is narrower, so the render is scaled
          // to fit rather than scrolled sideways; a pane wider than the page
          // leaves it at size. That fit is 1 on the reader's own scale, which
          // a pinch, a ctrl-wheel or a trackpad pinch moves between MINZ and
          // MAXZ, the PDF column's bounds (kits/pdf.js, `flow`).
          //
          // SCALED BY A TRANSFORM, NOT BY CSS ZOOM. A zoom re-lays out the
          // whole document, every page, table and run, and on a phone that is
          // longer than a frame, so a pinch that zoomed on each move landed on
          // the frames that survived and read as jumping between sizes. The
          // body is laid out once at its own width and drawn through
          // `transform: scale()`, which the compositor applies with no layout
          // at all; `shell` is sized to the scaled extent so the pane scrolls
          // over it, and centres it while it is narrower than the pane. The
          // PDF column can afford zoom because its pages are canvases.
          const MINZ = 0.5, MAXZ = 4;
          body.style.transformOrigin = '0 0';
          const nat = body.getBoundingClientRect();
          const natW = nat.width || 1, natH = nat.height || 1;
          shell.style.margin = '0 auto';
          let fitScale = 1, z = 1;
          const scale = () => fitScale * z;
          const apply = () => {
            const k = scale();
            body.style.transform = `scale(${k})`;
            shell.style.width = (natW * k) + 'px';
            shell.style.height = (natH * k) + 'px';
          };
          const refit = () => {
            if (!pane.isConnected) return;
            const avail = pane.clientWidth - 16;
            fitScale = avail > 0 && natW > avail ? avail / natW : 1;
            apply();
          };
          refit();
          if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => { if (pane.isConnected) refit(); else ro.disconnect(); });
            ro.observe(pane);
          }
          // The browser's own pinch and double-tap zoom are switched off;
          // single-finger pans stay native. Two fingers are taken over below.
          pane.style.touchAction = 'pan-x pan-y';

          // The readout and the way back out, the pdf mode's pill: shown
          // whenever the page is off fit width, since a zoom level is a state
          // a reader can get stuck in, and hidden at fit.
          const zoomPill = document.createElement('div');
          zoomPill.className = 'viewer-page-zoom hidden absolute bottom-3 left-3 z-20';
          zoomPill.innerHTML = `
            <button data-page="zoomreset" type="button" title="Fit to width"
                    class="btn btn-xs gap-1 rounded-full border-base-300 bg-base-100/90
                           font-mono tabular-nums shadow-lg backdrop-blur">
              <i class="ph ph-arrows-in-simple"></i><span data-page="zoomlevel">100%</span>
            </button>`;
          stage.append(zoomPill);
          const zoomLevel = zoomPill.querySelector('[data-page="zoomlevel"]');
          const showZoom = () => {
            zoomPill.classList.toggle('hidden', Math.abs(z - 1) < 0.001);
            zoomLevel.textContent = Math.round(z * 100) + '%';
          };

          // Zoom about a point: `at` is the content point (in the body's own,
          // unscaled pixels) that has to sit under the pane point `to` after
          // the change. A wheel takes both from the pointer at that moment; a
          // pinch fixes `at` when the second finger lands and moves `to` with
          // the fingers, which is what makes a pinch-and-drag pan as well as
          // zoom. Exact in both axes, since the transform is a pure scale.
          const clamp = (nz) => Math.max(MINZ, Math.min(MAXZ, nz));
          const paneXY = (cx, cy) => {
            const r = pane.getBoundingClientRect();
            return { x: cx == null ? r.width / 2 : cx - r.left, y: cy == null ? r.height / 2 : cy - r.top };
          };
          const contentAt = (to) => ({ x: (pane.scrollLeft + to.x) / scale(), y: (pane.scrollTop + to.y) / scale() });
          const zoomTo = (nz, to, at) => {
            const want = clamp(nz);
            if (!(want > 0)) return;
            z = want;
            apply();
            const k = scale();
            pane.scrollLeft = Math.max(0, at.x * k - to.x);
            pane.scrollTop = Math.max(0, at.y * k - to.y);
            showZoom();
          };
          const applyZoom = (nz, cx, cy) => {
            const to = paneXY(cx, cy);
            zoomTo(nz, to, contentAt(to));
          };
          zoomPill.querySelector('[data-page="zoomreset"]').addEventListener('click', () => applyZoom(1));

          // One frame per gesture step, whatever the event rate.
          let pending = null, frame = 0;
          const schedule = (fn) => {
            pending = fn;
            if (frame) return;
            frame = requestAnimationFrame(() => { frame = 0; const f = pending; pending = null; f && f(); });
          };

          // Desktop: ctrl or cmd plus the wheel, which is also how macOS
          // delivers a trackpad pinch. deltaMode normalized, since a mouse
          // reports lines where a trackpad reports pixels.
          pane.addEventListener('wheel', (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
            const nz = z * Math.exp(-dy * 0.01), cx = e.clientX, cy = e.clientY;
            schedule(() => applyZoom(nz, cx, cy));
          }, { passive: false });

          // Touch: read from touch events and cancelled while two fingers are
          // down, NOT from pointer events. With panning permitted, the browser
          // may decide the two fingers are a scroll, and the moment it does it
          // fires pointercancel and stops reporting them, so a pointer-event
          // pinch died mid-gesture until the reader lifted and tried again.
          // preventDefault on the two-finger touchstart and touchmove keeps
          // the gesture ours from the first frame. Scale follows the ratio of
          // the finger distance to its value when the second finger landed;
          // the point under the fingers then is the point under them now.
          let pinch = null;
          const mid = (t) => {
            const [a, b] = [t[0], t[1]];
            return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
                     x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
          };
          pane.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 2) return;
            e.preventDefault();
            const m = mid(e.touches);
            const to = paneXY(m.x, m.y);
            pinch = { d: m.d, z, at: contentAt(to) };
            // Promoted for the gesture only: a whole document as a layer is
            // memory a reader pays while scrolling too, so it is dropped at
            // the end.
            body.style.willChange = 'transform';
          }, { passive: false });
          pane.addEventListener('touchmove', (e) => {
            if (!pinch || e.touches.length < 2) return;
            if (e.cancelable) e.preventDefault();
            const m = mid(e.touches);
            const nz = pinch.z * (m.d / pinch.d), to = paneXY(m.x, m.y), at = pinch.at;
            schedule(() => zoomTo(nz, to, at));
          }, { passive: false });
          const endPinch = (e) => {
            if (!pinch || e.touches.length >= 2) return;
            pinch = null;
            body.style.willChange = '';
          };
          pane.addEventListener('touchend', endPinch);
          pane.addEventListener('touchcancel', endPinch);

          const pages = body.querySelectorAll(`section.${uid}`).length;
          const survey = prepared.report.survey;
          const controls = survey?.controls?.length || 0;
          host?.report([
            `${pages} page${pages === 1 ? '' : 's'}`,
            controls ? `${controls} control${controls === 1 ? '' : 's'}` : null,
            `${(size / 1024).toFixed(1)} KB`,
          ].filter(Boolean).join(' · '));

          // WHERE A CITE LANDS: a phrase, matched on alphanumerics against the
          // paragraphs and cells the painter drew, shortest match first, so a
          // heading wins over the sentence quoting it. Published on the root
          // the way the sheet modes publish `__sheets`, so a host with a cite
          // reads `__doc.locate` off a document and needs no third idiom.
          const locate = async (address) => {
            if (stale()) return null;
            const text = typeof address === 'string' ? address : address?.text;
            const needle = ViewRegistry.normText(text);
            if (!needle) return null;
            let el = null;
            for (const n of body.querySelectorAll('p, td, th, h1, h2, h3, h4, h5, h6')) {
              if (!ViewRegistry.normText(n.textContent).includes(needle)) continue;
              if (!el || n.textContent.length < el.textContent.length) el = n;
            }
            if (!el) return null;
            ViewRegistry.landOnCell(pane, el);
            const at = [...body.querySelectorAll(`section.${uid}`)].findIndex(s => s.contains(el));
            return { text, page: at < 0 ? null : at + 1 };
          };
          host.root.__doc = { pages, survey, locate, zoom: () => z, setZoom: (nz) => applyZoom(nz) };
        } catch (e) {
          fail(e?.reader ? e.message : 'Could not read the document: ' + ((e && e.message) || String(e)));
        }
      }
    },
    {
      // THE SAME DOCUMENT AS WHAT IT SAYS. Until 2026-09-04 this was the only
      // Word view, and it stays because a document read for its words is
      // better read this way: one column, the pane's own type size, no page
      // furniture. It came up against a packet of budget submittals where 30
      // of 70 files are .docx, .xlsx or .xlsm, and the page reading them had
      // grown its own reader rather than gain one here.
      //
      // What it recovers, stated because the pane should not imply more
      // fidelity than it has: mammoth reads a .docx for its STRUCTURE and
      // discards the styling. Headings, lists, tables and emphasis survive.
      // Page breaks, fonts, headers, footers, shading and list numbering
      // formats do not; the page render above is where those are.
      //
      // Not `exclusive`, because the page render above is, on the grid's
      // reasoning for the workbook pair.
      id: 'docx', label: 'Document', icon: 'ph-file-doc',
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

  // ---- workbooks: what the two sheet modes share --------------------------
  //
  // Both read the same bytes through the same kit and offer the same tab strip
  // and the same published sheet list. Only the drawing differs, so only the
  // drawing lives in the modules.

  // Bytes, from the two sources every binary module here reads: a local file
  // was decoded by its host and arrives as a data: URI, a repo file has to be
  // fetched because the text pipeline destroyed them on the way in. A failure
  // a reader can act on is thrown with `reader: true` so a module prints it as
  // written rather than behind "Could not read the workbook". `fileBytes` is
  // the same function under the name a document module can read without
  // wondering; the workbook name stays for the callers that have it.
  fileBytes(f) { return this.workbookBytes(f); },
  async workbookBytes(f) {
    const stop = (msg) => { throw Object.assign(new Error(msg), { reader: true }); };
    const toBytes = (b64) => Uint8Array.from(atob(String(b64).replace(/\s/g, '')), c => c.charCodeAt(0));
    const content = String(f.content || '').trim();
    const carried = /^data:[^;,]*;base64,([\s\S]*)$/.exec(content);
    if (carried) {
      const bytes = toBytes(carried[1]);
      return { bytes, size: bytes.length };
    }
    if (f.repo && f.name && window.gh) {
      const at = f.ref ? '?ref=' + encodeURIComponent(f.ref) : '';
      const data = await gh.req(`/repos/${f.repo}/contents/${f.name}${at}`);
      if (Array.isArray(data)) stop('That path is a directory.');
      // Over 1 MB the contents API empties `content`; the blobs API serves the
      // same bytes by sha. Same fallback gh.bytes makes.
      const b64 = data.content || (await gh.req(`/repos/${f.repo}/git/blobs/${data.sha}`)).content;
      if (!b64) stop('GitHub returned no bytes for that file.');
      const bytes = toBytes(b64);
      return { bytes, size: typeof data.size === 'number' ? data.size : bytes.length };
    }
    if (f.local) stop('This file is local and its bytes did not survive the trip. Drop it again to read it.');
    stop('No repo behind this file, so its bytes cannot be fetched.');
  },

  // Bytes, kit, and the sheets in WORKBOOK order rather than part-file order.
  // The two differ the moment a tab has been dragged, and the reader means the
  // order they see in Excel.
  async openWorkbook(f, host) {
    const { bytes, size } = await this.workbookBytes(f);
    if (host && !host.alive()) return { xl: null, sheets: [], size };
    // gh.load honours ?use=, so a branch preview reads the branch's kit. The
    // CDN copy is the fallback for a page with no gh at all.
    // gh.load honours ?use=, so a branch preview reads the branch's kit. The
    // CDN copy is the fallback for a page with no gh at all.
    const loadKit = (part) => window.gh?.load
      ? gh.load(part)
      : this.loadAsset('https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/lib/' + part);
    if (!window.xlsxKit) await loadKit('kits/xlsx.js');
    // The note kit is an ENHANCEMENT and its failure is not the workbook's.
    // Without it a `data-note` is an inert attribute and the sheet still draws;
    // awaiting it unguarded would mean one unreachable CDN turns a readable
    // workbook into an error pane.
    if (!window.Note) await loadKit('kits/note.js').catch(() => {});
    let result;
    try {
      result = await window.xlsxKit.readZip(bytes);
    } catch (e) {
      throw Object.assign(
        new Error('That file did not open as a workbook. A .xlsx is a ZIP, so a truncated or renamed file fails here.'),
        { reader: true });
    }
    const xl = result.xl;
    const sheets = Object.entries(xl.sheets)
      .map(([key, s]) => ({ key, s }))
      .sort((a, b) => (a.s.index ?? 1e9) - (b.s.index ?? 1e9) || a.key.localeCompare(b.key));
    return { xl, sheets, size };
  },

  // ---- documents: what the page render needs ------------------------------

  // The three things, in an order that matters: the painter's UMD build reads
  // a JSZip GLOBAL the moment its script runs, so the two cannot ride
  // `assets`, which loads in parallel; and the kit prefers that same global,
  // so one copy of JSZip serves both. Pinned, not @latest: a painter that
  // changes under a page changes what a reader sees with no commit here.
  JSZIP_UMD: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  DOCX_PREVIEW: 'https://cdn.jsdelivr.net/npm/docx-preview@0.4.0/dist/docx-preview.min.js',
  async openDocument() {
    if (typeof JSZip === 'undefined') await this.loadAsset(this.JSZIP_UMD);
    if (!window.docx?.renderAsync) await this.loadAsset(this.DOCX_PREVIEW);
    if (!window.docxKit) await this.loadLib('kits/docx.js');
    if (!window.docx?.renderAsync) throw Object.assign(new Error('The Word painter loaded but exported nothing.'), { reader: true });
    return { painter: window.docx, kit: window.docxKit };
  },

  // Hyperlinks come out of the file as written, and the painter copies them
  // to `href` unchecked. On an origin whose localStorage holds a GitHub
  // token, a `javascript:` target in somebody's document is a script we would
  // run for them, so anything but a web, mail or same-page address is
  // dropped, and what remains opens in a new tab.
  scrubLinks(rootEl) {
    for (const a of rootEl.querySelectorAll('a[href]')) {
      const href = (a.getAttribute('href') || '').trim();
      if (/^(https?:|mailto:)/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      else if (!href.startsWith('#')) a.removeAttribute('href');
    }
  },

  // Cut every page box in `body` into pages of its own height. A box that
  // fits is left alone; one that overflows is cut at the first block whose
  // bottom passes the content limit, and a table at that block is cut at its
  // first overflowing row, the rows after it carried into a cloned table
  // shell. Each new page is a shallow clone of the box with the header and
  // footer cloned into it, so it carries the same margins and chrome. A block
  // taller than a page on its own is left whole on a page that grows to hold
  // it, since the boxes are min-height and never clip. Returns the page count.
  paginate(body, uid) {
    const sections = [...body.querySelectorAll(`section.${uid}`)];
    let count = 0;
    for (const sec of sections) {
      let cur = sec;
      count++;
      // Bounded, since a page that never fits would otherwise cut forever.
      for (let guard = 0; guard < 1000; guard++) {
        const next = this.splitPage(cur);
        if (!next) break;
        cur.after(next);
        cur = next;
        count++;
      }
    }
    return count;
  },

  // One cut: the page that follows `sec`, or null when `sec` fits.
  splitPage(sec) {
    const article = sec.querySelector(':scope > article');
    if (!article) return null;
    const cs = getComputedStyle(sec);
    const pageH = parseFloat(cs.minHeight) || 0;
    if (!pageH) return null;
    const secTop = sec.getBoundingClientRect().top;
    const artRect = article.getBoundingClientRect();
    const footer = sec.querySelector(':scope > footer');
    let footBand = 0;
    if (footer) {
      const f = getComputedStyle(footer);
      footBand = Math.max(0, footer.offsetHeight + (parseFloat(f.marginBottom) || 0));
    }
    // What the article may fill: the page less what sits above it, the
    // footer's band, and the bottom margin.
    const limit = pageH - (artRect.top - secTop) - (parseFloat(cs.paddingBottom) || 0) - footBand;
    if (artRect.height <= limit + 1) return null;

    const blocks = [...article.children];
    const over = (el) => el.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(el).marginBottom) || 0) - artRect.top > limit + 0.5;
    const idx = blocks.findIndex(over);
    if (idx < 0) return null;

    let carry;
    const b = blocks[idx];
    if (b.tagName === 'TABLE') {
      const rows = [...b.querySelectorAll(':scope > tbody > tr, :scope > tr')];
      const cut = rows.findIndex(over);
      if (cut > 0) {
        const shell = b.cloneNode(false);
        for (const c of b.children) if (c.tagName !== 'TBODY' && c.tagName !== 'TR') shell.appendChild(c.cloneNode(true));
        const from = rows[cut].parentElement;
        const into = from.tagName === 'TBODY' ? from.cloneNode(false) : shell;
        if (into !== shell) shell.appendChild(into);
        rows.slice(cut).forEach(tr => into.appendChild(tr));
        carry = [shell, ...blocks.slice(idx + 1)];
      } else if (idx === 0) {
        // A first row taller than the page: nothing to cut before it.
        carry = blocks.slice(1);
      } else {
        carry = blocks.slice(idx);
      }
    } else if (idx === 0) {
      carry = blocks.slice(1);
    } else {
      carry = blocks.slice(idx);
    }
    if (!carry.length) return null;

    const page = sec.cloneNode(false);
    const header = sec.querySelector(':scope > header');
    if (header) page.appendChild(header.cloneNode(true));
    const art = article.cloneNode(false);
    carry.forEach(el => art.appendChild(el));
    page.appendChild(art);
    if (footer) page.appendChild(footer.cloneNode(true));
    return page;
  },

  // What this pane adds over the painter's own stylesheet: the wrapper sits
  // on the pane's ground rather than the painter's gray, pages keep a shadow
  // so their edges read, and a cite's landing mark, which composites over
  // whatever the paragraph is filled with (the sheet render's reasoning).
  pageCss(uid) {
    // Tailwind's preflight puts max-width:100% on every image, and the painter
    // wraps a floating image in a zero-width positioning box, so a header
    // logo collapsed to nothing on every page it drew. Its own width wins.
    return `.${uid}-wrapper{background:transparent;padding:12px 8px 0}` +
      `.${uid}-wrapper img{max-width:none}` +
      `.${uid}-wrapper>section.${uid}{box-shadow:0 1px 6px rgba(0,0,0,.35);margin-bottom:16px}` +
      `.${uid}-wrapper .landed{outline:2px solid #c2410c;outline-offset:-2px;` +
        `box-shadow:inset 0 0 0 9999px rgba(253,224,71,.38)}`;
  },

  // One button per sheet. A sheet the workbook never claimed keeps its part
  // name, which is the honest answer rather than a guessed label.
  mountSheetTabs(tabs, sheets, show) {
    if (!tabs) return;
    tabs.replaceChildren(...sheets.map(({ key, s }, i) => {
      const b = document.createElement('button');
      b.className = 'btn btn-xs';
      b.textContent = s.name || key;
      b.title = `${s.cellCount} cell${s.cellCount === 1 ? '' : 's'}`;
      b.addEventListener('click', () => show(i));
      return b;
    }));
    tabs.classList.remove('hidden');
    tabs.classList.add('flex');
  },

  // WHAT THE HOST CAN DO WITH THE SHEETS, published the way the pdf module
  // publishes its flow. The tabs are this module's answer to "which sheet",
  // and they are the right answer inside a pane: one row, always visible, fine
  // at three sheets. They are the wrong one on a phone at ten, which is why
  // home's submittal page reads a workbook one sheet per screen through a
  // swipe deck instead.
  //
  // A deck cannot be built from the tabs, because a deck needs to know how many
  // sheets there are and what each is called BEFORE it opens, and it drives
  // which one is shown from outside. So the list and the switch are what get
  // published, and nothing about the deck itself.
  //
  // Named per mount rather than globally, since a page can hold three viewers
  // and each has its own workbook open. Published identically by both sheet
  // modes, so a host's deck keeps working whichever one the reader is in.
  publishSheets(host, sheets, show, stale, locate) {
    if (!host?.root) return;
    host.root.__sheets = {
      list: sheets.map(({ key, s }) => ({ name: s.name || key, cellCount: s.cellCount ?? 0 })),
      show: (i) => { if (!stale() && i >= 0 && i < sheets.length) show(i); },
      // WHERE A CITE LANDS, and it is the sheet mode's own answer. A host can
      // switch sheets on its own; what it cannot do is find WHICH sheet holds a
      // phrase without drawing each one, or turn `H11` into an element, since a
      // cell's coordinates are nowhere in its text. Returns what it found, or
      // null, so a caller can say it missed rather than claim it landed.
      locate: locate || null,
    };
  },

  // `Sheet name!H11`, `H11`, `A1:C3`, or a bare sheet name. Returns the parts
  // it could read; a caller supplies the rest. The sheet half is split on the
  // LAST `!`, since a sheet may be called "Reductions - Adds" but never "A1".
  parsePlace(address) {
    const raw = String(address || '').trim();
    if (!raw) return {};
    const cut = raw.lastIndexOf('!');
    const sheet = cut > 0 ? raw.slice(0, cut).replace(/^'|'$/g, '') : null;
    const rest = (cut > 0 ? raw.slice(cut + 1) : raw).replace(/\$/g, '').trim();
    if (/^[A-Za-z]{1,3}[0-9]{1,7}(:[A-Za-z]{1,3}[0-9]{1,7})?$/.test(rest)) {
      return { sheet, cell: rest.split(':')[0].toUpperCase() };
    }
    // Not a cell address, so the whole thing is a sheet name unless one was
    // already split off, in which case it is text to find inside that sheet.
    return cut > 0 ? { sheet, text: rest } : { sheet: rest };
  },

  // A place, read against the sheets that exist. parsePlace cannot tell a sheet
  // name from a phrase, because with no `!` in it neither can anything else:
  // "Externally Mobile" is a plausible name for either. The workbook settles
  // it, so the resolution lives here rather than in the grammar, and a string
  // naming no sheet is read as text rather than refused.
  readPlace(address, sheets) {
    const want = typeof address === 'string' ? this.parsePlace(address) : { ...(address || {}) };
    if (want.sheet && !want.cell && !want.text && this.sheetIndex(sheets, want.sheet) < 0) {
      return { sheet: null, text: want.sheet };
    }
    return want;
  },

  sheetIndex(sheets, name) {
    const want = this.normText(name);
    return (sheets || []).findIndex(({ key, s }) => this.normText(s.name || key) === want);
  },

  // Alphanumerics only, which is what lets a cite survive the quirks a document
  // picks up on its way through Word and Excel: a non-breaking space, a curly
  // apostrophe, an en dash where a hyphen was typed. The same normalisation
  // home's submittal page uses, so one address matches on both sides.
  normText: (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ''),

  // Scroll a pane so an element sits a third of the way down rather than at the
  // very top, and mark it. Four seconds, the same as home's landOn: long enough
  // to find with the eye, short enough that the mark does not become part of
  // the document.
  landOnCell(pane, el) {
    if (!pane || !el) return false;
    pane.querySelectorAll('.landed').forEach(n => n.classList.remove('landed'));
    el.classList.add('landed');
    setTimeout(() => el.classList.remove('landed'), 4000);
    const settle = () => {
      if (!el.isConnected) return;
      const box = pane.getBoundingClientRect(), at = el.getBoundingClientRect();
      pane.scrollTop += at.top - box.top - pane.clientHeight * 0.3;
      // Horizontally too, which a document reader never needs and a sheet
      // always does: a cited cell is as likely to be off the right edge as
      // below the fold.
      if (at.left < box.left || at.right > box.right) {
        pane.scrollLeft += at.left - box.left - pane.clientWidth * 0.25;
      }
    };
    settle();
    // Twice, because a scroll is taken against the scroller's size at that
    // instant and this often runs while the pane is still being laid out.
    requestAnimationFrame(settle);
    return true;
  },

  // The column keys across EVERY row, in sheet order, with Row first. The
  // union is the point: sheetRows emits a key per cell present, so a row that
  // starts at column D contributes D even when row 1 stopped at A.
  sheetFields(rows) {
    const seen = new Set();
    for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
    seen.delete('Row');
    const index = (letters) => [...letters].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
    return ['Row', ...[...seen].sort((a, b) => index(a) - index(b))];
  },

  // ---- the notes panel ----------------------------------------------------
  //
  // A drawer over the sheet listing every comment, instruction and choice list
  // in the workbook. It is the answer to the thing Excel makes hard: the notes
  // exist one hover at a time and there is no view that holds them together.
  //
  // The control lives in the viewer's own header (`host.controls`), the slot
  // the table mode uses for its filter toggle, so the pane keeps the whole of
  // its height for the sheet.
  NOTE_KIND: {
    comment: { label: 'Comment', dot: '#dc2626' },
    list: { label: 'Choices', dot: '#64748b' },
    instruction: { label: 'Instruction', dot: '#94a3b8' },
  },

  mountNotesPanel(host, xl, root, locate) {
    const slot = host?.controls;
    if (!slot || !root) return null;
    const notes = window.xlsxKit.workbookNotes(xl);
    if (!notes.length) return null;

    const panel = document.createElement('div');
    panel.className = 'absolute inset-0 z-20 overflow-auto bg-base-100 border-t border-base-300 hidden';
    panel.setAttribute('data-sheet', 'notes');
    const esc = this.esc;
    // One row per note: where it is, what kind it is, who wrote it, what it
    // says. No counts and no summary line; the list is its own measure.
    // The sheet name is written once per run of rows on it, so the column reads
    // as a grouping rather than as the same string thirteen times: the fee
    // form's whole instruction set is one sheet, and repeating its name down
    // the list is the loudest thing on the panel.
    panel.innerHTML = `<table class="w-full text-sm">${notes.map((n, i) => {
      const kind = this.NOTE_KIND[n.kind] || this.NOTE_KIND.instruction;
      const head = [n.author, n.title].filter(Boolean).join(' · ');
      const opens = i === 0 || notes[i - 1].sheet !== n.sheet;
      return `<tr class="border-b border-base-200 align-top hover:bg-base-200 cursor-pointer" data-note-row="${i}">
        <td class="py-1.5 pl-3 pr-2 whitespace-nowrap font-mono text-xs text-base-content/60">
          <span class="inline-block w-2 h-2 rounded-full align-middle mr-1.5" style="background:${kind.dot}"></span>${opens ? esc(n.sheet) : ''}
        </td>
        <td class="py-1.5 pr-3 whitespace-nowrap font-mono text-xs">${esc(n.span || n.cell)}</td>
        <td class="py-1.5 pr-3">${head ? `<span class="text-base-content/60">${esc(head)}</span> ` : ''}${
          esc(n.text || (n.options ? 'One of: ' + n.options.slice(0, 12).join(', ') : kind.label))}</td>
      </tr>`;
    }).join('')}</table>`;
    root.querySelector('[data-sheet="stage"]')?.append(panel);

    const btn = this.headerBtn('ph-note', `Notes in this workbook (${notes.length})`, () => {
      panel.classList.toggle('hidden');
      btn.classList.toggle('text-primary', !panel.classList.contains('hidden'));
    });
    slot.append(btn);

    // A row is a cite. Closing the panel is part of landing: the point of the
    // list is to get to the cell, and a drawer left open covers the answer.
    panel.addEventListener('click', async (e) => {
      const row = e.target.closest('[data-note-row]');
      if (!row) return;
      const n = notes[Number(row.getAttribute('data-note-row'))];
      if (!n) return;
      panel.classList.add('hidden');
      btn.classList.remove('text-primary');
      await locate({ sheet: n.sheet, cell: n.cell || null });
    });
    return panel;
  },

  // ---- the sheet render ---------------------------------------------------
  //
  // An HTML table, styled from the workbook's own style records. One CSS rule
  // per style INDEX rather than a style attribute per cell: a workbook declares
  // tens to a few hundred formats and uses each on many cells (the OFM DP
  // addendum: 316 formats over 25,000 cells), so the rules are a rounding error
  // and the cells carry a class name.

  // Excel border weights, in the widths a browser can draw. `hair` is thinner
  // than a device pixel and becomes one; everything else maps to its name.
  // The cell padding the sheet stylesheet sets, named because the spill maths
  // has to subtract it and a padding that drifted from this number would put a
  // label three pixels into its neighbour.
  SHEET_PAD_X: 3,

  BORDER_CSS: {
    hair: '1px solid', thin: '1px solid', medium: '2px solid', thick: '3px solid',
    double: '3px double', dotted: '1px dotted', dashed: '1px dashed',
    mediumDashed: '2px dashed', dashDot: '1px dashed', mediumDashDot: '2px dashed',
    dashDotDot: '1px dotted', mediumDashDotDot: '2px dotted', slantDashDot: '2px dashed',
  },

  // A colour only where the workbook wrote one this can vouch for. Anything
  // else is dropped rather than guessed, which keeps a malformed palette from
  // reaching a style attribute.
  safeColor: (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : null),

  // One style record as CSS declarations. Alignment is deliberately absent
  // where the file does not set it: the default depends on the VALUE (numbers
  // right, text left), which is a per-cell fact and rides on a class instead.
  styleCss(st) {
    if (!st) return '';
    const out = [];
    if (st.bold) out.push('font-weight:700');
    if (st.italic) out.push('font-style:italic');
    const line = [st.underline && 'underline', st.strike && 'line-through'].filter(Boolean);
    if (line.length) out.push(`text-decoration:${line.join(' ')}`);
    // Excel sizes in points; a browser at 96dpi draws a point as 4/3 of a pixel.
    if (st.size && st.size !== 11) out.push(`font-size:${(st.size * 4 / 3).toFixed(1)}px`);
    const color = this.safeColor(st.color);
    if (color && color.toLowerCase() !== '#000000') out.push(`color:${color}`);
    const fill = this.safeColor(st.fill);
    if (fill) out.push(`background:${fill}`);
    if (st.border) {
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const e = st.border[side];
        if (!e) continue;
        const width = this.BORDER_CSS[e.style] || '1px solid';
        out.push(`border-${side}:${width} ${this.safeColor(e.color) || '#000000'}`);
      }
    }
    if (st.wrap) out.push('white-space:normal');
    if (st.align) {
      const map = { left: 'left', right: 'right', center: 'center', centerContinuous: 'center',
                    justify: 'justify', distributed: 'justify', fill: 'left' };
      if (map[st.align]) out.push(`text-align:${map[st.align]}`);
    }
    if (st.valign) {
      const map = { top: 'top', center: 'middle', bottom: 'bottom', justify: 'top', distributed: 'top' };
      if (map[st.valign]) out.push(`vertical-align:${map[st.valign]}`);
    }
    if (st.indent) out.push(`padding-left:${3 + st.indent * 9}px`);
    return out.join(';');
  },

  // The sheet, as an element the caller places. Column letters across the top
  // and row numbers down the side, both sticky, because without them a reader
  // cannot say where they are and a cite that names a cell has nothing to point
  // at.
  drawSheet(sheet, xl, key, opts) {
    const kit = window.xlsxKit;
    // `reach` is a row an address names. A sheet capped at 2000 rows that is
    // asked for row 3000 must draw far enough to answer rather than report a
    // miss on a row it declined to lay out.
    const layout = kit.sheetLayout(sheet, xl,
      opts?.reach ? { maxRows: Math.max(2000, opts.reach), maxCells: Math.max(30000, opts.reach * 20) } : undefined);
    const wrap = document.createElement('div');
    if (layout.empty) {
      wrap.className = 'p-4 text-sm text-base-content/50';
      wrap.textContent = `${sheet.name || key} is empty.`;
      return wrap;
    }

    // Scoped per mount, since a page can hold three viewers and each workbook
    // numbers its styles from zero.
    const uid = 'sh' + Math.random().toString(36).slice(2, 8);
    const gutter = 38;

    // A freeze is honoured only where no merge crosses it. A cell that is both
    // sticky and spans the split lands in two places at once, and a form's
    // title band spanning A:M over a frozen first column is exactly the shape
    // that would.
    const fz = layout.freeze;
    const merges = sheet.merges || [];
    const crosses = (m) => (fz.y && m.r1 <= fz.y && m.r2 > fz.y) || (fz.x && m.c1 < fz.x && m.c2 >= fz.x);
    const freeze = fz && !merges.some(crosses) ? fz : null;

    // Where each frozen column starts, so a sticky cell can be told its left.
    const lefts = [];
    let run = gutter;
    for (const c of layout.cols) { lefts.push(run); run += c.width; }

    const rules = [
      `.${uid}{border-collapse:collapse;table-layout:fixed;font-size:14.7px;` +
        `font-family:Calibri,Aptos,'Segoe UI',system-ui,sans-serif;background:#fff;color:#000}`,
      `.${uid} td{border:1px solid #e3e3e3;padding:1px ${this.SHEET_PAD_X}px;overflow:hidden;white-space:nowrap;` +
        `vertical-align:bottom;line-height:1.2;text-align:left}`,
      `.${uid} td.n{text-align:right}`,
      `.${uid} th{background:#f0f0f0;border:1px solid #d4d4d4;color:#444;font-weight:400;` +
        `font-size:11px;font-family:'Segoe UI',system-ui,sans-serif;text-align:center;position:sticky;z-index:2}`,
      `.${uid} thead th{top:0;height:20px}`,
      `.${uid} tbody th{left:0;width:${gutter}px;z-index:1}`,
      `.${uid} thead th:first-child{left:0;z-index:3}`,
      // An anchored picture is positioned inside its own cell rather than over
      // the table, so it needs no arithmetic about the header or the gutter and
      // it stays put when a row above it is hidden.
      `.${uid} td.img{position:relative;overflow:visible}`,
      `.${uid} td.img img{position:absolute;z-index:1;max-width:none}`,
      // WHAT A CELL SAYS ABOUT ITSELF. A `list` validation gets the caret Excel
      // draws on selection; an input message gets a corner wedge. The content
      // is in the cell's tooltip and nothing is written onto the page.
      //
      // THE WEDGE IS DELIBERATELY FAINT. OFM's fee form carries an instruction
      // on almost every input cell, 97 on one sheet, and at a confident blue
      // they stopped being marks on a form and became the form's texture. Faint
      // and small, the pattern they make is the useful part: it says which
      // cells an agency is expected to fill in.
      `.${uid} td.dv{position:relative}`,
      `.${uid} td.dv::after{content:'';position:absolute;right:2px;bottom:3px;` +
        `border:3px solid transparent;border-top-color:#64748b;pointer-events:none}`,
      `.${uid} td.note{position:relative}`,
      `.${uid} td.note::before{content:'';position:absolute;right:0;top:0;` +
        `border:3px solid transparent;border-top-color:#94a3b8;border-right-color:#94a3b8;pointer-events:none}`,
      // A COMMENT WEARS EXCEL'S OWN MARK, the red corner, and is the one of the
      // three that is not an invention: Excel draws exactly this and a reader
      // who knows the file will recognise it. The other two are ours, so they
      // stay faint; this one is allowed to be seen.
      `.${uid} td.cmt::before{border-top-color:#dc2626;border-right-color:#dc2626}`,
      // EXCEL'S COMMENT BOX, drawn by the note kit under this sheet's own look
      // token. Unscoped, deliberately: the kit owns ONE panel, appended to the
      // body and shared by every note on the page, so a rule for it cannot sit
      // inside this table's uid scope. Only notes that asked for the look are
      // reached, since the kit stamps `data-look` per note and clears it again.
      //
      // Square corners, a hairline border and Windows' info-tip yellow. None of
      // it is a style choice: the sheet beside it is a reproduction, and a
      // rounded panel in the page's own theme was the one thing on it that
      // announced it was not Excel. The sheet is drawn light whatever the
      // page's theme is, so the yellow sits on white either way.
      `#wt-note[data-look="excel"]{background:#ffffe1;color:#000;border:1px solid #000;` +
        `border-radius:0;box-shadow:2px 2px 3px rgba(0,0,0,.28);` +
        `font-family:Tahoma,'Segoe UI',system-ui,sans-serif;font-size:12px;line-height:1.35;` +
        `padding:4px 6px;max-width:34ch}`,
      // WHERE A CITE LANDED. Last in the sheet, and it has to be: a cell's own
      // style rule and a conditional format's carry the same specificity, so
      // source order is the only thing that decides, and a mark that loses to
      // the fill it is meant to sit on top of is a mark nobody sees. The tint
      // is an inset shadow rather than a background for the same reason: it
      // composites OVER whatever the cell is filled with, under its text.
      `.${uid} td.landed{outline:2px solid #c2410c;outline-offset:-2px;` +
        `box-shadow:inset 0 0 0 9999px rgba(253,224,71,.38);position:relative;z-index:4}`,
    ];
    // One rule per style the sheet actually uses.
    const used = new Set();
    for (const row of layout.rows) for (const c of row.cells) if (c.style != null) used.add(String(c.style));
    for (const s of used) {
      const css = this.styleCss(kit.cellStyle(xl, s));
      if (css) rules.push(`.${uid} td.s${s}{${css}}`);
    }
    // And one per conditional format that actually fired, which is why these
    // are emitted from the cells rather than from the workbook's dxf table: a
    // rule that matched nothing contributes no rule.
    const fired = new Set();
    for (const row of layout.rows) for (const c of row.cells) if (c.cf != null) fired.add(String(c.cf));
    for (const d of fired) {
      // After the style rules, so a conditional format wins on the properties
      // it sets and leaves the rest of the cell's own style standing.
      const css = this.styleCss(kit.dxfStyle(xl, d));
      if (css) rules.push(`.${uid} td.cf${d}{${css}}`);
    }

    const esc = this.esc;
    // Pictures keyed by the cell that hosts them, since the row loop below
    // writes one cell at a time and a sheet may carry several.
    const byCell = new Map();
    for (const p of layout.images || []) {
      const key = `${p.row}:${p.col}`;
      byCell.set(key, [...(byCell.get(key) || []), p]);
    }
    const cols = `<colgroup><col style="width:${gutter}px">` +
      layout.cols.map(c => `<col style="width:${c.width}px">`).join('') + '</colgroup>';
    const head = `<thead><tr><th></th>` +
      layout.cols.map(c => `<th>${kit.colLetter(c.index)}</th>`).join('') + '</tr></thead>';

    let top = 20; // the header row the frozen rows stack under
    const body = layout.rows.map(row => {
      const stickyRow = freeze?.y && row.row <= freeze.y;
      const rowTop = stickyRow ? top : null;
      if (stickyRow) top += row.height;
      const cells = row.cells.map(c => {
        const classes = [];
        if (c.numeric) classes.push('n');
        if (c.style != null) classes.push('s' + c.style);
        if (c.cf != null) classes.push('cf' + c.cf);
        // A comment outranks a list, which outranks an instruction: one mark
        // per cell, the strongest thing it carries. All three texts still go
        // into the note.
        if (c.note) classes.push(c.note.kind === 'comment' ? 'note cmt'
                                 : c.note.options ? 'dv' : 'note');
        const pics = byCell.get(`${row.row}:${c.col}`);
        if (pics) classes.push('img');
        const stick = [];
        if (stickyRow) stick.push(`position:sticky;top:${rowTop}px;z-index:2`);
        else if (freeze?.x && c.col < freeze.x) stick.push(`position:sticky;left:${lefts[c.col]}px;z-index:1`);
        // A sticky cell needs a background of its own or the rows beneath it
        // show through as it scrolls past.
        if (stick.length && !this.safeColor(kit.cellStyle(xl, c.style)?.fill)) stick.push('background:#fff');
        const span = (c.colSpan > 1 ? ` colspan="${c.colSpan}"` : '') +
                     (c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : '');
        // EVERYTHING THE CELL KNOWS AND DOES NOT DRAW, in one note: a comment
        // somebody left, the form's input message, the choices a list allows,
        // and the stored value where the drawn one is a rounding of it (a
        // format showing 13% for 0.125 is what Excel draws and is not the
        // number).
        //
        // `data-note`, NOT `title`. These are facts a reader would be worse off
        // missing, and the house style is explicit about where such a fact may
        // live: a title reaches no touch screen, renders outside the page's
        // theme, and cannot be captured in a screenshot, so a fact parked in
        // one is invisible to every review that happens through pixels. This
        // shipped as a title first and that was the defect.
        //
        // THE SHAPE IS EXCEL'S, because Excel already has one: a bold lead line
        // naming what the note is about, then the note. A comment leads with
        // its author, an input message with the field name the form gave it,
        // which is exactly `promptTitle`. Joining them inline ("Fee Code: Enter
        // the four digit code.") was this render inventing a format for
        // something the source document already formats.
        // The colon is the author's, not the lead line's: Excel writes "Name:"
        // over a comment and the bare field name over an input message, so it
        // is added here rather than by the kit, which serves both.
        const author = c.note?.comment?.author || '';
        const lead = c.note?.comment ? (author && author + ':') : (c.note?.title || '');
        const lines = [];
        if (c.note?.comment?.text) lines.push(c.note.comment.text);
        if (c.note) {
          // Where the author took the lead line, the form's own title comes
          // back inline rather than being dropped.
          const instr = c.note.comment
            ? [c.note.title, c.note.prompt].filter(Boolean).join(': ')
            : (c.note.prompt || '');
          if (instr) lines.push(instr);
          if (c.note.options) {
            const shown = c.note.options.slice(0, 40);
            lines.push('One of: ' + shown.join(', ') +
              (c.note.options.length > shown.length ? `, and ${c.note.options.length - shown.length} more` : ''));
          }
        }
        if (c.raw) lines.push('Stored as ' + c.raw);
        // `data-note-bare` because the kit's default affordance is a dotted
        // underline, and a spreadsheet cell has no room for one: Excel draws no
        // underline, the render's whole claim is that it looks like Excel, and
        // the "stored as" note is on every rounded number, so the underline
        // would land on most of the numeric cells on a sheet. The marks that
        // say a cell carries something are the corner and the caret above.
        //
        // `data-note-look="excel"` on every cell note, not only the comments:
        // one sheet cannot show two kinds of tooltip, and the reader is inside
        // Excel's document here whichever note they land on. The one line with
        // no Excel counterpart, "Stored as", rides inside Excel's frame.
        const title = (lines.length || lead)
          ? ` data-note-bare data-note-look="excel"` +
            (lead ? ` data-note-title="${esc(lead)}"` : '') +
            ` data-note="${esc(lines.join('\n\n'))}"` : '';

        // SPILL, drawn rather than restructured. The cell keeps its own column
        // and an inner span reaches past it, so the gridlines underneath and
        // every neighbouring cell survive: a colspan over the empty run would
        // draw the same text and quietly swallow four cells a reader can
        // otherwise still address. `overflow:visible` on the cell is what lets
        // the span out; the span's own width is the run it is allowed.
        let text = esc(c.text);
        let cellStyle = stick.join(';');
        if (c.spillLeft || c.spillRight) {
          const px = (from, count) => layout.cols.slice(from, from + count)
            .reduce((a, col) => a + col.width, 0);
          const own = layout.cols[c.col]?.width || 0;
          const leftPx = px(c.col - c.spillLeft, c.spillLeft);
          // Column widths are border-box and the span sits inside the cell's
          // padding box, so the run has to give the padding back. Without it a
          // right-aligned label ends 3px past its own column and its last
          // letter lands on the input box next door, which is the shape of
          // "Lease Numbe|r" across three rows of the DP addendum.
          const runPx = Math.max(0, leftPx + own + px(c.col + 1, c.spillRight) - this.SHEET_PAD_X * 2);
          cellStyle += (cellStyle ? ';' : '') + 'overflow:visible';
          text = `<span style="display:inline-block;width:${runPx}px;` +
                 `${leftPx ? `margin-left:-${leftPx}px;` : ''}overflow:hidden">${text}</span>`;
        }
        const imgs = (pics || []).map(p =>
          `<img src="${esc(p.src)}" alt="${esc(p.name)}" loading="lazy" ` +
          `style="left:${p.dx}px;top:${p.dy}px;width:${p.width}px;height:${p.height}px">`).join('');
        // ITS OWN ADDRESS, which is the whole of what makes a cite land: a
        // reader can be sent to `Sheet!H11` only if H11 is findable in the DOM,
        // and a cell's coordinates exist nowhere in its text.
        const at = ` data-c="${kit.colLetter(c.col)}${row.row}"`;
        return `<td${span}${at}${classes.length ? ` class="${classes.join(' ')}"` : ''}` +
               `${cellStyle ? ` style="${cellStyle}"` : ''}${title}>${text}${imgs}</td>`;
      }).join('');
      const rowStick = stickyRow ? ` style="position:sticky;top:${rowTop}px;z-index:3"` : '';
      return `<tr style="height:${row.height}px"><th${rowStick}>${row.row}</th>${cells}</tr>`;
    }).join('');

    const width = gutter + layout.cols.reduce((a, c) => a + c.width, 0);
    // An explicit width, because `table-layout:fixed` is IGNORED on a table
    // whose own width is auto: the browser falls back to automatic layout,
    // every <col> is a suggestion, and one long cell takes the whole table.
    // That is the same failure the grid has without a maxWidth, arriving by a
    // different route.
    wrap.innerHTML = `<style>${rules.join('')}</style>` +
      `<table class="${uid}" style="width:${width}px">${cols}${head}<tbody>${body}</tbody></table>` +
      (layout.truncated
        ? `<div class="p-3 text-xs text-base-content/60 border-t border-base-300 bg-base-100">` +
          `Drawn to row ${esc(layout.truncated.fromRow - 1)} of ${esc(layout.truncated.lastRow)}. ` +
          `A sheet this size is faster to read in the Grid, which pages instead of drawing every cell.</div>`
        : '');
    return wrap;
  },
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

  // AND THE INPUT, which initialHeaderFilter does not fill. It filters the
  // data and leaves the header box empty, so a reader arriving on a narrowed
  // reference sees 22 rows out of a 568 KB file with nothing saying why and no
  // way back to the whole of it. That is the invisible filter this option was
  // chosen over setFilter to avoid, so choosing it was not enough by itself.
  //
  // setHeaderFilterValue is what writes the box. It runs on tableBuilt rather
  // than immediately, since the header does not exist until then, and it is
  // additive to the initial filter rather than a replacement for it: the
  // initial one is what keeps a full unfiltered grid from being drawn first
  // and then thrown away.
  showHeaderFilter(table, opts) {
    const col = opts && opts.filter && opts.filter.col;
    const find = opts && opts.filter && opts.filter.find;
    if (!table || !col || !find) return;
    const write = () => {
      try { table.setHeaderFilterValue(String(col), String(find)); } catch (e) { /* no such column */ }
    };
    table.on('tableBuilt', write);
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
      description: 'Multi-mode file viewer (raw, code, preview, table, tree, image, pdf, page, docx, sheet, xlsx) with ' +
        'pluggable render modules. The image, pdf and office modules re-fetch the file as base64 through ' +
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
      //
      // A `claims` module TAKES THE DEFAULT BACK from the exclusive one, and
      // exists because "which mode" is sometimes a fact about the REFERENCE
      // rather than about the file. A workbook opens on the sheet render; a
      // workbook addressed as `?col=Fund&find=600-6` names rows, and only the
      // grid can narrow to rows. A module claims by reading the host's options
      // for itself, which is the same slice `after` is handed, so a claim can
      // never be made on another module's behalf or on options it cannot see.
      resolveDefaultMode(file, modes) {
        const only = modes.find(m => m.exclusive);
        if (only) {
          return modes.find(m => m.claims && m.claims(file, moduleOpts[m.id] || {})) || only;
        }
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
        await new Promise(r => this.$nextTick(r));
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
        const mounting = mod.after && mod.after(this.fileContext, {
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

        // AND THE MOUNT IS PART OF THE SHOW, which is the whole contract a
        // host has to go on. `after` is a module's async mount: it fetches
        // the bytes, loads its library, parses, draws, and publishes
        // whatever it publishes on `root`. That promise used to be dropped
        // here, so `show()` resolved before this function had been CALLED,
        // and every host that needed anything the module produces had to
        // guess when. Five workarounds grew out of that one gap: a poll for
        // the sheet list at three call sites in home's submittal page, a
        // second poll there for the first drawn grid, and the effect in
        // stage.js watching `meta`. So show() now means what its callers
        // already read it as: the file is shown.
        //
        // SETTLED, NOT SUCCEEDED. A module reports its own failure in its
        // own pane and has always been allowed to give up; awaiting it must
        // not turn that into a rejected show() for a host that never had one
        // to handle. What a module publishes after this point, from a
        // callback it does not itself await, is still not covered: the image
        // module reports its pixel size from an `img.onload`, so `meta` stays
        // a reactive read.
        //
        // The two costs, neither worth a timeout: show() is now as slow as
        // the mount, which for a PDF is the whole pdf.js load, and a mount
        // that never settles never resolves, where before it resolved onto a
        // blank pane.
        try { await mounting; }
        catch (e) { console.error(`viewer: the ${id} module failed to mount`, e); }
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
