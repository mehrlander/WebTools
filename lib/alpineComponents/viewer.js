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
  isWorkbook(ext) { return ext === 'xlsx' || ext === 'xlsm'; },

  // The media type a file travels under when a HOST decodes it and hands the
  // viewer a data: URI, which is how every local file arrives: a drop, a paste,
  // a stage item with no repo behind it. Wider than IMAGE_MIME, and kept as its
  // own question rather than merged into that map, because `isImage` decides
  // whether to render an <img> and a workbook is not one. The stage reads this,
  // so naming a dropped file `.xlsx` is enough to open it.
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
    if (f.ext === 'json') return 'tree';
    if (f.ext === 'csv' || f.ext === 'tsv') return 'table';
    return 'code';
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
      test: (f) => ['js','ts','py','sh','html','md','json','yml','css','rb','rs','go','java','cpp','c','sql','xml'].includes(f.ext),
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
          const blob = new Blob([f.content], { type: 'text/html' });
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
        const body = window.DOMPurify
          ? DOMPurify.sanitize(marked.parse(f.content))
          : `<pre class="whitespace-pre-wrap">${ViewRegistry.esc(f.content)}</pre>`;
        return `<div class="overflow-auto h-full w-full bg-base-100">
          <div class="prose prose-sm mx-auto px-6 py-4">${body}</div>
        </div>`;
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
      render: () => `<div class="flex flex-col h-full w-full">
        <div class="flex items-center gap-4 px-3 py-1.5 border-b border-base-300 bg-base-200/50 text-base shrink-0">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" id="tab-header-filters" class="checkbox checkbox-sm" checked>
            <span>Header filters</span>
          </label>
        </div>
        <div id="tab-target" class="flex-1 min-h-0"></div>
      </div>`,
      after: (f) => {
        requestAnimationFrame(() => {
          const target = document.getElementById('tab-target');
          if (!target) return;
          try {
            const h = target.clientHeight || 500;
            const table = new Tabulator(target, {
              data: ViewRegistry.tableRows(f),
              autoColumns: true,
              autoColumnsDefinitions: (defs) => defs.map(d => ({ ...d, headerFilter: 'input' })),
              layout: "fitData",
              height: h + "px"
            });
            const headerFilters = document.getElementById('tab-header-filters');
            headerFilters.addEventListener('change', () => {
              target.querySelectorAll('.tabulator-header-filter').forEach(el => {
                el.style.display = headerFilters.checked ? '' : 'none';
              });
              table.redraw(true);
            });
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
      exclusive: true,
      test: (f) => ViewRegistry.isImage(f.ext),
      render: () => `<div class="h-full w-full overflow-auto bg-base-200 grid place-items-center p-4">
        <img id="viewer-image" class="hidden max-w-full object-contain shadow-sm bg-base-100" alt="">
        <div id="viewer-image-msg" class="text-sm text-base-content/50 flex items-center gap-2">
          <span class="loading loading-spinner loading-sm"></span> Reading the image…
        </div>
      </div>`,
      after: async (f, host) => {
        const img = document.getElementById('viewer-image');
        const msg = document.getElementById('viewer-image-msg');
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
      render: () => `<div id="viewer-xlsx" class="h-full w-full flex flex-col bg-base-200">
        <div id="viewer-xlsx-tabs" class="hidden shrink-0 flex-wrap items-center gap-1 px-2 py-1.5 border-b border-base-300 bg-base-100"></div>
        <div id="viewer-xlsx-stage" class="flex-1 min-h-0 relative">
          <div id="viewer-xlsx-msg" class="absolute inset-0 grid place-items-center text-sm text-base-content/50">
            <span class="flex items-center gap-2"><span class="loading loading-spinner loading-sm"></span> Opening the workbook…</span>
          </div>
        </div>
      </div>`,
      after: async (f, host) => {
        const root = document.getElementById('viewer-xlsx');
        if (!root) return;
        const el = (id) => root.querySelector('#viewer-xlsx-' + id);
        const stage = el('stage'), msg = el('msg'), tabs = el('tabs');
        if (!stage || !msg) return;

        // Same guard the pdf module carries, for the same reason: switching
        // rows in a list is faster than fetching and unzipping a workbook, so a
        // superseded render must stop rather than paint the previous file's
        // sheets over the current one.
        const token = ViewRegistry._xlsxToken = (ViewRegistry._xlsxToken || 0) + 1;
        const stale = () => ViewRegistry._xlsxToken !== token;
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
          requestAnimationFrame(() => { if (!stale()) show(0); });
        } catch (e) {
          fail('Could not read the workbook: ' + ((e && e.message) || String(e)));
        }
      }
    },
    {
      id: 'codepen', label: 'CodePen', icon: 'ph-codepen-logo',
      test: (f) => ['html', 'js', 'css'].includes(f.ext),
      assets: ['https://public.codepenassets.com/embed/index.js'],
      render: (f) => {
        const lang = ['html','css','js'].includes(f.ext) ? f.ext : 'html';
        return `<div id="cpBox" class="h-full w-full bg-base-100">
          <div class="codepen" data-version="2" data-prefill data-height="100%" data-theme-id="light" data-default-tab="${lang},result" style="height:100%; display:flex; align-items:center; justify-content:center;">
            <pre data-lang="${lang}">${ViewRegistry.esc(f.content)}</pre>
          </div>
        </div>`;
      },
      after: () => {
        if (window.__CPEmbed) {
          const box = document.getElementById('cpBox');
          if (box) {
            const h = box.offsetHeight || box.parentElement.offsetHeight;
            const embed = box.querySelector('.codepen');
            if (h > 0) embed.setAttribute('data-height', h);
            __CPEmbed('#cpBox .codepen');
          }
        }
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
  getModes(file) { return this.modules.filter(m => m.test(file)); },
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
    return {
      // The registry above is the list, so name it rather than a plausible one.
      // This line advertised an `image` mode for a long time before one existed.
      description: 'Multi-mode file viewer (raw, code, preview, table, tree, image, xlsx) with ' +
        'pluggable render modules. The image and xlsx modules re-fetch the file as base64 through ' +
        "window.gh, since a binary's bytes do not survive the text pipeline, so they work in a " +
        'private repo too; they are the modules marked exclusive, which outranks a host\'s blanket ' +
        'defaultMode.',

      template: `
        <div class="flex items-center justify-between mb-2 gap-2" x-show="file">
          <div class="flex items-baseline gap-2 min-w-0">
            <span class="text-base font-mono truncate" x-text="file" :title="file"></span>
            <span class="text-base text-base-content/50 font-mono whitespace-nowrap" x-text="stats"></span>
          </div>
          <div class="flex items-center gap-0.5 shrink-0">
            <button x-show="showCopy" @click="copy()" class="btn btn-square btn-ghost hover:text-primary">
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
      viewLoading: false,
      commits: [],
      commitsFor: '',
      showCopy: opts.copy !== false,
      // The mode a freshly shown file opens in. Three forms, see resolveDefaultMode.
      defaultMode: opts.defaultMode || 'raw',
      copied: false,

      init() {
        this.$root.__viewer = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
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
      // Prefer a default branch the shell actually surveyed, and only for the
      // repo it surveyed it for; 'main' is the last resort, not the first.
      get ref() {
        const store = Alpine.store('browser');
        const surveyed = (repo) => (store && store.repo === repo && store.defaultRef) || '';
        if (this.origin) return this.origin.ref || surveyed(this.origin.repo) || 'main';
        return (store && store.ref) || (store && store.defaultRef) || 'main';
      },
      get ext() { return this.file ? this.file.split('.').pop().toLowerCase() : ''; },
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
      get stats() {
        // A module that measured the file outranks the text: for an image the
        // "lines" are however many newline bytes fall in the binary and the KB
        // is the size of the mangled decode, both false. This line went silent
        // for images rather than lie; now the image module fetches the real
        // bytes and reports them, so it can speak again with true numbers.
        if (this.meta) return this.meta;
        if (ViewRegistry.isImage(this.ext)) return '';
        if (!this.content) return '';
        return this.content.split('\n').length + ' lines · ' + (new Blob([this.content]).size / 1024).toFixed(1) + ' KB';
      },
      get viewHtml() {
        // An image is the one file whose pane is worth drawing with no content
        // behind it: the module fetches its own bytes, so empty text is a
        // normal state rather than nothing to show.
        if (!this.file) return '';
        if (!this.content && !ViewRegistry.isImage(this.ext)) return '';
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
        return urls;
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
        this.meta = null;
        this.commits = [];
        this.commitsFor = '';
        this.viewLoading = true;
        const modes = this.availableModes;
        const preferred = this.resolveDefaultMode(this.fileContext, modes);
        await this.switchMode((preferred || modes[0]).id);
      },

      async switchMode(id) {
        this.viewLoading = true;
        const mod = await ViewRegistry.prepare(id);
        this.mode = id;
        this.$nextTick(() => {
          // `after` gets a way back, not just the file. Only one module needs
          // it: the image module learns the file's REAL byte count and pixel
          // size when it fetches, facts the host cannot derive from the text
          // it holds and had been printing wrongly. Anything a module reports
          // is scoped to the file on screen and cleared by the next show().
          if (mod.after) mod.after(this.fileContext, { report: (m) => { this.meta = m || null; } });
          this.viewLoading = false;
        });
      },

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
