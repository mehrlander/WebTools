// alpineComponents/file-review.js — the per-file review dossier: one file at a
// ref, its diff against a base, and its outbound links, in a collapsible card.
// This is the caption row ([new]/[main]/[diff]) materialized as UI: the same
// three views, rendered instead of linked. pages/review.html mounts one per
// changed file; a future show-repo fold can mount it under the viewer or a
// review view the same way.
//
// Requires kits/cm6-merge.js (loaded by the host page; CM6 modules themselves
// lazy-load on the first diff render, so a card never opened costs nothing).
// Content is fetched via window.GH + gh-auth's token fallback, one contents
// call per side, only on first expand.
//
// Usage:
//   <div x-data="fileReview({ repo, ref, base, baseName, path, prevPath,
//                             status, additions, deletions, patch, open })"></div>
//
//   - repo/ref/path: the file's home ('owner/repo', branch/tag/sha, path)
//   - base:      ref to diff against (in a changeset, the merge-base sha, so
//                the diff shows the branch's own changes even after base moved)
//   - baseName:  display/link name for the base (e.g. 'main'); defaults to base
//   - prevPath:  pre-rename path on the base side (GitHub compare's
//                previous_filename), fetched for renamed files
//   - status/additions/deletions/patch: pass through from the compare API when
//                the host ran one; all optional (status is derived from the
//                two fetches when absent)
//   - open:      start expanded (single-file mode)
//   - action:    { label, icon?, onClick(path) }, an optional button on the
//                expanded card's tab row. The hosts use it for "Read from
//                here", which opens kits/file-deck.js at this file.
//   - read:      prefer the file's own presentation over its diff, where it has
//                one. Set by the file deck, which is a READING surface: a
//                markdown file opens rendered there and diffed in a list.
//                It also hands the COMPARISON to whoever is driving the
//                surface (see below), which collapses the strip to two tabs.
//   - bare:      the host names the file itself, so drop the collapsed row.
//
// ── What a file is shown AS ──────────────────────────────────────────────────
//
// A card used to have four tabs and one of them was always the answer: Diff,
// Patch, New, Base, all of them source. That is right for source and wrong for
// everything else, and the failure was not subtle. A `.gz` reported "Binary or
// oversized content" and then printed a screenful of mojibake underneath,
// because the notice and the New pane were gated on different conditions; a
// `.md` opened on a diff of the markup rather than on the document; a `.png`
// had no view at all.
//
// So the card asks what the file IS first, and offers the source tabs beside
// that rather than instead of it. `kind` is read from the extension, with the
// NUL sniff as the fallback for an unknown one:
//
//   markdown   rendered through kits/guide-render.js, the same renderer and
//              the same prose CSS the guide bodies use
//   image/svg  the image, from the bytes, as a data: URL
//   pdf        the first page DRAWN, with its page count, and a link to the
//              inspector for the rest. Until 2026-08-16 a PDF fell through to
//              the NUL sniff and reported itself as a binary, which was true
//              and useless: this estate had learned to render PDFs everywhere
//              except the one place you review a change to one.
//   gzip       INFLATED, so a `urls.txt.gz` shows its urls. The browser does
//              this natively (DecompressionStream), so it costs no library and
//              no round trip beyond the bytes already fetched.
//   binary     a stated fact and the exits, and never the bytes
//   text       as before
//
// Tabs are therefore computed (`panes`) rather than written out: the
// presentation pane first where there is one, then Diff (CM6 split/unified,
// word-level highlights, unchanged stretches folded), Patch (the API's unified
// patch text, when provided), New / Base (raw content). The split/unified
// choice persists in localStorage.reviewDiffView and defaults to unified on
// narrow screens.
//
// The tab row carries the controls too: one copy button, the github menu, and
// the host action. They had a row of their own above the tabs, which put two
// rows of chrome between the card's header and its content on a phone and
// separated the copies from the tabs that decide what there is to copy. And
// there is one copy button rather than two, because "content" and "patch"
// asked the reader to map a label onto the tab they were on, and offered
// "content" for a PNG. It takes what is showing.
//
// ── Who owns the comparison ─────────────────────────────────────────────────
//
// In a LIST, this card owns it: Diff, Patch, New and Base are four readings of
// one fixed pair (this ref, the changeset's merge base) and the reader picks
// among them. That is right for reviewing thirty rows and wrong for reading
// one file, where the honest question is not "which of four renderings" but
// "against what", and the answer is a ref the card has no business choosing.
//
// So a `read` host hands the question up. The strip collapses to the file and
// one Compare pane, and the pair comes in on `web-tools:compare-ref` (with
// `window.__compareRef` for a card that mounts after the choice was made),
// which the FAB sidebar's compare bar publishes. Turning comparison off there
// leaves the file alone on the strip, which is what reading a document wants.
//
// Two consequences worth stating, because both are lost bytes rather than
// lost features. The API `patch` is only true of the merge base, so moving the
// base drops it: the diff is then computed from the two files, and the copy
// button on that pane goes with the patch it used to hand over. And `status`
// (added/removed/renamed) is likewise a fact about the announced base, so once
// the base moves the card stops trusting it and derives status from what the
// two fetches actually found.

document.addEventListener('alpine:init', function () {
  Alpine.data('fileReview', function (opts) {
    opts = opts || {};

    const STATUS_TAG = {
      added: 'A', modified: 'M', changed: 'M', removed: 'D',
      renamed: 'R', copied: 'C', unchanged: '·'
    };
    const STATUS_CLASS = {
      added: 'text-success', modified: 'text-warning', changed: 'text-warning',
      removed: 'text-error', renamed: 'text-info', copied: 'text-info',
      unchanged: 'text-base-content/40'
    };

    // What the file is, by extension. The NUL sniff in load() is the fallback
    // for anything not named here, so an unknown binary still lands on the
    // binary panel rather than on a pane of replacement characters.
    const EXT = (p) => (String(p || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    const IMAGE_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                        gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
                        bmp: 'image/bmp', ico: 'image/x-icon' };
    // The markdown row duplicates kits/source-peek.js's `kindOf`, deliberately
    // and under a test. A runtime call would be the obvious de-duplication and
    // is the wrong one here: source-peek is a kit this component does not
    // otherwise need, it may not have loaded when a card mounts, and a card
    // that decided a `.md` was plain source because a kit was late would be a
    // worse failure than the repeat. So the two agree by assertion instead
    // (file-review-card, "the two classifiers agree"), which is the same shape
    // the estate uses for docs.csv's reach and surfacing.csv's membership.
    // The media rows have no counterpart there; source-peek calls them
    // 'source' because a peek card cannot show them.
    const KIND = (p) => {
      const e = EXT(p);
      if (e === 'md' || e === 'markdown') return 'markdown';
      // A page's own presentation is the page RUNNING, which is what the toss
      // renderer is for. Gated on `tossUrl` further down, which only answers
      // for a repo the renderer will fetch same-origin, so an html file
      // anywhere else keeps exactly the source tabs it had.
      if (e === 'html' || e === 'htm') return 'html';
      if (e === 'svg') return 'svg';
      if (IMAGE_EXT[e]) return 'image';
      if (e === 'pdf') return 'pdf';
      if (e === 'gz' || e === 'tgz') return 'gzip';
      return '';
    };
    // What the presentation pane is called, per kind. 'File' for a binary
    // because there is nothing to call it but the file itself.
    const PANE_LABEL = { read: 'Read', render: 'Render', image: 'Image', page: 'Page',
                         inside: 'Inside', binary: 'File' };
    // THE KINDS WHOSE BYTES ARE TEXT, and the reason this list exists at all.
    // `load()` reads "has a kind" as "is not text" and takes the bytes path,
    // which is right for an image, a PDF and an archive and wrong for the two
    // kinds that have a presentation AND a diff worth reading. Adding html to
    // KIND without adding it here would have left every page card with no
    // newText, no baseText, and Diff, New and Base all empty behind a Render
    // tab that worked.
    const TEXTUAL = { markdown: 1, html: 1 };
    const KB = (n) => n == null ? ''
      : n < 1024 ? n + ' B'
      : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB'
      : (n / 1048576).toFixed(1) + ' MB';
    // How much of an inflated archive to put on screen. A urls.txt.gz can be
    // megabytes of lines, and a <pre> of that is a scroll with no end.
    const CAP = 256 * 1024;
    // Bytes to base64, chunked. `btoa(String.fromCharCode(...bytes))` spreads
    // the whole array into an argument list and blows the stack somewhere
    // around a hundred thousand entries, which is a small PNG.
    const b64 = (bytes) => {
      let s = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      }
      return btoa(s);
    };

    return {
      description: 'Per-file review dossier: content at a ref, CM6 diff vs a base, links',

      template: `
        <div class="bg-base-100 border-b border-base-200 last:border-b-0">
          <!-- The collapsed row. A changed-file list is read by SCANNING, so
               everything here is chosen for what it gives a scanning eye per
               pixel of height, and everything that costs a fetch waits.

               The path splits: the directory dims and the filename does not,
               because a list of thirty rows in one uniform mono weight is a
               wall, and the filename is what the eye is looking for. A long
               directory elides from the LEFT, where the repeated part lives
               (in dirPart, not in CSS; see the note there).

               The bar is five blocks of add/remove proportion, which answers
               "how big is this change" without reading the numbers, and the
               numbers stay for when the answer matters exactly.

               One action icon, not a cluster: it routes by file type through
               kits/guide-render.js, the same table that decides where a guide's
               links point, so a page opens rendered and a doc opens read. The
               other four links (base, raw, commit, the copies) stay behind the
               expand, where there is room to label them. -->
          <!-- ONE ROW EITHER WAY. Open, a reading card's identity moves down
               onto the control row and this one stands down: two rows of chrome
               above a rendered document is most of a phone's first screen spent
               before the document starts, which is what the reader called too
               much (2026-09-05). Closed, this row is the only thing there is,
               so it has to stay or the card would have no way to be opened.
               A list card keeps both rows: there the top one is the LIST ROW,
               thirty of them scanned at once, and it is not chrome. -->
          <div x-show="!bare && !(read && open)"
               class="flex items-center gap-1.5 px-2 py-1 hover:bg-base-200/50">
            <button @click="toggle()" class="flex items-center gap-1.5 min-w-0 flex-1 text-left cursor-pointer">
              <i class="ph text-xs opacity-40 shrink-0" :class="open ? 'ph-caret-down' : 'ph-caret-right'"></i>
              <span class="font-mono text-xs w-3 text-center shrink-0 font-semibold"
                    :class="statusClass" :title="status" x-text="statusTag"></span>
              <span class="font-mono text-sm min-w-0 flex items-baseline" :title="path">
                <span x-show="!!dirPart" class="opacity-40 truncate shrink-[9999]" x-text="dirPart"></span>
                <!-- The filename shrinks too, and only after the directory has
                     given up everything. It was shrink-0, which is what the
                     rule wanted (the eye is looking for the filename) and not
                     what it did: a basename wider than the row overflowed its
                     min-w-0 box and printed straight through the +/- counts to
                     its right, on every long test filename at 390px. A shrink
                     factor of 9999 on the directory spends the whole deficit
                     there first, so the ellipsis still lands in the path and
                     reaches the name only when the name alone will not fit. -->
                <span class="min-w-0 truncate shrink" x-text="namePart"></span>
              </span>
            </button>
            <span class="shrink-0 flex items-center gap-1.5" x-show="additions != null">
              <span class="font-mono text-[10px] tabular-nums">
                <span class="text-success" x-text="'+' + (additions || 0)"></span>
                <span class="text-error ml-0.5" x-text="'-' + (deletions || 0)"></span>
              </span>
              <span class="hidden sm:flex gap-px" :title="(additions||0) + ' added, ' + (deletions||0) + ' removed'">
                <template x-for="c in sizeBar" :key="c.i">
                  <span class="w-1.5 h-1.5 rounded-[1px]" :class="c.cls"></span>
                </template>
              </span>
            </span>
            <a x-show="quickView" :href="quickView && quickView.url" :title="quickView && quickView.title"
               target="_blank" rel="noopener"
               class="shrink-0 w-5 text-center text-base-content/20 hover:text-primary transition-colors">
              <i class="ph" :class="quickView && quickView.icon"></i></a>
          </div>

          <div x-show="open" x-collapse>
            <!-- Framed in a list, unframed in a deck. A card in the Files
                 pane is one row among thirty and earns its border and its
                 tint; a card that IS the slide does not, and stacking the two
                 cost real width and gave the reader a scrollbar inside a
                 scrollbar. Measured at 1280px before this: three nested
                 scrollers and 562px lost between the viewport and the prose,
                 with two bars visible at once. See paneClass. -->
            <div class="flex flex-col gap-2"
                 :class="bare ? 'pt-1' : 'border-t border-base-200 bg-base-200/20 px-3 py-2'">

              <div x-show="loading" class="flex justify-center py-4">
                <span class="loading loading-spinner loading-md text-primary"></span>
              </div>
              <div x-show="error" class="alert alert-warning py-1 px-3 text-sm" x-text="error"></div>

              <!-- ONE row: what the card can show, then the controls that
                   act on whatever it is showing.
                   
                   The github menu and the copies used to sit on a row of their
                   own ABOVE this one, which put two rows of chrome between the
                   card's header and its content on a phone, and separated the
                   copy buttons from the tabs that decide what there is to copy.
                   They belong together, so they are together.
                   
                   The tab strip, meanwhile, is computed. Which panes exist
                   depends on what the file IS, so writing them out meant four
                   x-show clauses that between them still could not say "this
                   is a PNG". The presentation pane leads where there is one;
                   Diff and the source panes follow it rather than being
                   replaced by it. It scrolls, so the controls to its right
                   keep their place at any width. -->
              <div x-show="!loading" class="flex items-center gap-1">
                <!-- The file names itself here on a reading card, which is what
                     lets the row above stand down. A bare host still says
                     nothing here: there the host names the file, which is the
                     whole meaning of that flag.
                     (No backticks in this markup: it is a JS template literal.) -->
                <button x-show="read && !bare" @click="toggle()"
                        class="order-1 flex items-center gap-1.5 min-w-0 shrink text-left cursor-pointer">
                  <span class="font-mono text-xs w-3 text-center shrink-0 font-semibold"
                        :class="statusClass" :title="status" x-text="statusTag"></span>
                  <span class="font-mono text-sm min-w-0 flex items-baseline" :title="path">
                    <span x-show="!!dirPart" class="opacity-40 truncate shrink-[9999]" x-text="dirPart"></span>
                    <span class="min-w-0 truncate shrink" x-text="namePart"></span>
                  </span>
                </button>
                <!-- NO +/- HERE. The reader named it as the likely redundancy
                     and it is: on a presented file the question is what the
                     file SAYS, and how many lines moved is a list's question,
                     answered on the row this card was opened from and again by
                     the comparison one tap away. It was also the fifty-five
                     pixels between docs/SNAGS.md reading in full at 390 and
                     reading as do…SNAGS.md. -->

                <div role="tablist" class="order-4" x-show="!read && panes.length > 1"
                     class="tabs tabs-box tabs-xs bg-base-200 p-0.5 flex-nowrap min-w-0
                            overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <template x-for="p in panes" :key="p.id">
                    <a role="tab" class="tab whitespace-nowrap" :class="tab === p.id && 'tab-active'"
                       @click="setTab(p.id)" x-text="p.label"></a>
                  </template>
                </div>
                <div class="order-5 grow" x-show="!read"></div>
                <div class="order-6 join shrink-0" x-show="!read && tab==='diff' && diffable">
                  <button class="btn btn-xs join-item" :class="view==='split' ? 'btn-active' : 'btn-ghost'"
                          @click="setView('split')"><i class="ph ph-columns"></i></button>
                  <button class="btn btn-xs join-item" :class="view==='unified' ? 'btn-active' : 'btn-ghost'"
                          @click="setView('unified')"><i class="ph ph-rows"></i></button>
                </div>
                <!-- What the comparison is against, and how to change it. The
                     ref shows only while a comparison is on screen: elsewhere
                     the icon alone is enough and the path wants the width.
                     On a reading card it joins the github menu beside the name,
                     because both answer "which copy of this file am I reading",
                     and the row then has one cluster of identity on the left
                     rather than one at each end.
                     (No backticks in this markup: it is a JS template literal.) -->
                <details class="dropdown shrink-0" x-ref="cmpMenu" x-show="comparePicker"
                         :class="read ? 'order-3 dropdown-start' : 'order-7 dropdown-end'">
                  <summary class="btn btn-ghost btn-xs gap-1 px-1.5 cursor-pointer font-normal"
                           title="What this file is compared against">
                    <i class="ph ph-git-diff text-sm"
                       :class="compareOff ? 'opacity-40' : ''"></i>
                    <span class="font-mono text-[11px]" x-show="tab==='diff'" x-text="baseName"></span>
                  </summary>
                  <ul class="dropdown-content menu menu-sm z-20 mt-1 w-52 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
                    <template x-for="c in compareChoices" :key="c.key">
                      <li><button type="button" @click="pickCompare(c)" class="gap-2 flex-nowrap">
                        <i class="ph ph-check shrink-0" :class="c.on ? '' : 'invisible'"></i>
                        <span class="font-mono truncate" x-text="c.label"></span></button></li>
                    </template>
                  </ul>
                </details>
                <!-- The reading surface's whole strip: the file, then the
                     comparison at two widths. See viewModes.
                     Two grow spacers, not one, so this sits centred between the
                     identity cluster and the copy button instead of butting up
                     against whichever end happens to be shorter. They collapse
                     to nothing in a list, where read is false and neither
                     shows. -->
                <div class="order-4 grow" x-show="read"></div>
                <div class="order-5 join shrink-0" x-show="read && viewModes.length > 0">
                  <template x-for="m in viewModes" :key="m.key">
                    <button class="btn btn-xs btn-square join-item"
                            :class="m.on ? 'btn-active' : 'btn-ghost'"
                            :title="m.label" @click="pickView(m)">
                      <i class="ph text-sm" :class="m.icon"></i></button>
                  </template>
                </div>
                <div class="order-6 grow" x-show="read"></div>
                <!-- ONE copy button, and it copies WHAT IS SHOWING.
                     There were two, labelled "content" and "patch", which asked
                     the reader to hold in their head which of the two the tab
                     they were on corresponded to, and offered "content" on a
                     PNG. The tab already says what is on screen, so the button
                     follows it and says so in its tooltip. It hides on a pane
                     with nothing a clipboard can take (an image, a binary). -->
                <!-- A LIST keeps its three: copy, the host's action, and the
                     github menu, each one tap. A READING card folds them into
                     one, because the row they share now also carries the file's
                     name and the three layouts, and six controls on a 390px row
                     leave the path about a hundred pixels. Copy and the action
                     become rows in the same menu the github links are already
                     in, so nothing is lost and five controls become three. -->
                <button x-show="copyable !== null" @click="$clip(copyable)" :title="copyTitle"
                        class="btn btn-xs btn-square btn-ghost shrink-0"
                        :class="read ? 'order-7' : 'order-9'">
                  <i class="ph ph-copy text-sm"></i></button>
                <button x-show="!!action" @click="action && action.onClick(path)"
                        :title="action?.label"
                        class="btn btn-xs btn-square btn-ghost shrink-0"
                        :class="read ? 'order-8' : 'order-10'">
                  <i class="ph" :class="action?.icon || 'ph-cards-three'"></i></button>
                <!-- BESIDE THE NAME on a reading card, at the end of the row in
                     a list, and the same element either way: flex order says
                     which, where a second copy of this menu would be forty
                     lines of markup twice. It opens from the left there, since
                     it is no longer at the right edge to hang from.
                     (No backticks in this markup: it is a JS template literal.) -->
                <details class="dropdown shrink-0" x-ref="ghMenu"
                         :class="read ? 'order-2 dropdown-start' : 'order-11 dropdown-end'">
                  <summary class="btn btn-ghost btn-xs gap-0.5 px-1.5 cursor-pointer" title="This file on GitHub">
                    <i class="ph ph-github-logo text-base"></i>
                    <i class="ph ph-caret-down text-[10px] opacity-50"></i>
                  </summary>
                  <ul class="dropdown-content menu menu-sm z-20 mt-1 w-56 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
                    <template x-for="l in ghLinks" :key="l.label">
                      <li><a :href="l.url" target="_blank" rel="noopener" @click="$refs.ghMenu.open = false"
                             class="gap-2 flex-nowrap">
                        <i class="ph shrink-0" :class="l.icon"></i>
                        <span class="shrink-0" x-text="l.label"></span>
                        <span class="grow"></span>
                        <!-- shrink-0, not truncate: only short values reach
                             here now (see ghLinks), and a shrinkable box beside
                             a grow spacer collapses to an ellipsis even when
                             the text is four characters. -->
                        <span class="font-mono text-xs opacity-40 shrink-0" x-text="l.hint"></span></a></li>
                    </template>
                  </ul>
                </details>
              </div>

              <div x-show="!loading && !binary && identical" class="text-sm opacity-60 italic">
                Content identical at both refs.
              </div>

              <!-- ── The presentation panes ──────────────────────────────── -->

              <!-- Markdown, through the guide renderer: one definition of what
                   this estate's prose looks like, and the link re-aiming comes
                   along with it, so a doc's own links reach what can show them. -->
              <div x-show="tab==='read'" :class="paneClass">
                <div x-ref="readBox" :class="proseClass" x-html="readHtml"></div>
              </div>

              <!-- ── The page, running ─────────────────────────────────────
                   An html file's own presentation is the page itself, rendered
                   through the shared toss at THIS ref, which is the same
                   address the Look row's chip carries and the same one a
                   caption hands over in chat. One renderer, so a page previewed
                   here and a page opened from a link are the same rendering.

                   x-if, not x-show: a hidden iframe still loads its page and
                   every dependency it pulls, and a card is opened for one
                   question at a time. Switching to Compare drops the frame.

                   THE ONE THING THIS CANNOT PROMISE is that the frame paints.
                   The renderer fetches through the viewer's own stored GitHub
                   token, so a browser that has never held one shows the toss's
                   own empty state inside the frame rather than the page. That
                   is why the link rides beside it: a frame that came up blank
                   still leaves a way to the thing, in a tab that has the
                   renderer's own controls. -->
              <template x-if="tab==='render'">
                <div class="overflow-hidden bg-base-100"
                     :class="read ? '-mx-3' : 'rounded border border-base-200'">
                  <iframe :src="tossUrl" :title="'Render of ' + path" loading="lazy"
                          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                          class="w-full h-[60vh] border-0 bg-base-100"></iframe>
                  <a :href="tossUrl" target="_blank" rel="noopener"
                     class="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs
                            border-t border-base-200 text-base-content/60
                            hover:text-base-content hover:bg-base-200/60 transition-colors">
                    <i class="ph ph-arrow-square-out"></i>Open the render in its own tab</a>
                </div>
              </template>

              <!-- An image is shown, not described. Checkerboard behind it,
                   since a transparent PNG on a white card is half invisible. -->
              <div x-show="tab==='image'" class="rounded border border-base-200 p-3 flex justify-center
                          bg-[repeating-conic-gradient(var(--color-base-200)_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
                <!-- The image keeps its frame in both hosts: the checkerboard
                     IS the frame, and without an edge a transparent PNG has no
                     visible bounds at all. -->
                <img :src="mediaUrl" :alt="path" class="max-w-full max-h-[70vh] object-contain">
              </div>

              <!-- A PDF: the first page drawn, the count, and the way to the
                   rest. A card is a review surface, so it shows what changed
                   enough to recognise and hands off rather than growing a
                   pager of its own; pages/pdf-inspect.html is already the
                   workbench and already takes an address. -->
              <!-- x-effect rather than a call from load() or setTab(): those
                   fire before the pane they just made available has rendered,
                   so the canvas ref is reliably absent on exactly the tick
                   that matters, and the card sat on "Reading the PDF…" with
                   every other signal correct. An effect states the condition
                   instead of guessing when it becomes true. -->
              <div x-show="tab==='page'" x-effect="tab === 'page' && _pdfBytes && _drawPdf()"
                   class="rounded border border-base-200 p-3 flex flex-col items-center gap-2">
                <canvas x-ref="pdfCanvas" class="max-w-full shadow-sm bg-base-100"
                        :class="pdfPages ? '' : 'hidden'"></canvas>
                <div class="text-xs opacity-55 flex items-center gap-2 flex-wrap justify-center">
                  <i class="ph ph-file-pdf"></i>
                  <span x-text="pdfNote"></span>
                  <a x-show="pdfPages" :href="pdfInspectUrl" target="_blank"
                     class="link link-hover text-primary inline-flex items-center gap-1">
                    <i class="ph ph-magnifying-glass-plus"></i> Inspect
                  </a>
                </div>
              </div>

              <!-- Inside an archive. A .gz of text is text, and the browser
                   inflates it natively, so the one thing never worth showing
                   here is the compressed bytes. -->
              <div x-show="tab==='inside'" class="flex flex-col gap-1">
                <div class="text-xs opacity-55 flex items-center gap-2 flex-wrap">
                  <i class="ph ph-file-archive"></i>
                  <span x-text="insideNote"></span>
                </div>
                <pre class="text-[11px] leading-snug font-mono m-0 whitespace-pre-wrap break-words"
                     :class="paneClass" x-text="insideText"></pre>
              </div>

              <!-- Not text, and not something we can show. Say what it is and
                   where to get it; the one thing the card must not do is print
                   the bytes, which is exactly what it used to do underneath a
                   notice saying it would not. -->
              <div x-show="tab==='binary'" class="rounded border border-base-200 bg-base-100 px-3 py-4
                          flex flex-col items-center gap-2 text-center">
                <i class="ph ph-file-x text-3xl opacity-30"></i>
                <div class="text-sm opacity-70" x-text="binaryNote"></div>
                <div class="text-xs opacity-45">Open it from the GitHub menu above.</div>
              </div>

              <!-- The line that used to sit here said what the diff was
                   against, because the pair is chosen in the sidebar and a
                   phone's sidebar is closed. It was a caption for a fact the
                   reader might want to CHANGE, so it is a control on the row
                   above now (see compareChoices), and a whole row came back.
                   The one thing it also carried survives beside the counts. -->
              <div x-show="tab==='diff'" x-ref="cmhost" class="review-cm text-sm"
                   :class="paneClass"></div>

              <pre x-show="tab==='patch'" class="text-[11px] leading-snug font-mono m-0 whitespace-pre-wrap break-words" :class="paneClass"><template x-for="(l, i) in patchLines" :key="i"><span class="block px-1 rounded-sm" :class="l.cls" x-text="l.t"></span></template></pre>

              <pre x-show="tab==='new' || tab==='base'"
                   class="text-[11px] leading-snug font-mono m-0 whitespace-pre-wrap break-words"
                   :class="paneClass"
                   x-text="tab==='new' ? (newText ?? '') : (baseText ?? '')"></pre>

            </div>
          </div>
        </div>`,

      repo: opts.repo || '',
      ref: opts.ref || 'main',
      base: opts.base || 'main',
      baseName: opts.baseName || opts.base || 'main',
      path: opts.path || '',
      prevPath: opts.prevPath || '',
      status: opts.status || '',
      additions: opts.additions ?? null,
      deletions: opts.deletions ?? null,
      patch: opts.patch || '',

      open: !!opts.open,
      // A reading surface (the file deck) rather than a reviewing one, and a
      // host that names the file itself so this card need not.
      read: !!opts.read,
      bare: !!opts.bare,
      loaded: false,
      loading: false,
      error: '',
      binary: false,
      newText: null,
      baseText: null,
      lastCommit: '',
      // What the file IS, from its extension; '' means "ask the bytes".
      kind: KIND(opts.path || ''),
      size: null,
      mediaUrl: '',        // an image, as a data: URL
      _pdfBytes: null,     // held for pdf.js; never decoded to a string
      _drawing: false,
      pdfPages: 0,
      pdfNote: 'Reading the PDF…',
      readHtml: '',        // markdown, rendered
      insideText: '',      // a gzip, inflated
      insideNote: '',
      // An optional host action for the expanded strip; see the usage note.
      action: opts.action || null,
      // The comparison, when it is not this card's to choose. `compareOff` is
      // the sidebar having asked for none; `_baseMoved` records that the base
      // is no longer the one the changeset was computed against, which is what
      // invalidates the patch and the status that came with it.
      compareOff: false,
      // The pair this card was MOUNTED with, kept because adoptCompare
      // overwrites base and baseName in place and the picker has to be able to
      // offer the branch's own base again after a detour.
      _homeBase: opts.base || '',
      _homeBaseName: opts.baseName || opts.base || '',
      _baseMoved: false,
      tab: '',
      view: '',
      _cm: null,

      init() {
        this.$el.innerHTML = this.template;
        // `isConnected` because the element may be GONE by the time this
        // fires, and initing a detached tree is not harmless. Alpine evaluates
        // every expression in the injected template against a scope it has
        // already popped, so each one throws a ReferenceError for a property
        // of this very component: `tab is not defined`, `paneClass`,
        // `quickView`, `additions`, `action`.
        //
        // Alpine's error handler then RETHROWS asynchronously
        // (`setTimeout(() => { throw error }, 0)`, evaluator.js), so the
        // console line is a copy and the throw lands wherever the event loop
        // has got to. In a browser that is console noise; under `node --test`
        // it is fatal and its victim is arbitrary, which is what made
        // branch-brief-groups.test.mjs fail one full-suite run in seven, here
        // and on CI, as a whole-file failure with every subtest green.
        //
        // It reproduces whenever a card is removed within a tick of mounting,
        // which the branch view does every time a registry group is collapsed:
        // 240 throws in one captured run, 60 in a single test file, 0 with
        // this guard. The same shape is in 27 components; all are guarded.
        // Nothing is lost by skipping: an element reattached later is
        // initialized by Alpine's own mutation observer on insertion.
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        try { this.view = localStorage.getItem('reviewDiffView') || ''; } catch {}
        if (!this.view) this.view = (window.innerWidth < 768) ? 'unified' : 'split';
        // A card that starts open takes the same deal as one opened by tap: the
        // patch it was handed is shown, and the fetch waits for a tab that
        // needs the bytes. The branch page opens every card on a modest branch,
        // so this is the difference between mounting a twelve-file branch for
        // free and spending twenty-four contents calls before anyone has looked
        // at anything.
        //
        // Unless the file has a presentation of its own AND this is a reading
        // surface, in which case the patch is not the answer: a deck slide
        // opened on the unified diff of a PNG's bytes, which is the shape this
        // pass exists to end. Only `read` hosts pay the fetch eagerly, so a
        // thirty-row list still mounts for free and its image cards load on the
        // tap that asks for them.
        // A reading surface takes the pair from whoever is driving it, and
        // does so before the first load so the fetch goes to the right base.
        if (this.read) {
          this._onCompare = (e) => {
            // The deck empties a slide the reader has left without telling
            // Alpine, so a card can outlive its DOM. It unsubscribes itself on
            // the first event after that rather than relying on a destroy that
            // is never called.
            if (!this.$el || !this.$el.isConnected) {
              window.removeEventListener('web-tools:compare-ref', this._onCompare);
              return;
            }
            this.adoptCompare(e.detail);
          };
          window.addEventListener('web-tools:compare-ref', this._onCompare);
          this.adoptCompare(window.__compareRef);
        }
        if (this.open) {
          // A read host does not open on the patch. Its strip has no Patch tab
          // (the sidebar owns the comparison, and the patch is only true of
          // one base), and both panes it does have need the bytes, so the
          // fetch is the opening move rather than something a tap triggers.
          if (this.patch && !this.read) this.tab = 'patch';
          else this.$nextTick(() => this.load());
        }
      },

      // The path, split so the row reads: the directory dims, the filename does
      // not, and a long directory is elided from the LEFT, where the repeated
      // part lives.
      //
      // Elided here rather than by CSS. The obvious trick is `direction: rtl`
      // on the directory span, which makes `text-overflow: ellipsis` eat the
      // left end; it also hands the string to the bidi algorithm, which moves
      // punctuation at the edges. Measured 2026-08-06: `.claude/skills/caption/`
      // rendered as `/claude/skills/caption.`, a path that does not exist,
      // shown as though it did. A wrong path is worse than a long one.
      get dirPart() {
        const i = this.path.lastIndexOf('/');
        if (i < 0) return '';
        const dir = this.path.slice(0, i + 1);
        return dir.length > 30 ? '…' + dir.slice(-29) : dir;
      },
      get namePart() { return this.path.slice(this.path.lastIndexOf('/') + 1); },

      // Five blocks of add/remove proportion, GitHub's idiom: the shape of a
      // change is legible before the numbers are read. Additions round up so a
      // one-line change is never an empty bar, which would read as "no change"
      // on the row it is describing.
      get sizeBar() {
        const a = this.additions || 0, d = this.deletions || 0, t = a + d;
        // Each side keeps a block when it has any lines at all, which is why
        // the majority side is capped at four rather than rounded: +200/-1
        // rounds the deletion away entirely, and a bar with no red on a row
        // whose numbers say -1 contradicts the numbers beside it.
        const green = t ? Math.min(d ? 4 : 5, Math.max(a ? 1 : 0, Math.round(a / t * 5))) : 0;
        const red = t ? Math.min(5 - green, Math.max(d ? 1 : 0, Math.round(d / t * 5))) : 0;
        return Array.from({ length: 5 }, (_, i) => ({
          i,
          cls: i < green ? 'bg-success' : i < green + red ? 'bg-error' : 'bg-base-300',
        }));
      },

      // The one collapsed-row action, routed by file type through the guide
      // renderer's table: a page opens rendered, a doc or data file opens read,
      // anything else opens its source. One table decides where a file opens,
      // here and in a guide's links, so the two cannot come to disagree.
      get quickView() {
        const t = window.GuideRender?.renderTarget(this.repo, this.ref, this.path);
        if (t) return t;
        if (this.status === 'removed') return null;
        return { url: this.newUrl, icon: 'ph-file-code', title: 'Open ' + this.path + ' on GitHub' };
      },

      // The menu's rows, in the order a reader wants them: this version, the
      // one it is diffed against, the commit that made it, the bytes, and the
      // rendered page where there is one. Each is a pure getter, so the menu
      // costs nothing until it is opened, and the commit row simply stays away
      // until its own lookup lands.
      get ghLinks() {
        // The hint is for values that fit: a base name, a short sha. The head
        // ref is not one of them (a claude/<slug> truncated into a menu column
        // reads "clau…", which tells nobody anything), and it is named in full
        // two rows above, so the row carries no hint at all.
        const out = [];
        if (this.status !== 'removed') {
          out.push({ label: 'This version', hint: '', url: this.newUrl, icon: 'ph-file' });
        }
        if (this.status !== 'added') {
          out.push({ label: 'Base version', hint: this.baseName, url: this.baseUrl, icon: 'ph-git-branch' });
        }
        if (this.lastCommit) {
          out.push({ label: 'Last commit', hint: this.lastCommit.slice(0, 7), url: this.lastCommitUrl, icon: 'ph-git-commit' });
        }
        if (this.status !== 'removed') {
          out.push({ label: 'Raw', hint: '', url: this.rawUrl, icon: 'ph-file-text' });
        }
        // NOT WHERE THE CARD IS ALREADY THE RENDER. On a reading surface the
        // first layout icon opens exactly this, so the row would be a second
        // door onto the pane behind it. Dropping it also makes the menu what
        // the reader took it for: every remaining row goes to GitHub, which is
        // what lets it wear the github logo again rather than a neutral
        // overflow (2026-09-05).
        if (this.tossUrl && !(this.read && this.shownPane === 'render')) {
          out.push({ label: 'Render', hint: 'toss', url: this.tossUrl, icon: 'ph-disc' });
        }
        return out;
      },

      get statusTag() { return STATUS_TAG[this.status] || '·'; },
      get statusClass() { return STATUS_CLASS[this.status] || 'text-base-content/40'; },
      get sizeBarTitle() { return (this.additions || 0) + ' added, ' + (this.deletions || 0) + ' removed'; },
      get newUrl() { return 'https://github.com/' + this.repo + '/blob/' + this.ref + '/' + this.path; },
      get baseUrl() { return 'https://github.com/' + this.repo + '/blob/' + this.baseName + '/' + (this.prevPath || this.path); },
      get rawUrl() { return 'https://raw.githubusercontent.com/' + this.repo + '/' + this.ref + '/' + this.path; },
      get lastCommitUrl() { return 'https://github.com/' + this.repo + '/commit/' + this.lastCommit; },
      get tossUrl() {
        if (!/\.html?$/i.test(this.path) || this.repo.split('/')[0] !== 'mehrlander') return '';
        return 'https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=' + this.repo + '@' + this.ref + ':' + this.path;
      },
      get diffable() { return this.newText !== null && this.baseText !== null && this.newText !== this.baseText; },
      get identical() {
        return this.loaded && this.newText !== null && this.baseText !== null && this.newText === this.baseText;
      },
      get patchDump() {
        return '--- ' + (this.prevPath || this.path) + ' (' + this.baseName + ')\n'
          + '+++ ' + this.path + ' (' + this.ref + ')\n' + this.patch;
      },
      get patchLines() {
        return (this.patch || '').split('\n').map(t => ({
          t,
          cls: t.startsWith('+') ? 'bg-success/10 text-success-content'
             : t.startsWith('-') ? 'bg-error/10 text-error-content'
             : t.startsWith('@@') ? 'bg-info/10' : ''
        }));
      },

      // Opening costs nothing when the host already handed over a patch.
      //
      // The compare API returns the patch text WITH the file list, so a card
      // mounted from a compare is holding the unified diff before anyone taps
      // it. `toggle()` used to call `load()` regardless, which put a spinner
      // and two contents calls in front of content already in memory: thirty
      // cards opened meant sixty calls to show what thirty already had. Content
      // is fetched when a tab that genuinely needs it is chosen, which is what
      // setTab does below.
      toggle() {
        this.open = !this.open;
        if (!this.open) { this._teardown(); return; }
        if (this.loaded || this.loading) { this._render(); return; }
        // The patch is already in hand, so a text file opens on it for free.
        // A file with a presentation of its own does not: opening a PNG on the
        // patch of its bytes is the old behaviour this pass exists to end.
        if (this.patch && !this.shownPane) { this.tab = 'patch'; return; }
        this.load();
      },

      _gh(ref) {
        // WITH the viewer's token: this shipped tokenless, which read private
        // repos as 404 ("Load failed" on every card of a private branch) and
        // spent the 60/hr anonymous limit on public ones. Reads only, and the
        // same gate as every other client here: no token, public repos only.
        return new window.GH({ token: window.TOKEN, repo: this.repo, ref });
      },

      async load() {
        if (this.loaded || this.loading) { if (this.loaded) this._render(); return; }
        // Say so when the address is not an address. A card handed something
        // other than 'owner/name' spends two contents calls on a URL that
        // cannot resolve, and a 404 there is indistinguishable from a file that
        // genuinely is not on that ref: the card silently drops to its Patch
        // tab. branch-brief.js shipped exactly that for a while (an Alpine
        // data-provider function where the repo should have been, see its
        // cardOpts note), and nothing on the page said a word.
        if (!/^[^/\s]+\/[^/\s]+$/.test(String(this.repo || ''))) {
          this.error = 'No repo for this card (got: ' + String(this.repo).slice(0, 40) + ')';
          return;
        }
        this.loading = true;
        this.error = '';
        // A file whose kind is known from its name and is not text takes the
        // bytes path instead of two UTF-8 decodes. An image has no base side
        // worth diffing, and a gzip's diff is a diff of compressed bytes.
        if (this.kind && !TEXTUAL[this.kind]) {
          try {
            await this._loadShown();
            this.loaded = true;
            if (!this._picked || !this._tabUsable(this.tab)) this.tab = this._defaultTab();
            this._fetchLastCommit();
          } catch (e) {
            this.error = 'Load failed: ' + (e.message || e);
          }
          this.loading = false;
          return;
        }
        // status is a fact about the announced base, so a moved base voids it
        // and both sides are worth asking for: a file "added" on this branch
        // may well exist on the branch now being compared against.
        const wantNew = this._baseMoved || this.status !== 'removed';
        const wantBase = this._baseMoved || this.status !== 'added';
        const grab = async (ref, path) => {
          try { return (await this._gh(ref).get(path)).text; }
          catch (e) { return (e.status === 404) ? null : Promise.reject(e); }
        };
        try {
          const [n, b] = await Promise.all([
            wantNew ? grab(this.ref, this.path) : null,
            wantBase ? grab(this.base, this.prevPath || this.path) : null,
          ]);
          this.newText = n;
          this.baseText = b;
          // Contents API base64 that decodes with NULs is binary; skip diffing.
          // This is the fallback for a file whose extension said nothing, and
          // it is what routes the card to the binary PANEL rather than leaving
          // it to print the decode. The old code set this flag, showed a notice
          // saying the content could not be shown, and then showed the content
          // anyway in the New pane, which was gated on a different condition.
          this.binary = [n, b].some(t => typeof t === 'string' && t.includes('\u0000'));
          if (this.binary) {
            this.kind = 'binary';
            this.size = (n || b || '').length;
            // Drop the decode. Keeping it left `newText` non-null, which made
            // the New pane usable, which is precisely how a notice saying the
            // content could not be shown ended up above the content. Nothing
            // downstream should be able to reach these bytes as text.
            this.newText = null;
            this.baseText = null;
          }
          if (!this.status || this._baseMoved) {
            this.status = (n !== null && b === null) ? 'added'
              : (n === null && b !== null) ? 'removed'
              : (n === b) ? 'unchanged' : 'modified';
          }
          this.loaded = true;
          // A tab the reader chose survives the fetch it triggered. Without
          // this, tapping New loaded the file and then snapped the card to
          // Diff, so the one control that says what you want to see was the
          // one thing the load ignored.
          if (!this._picked || !this._tabUsable(this.tab)) this.tab = this._defaultTab();
          if (this.tab === 'read') this._renderRead();
            this._render();
          this._fetchLastCommit();
        } catch (e) {
          this.error = 'Load failed: ' + (e.message || e);
        }
        this.loading = false;
      },

      // ── The comparison, as handed down ───────────────────────────────────
      //
      // Ignore a pair addressed to something else. The channel is a global, so
      // a card can hear a choice made for another repo or another branch (the
      // previous deck's, on a page where one deck followed another), and
      // silently diffing against a ref the reader never chose for this file is
      // the worst of the available failures.
      adoptCompare(d) {
        if (!this.read || !d) return;
        if (d.repo && this.repo && d.repo !== this.repo) return;
        if (d.ref && this.ref && d.ref !== this.ref) return;
        const off = !!d.off;
        if (off) {
          if (this.compareOff) return;
          this.compareOff = true;
          this._teardown();
          if (this.tab === 'diff' || !this._tabUsable(this.tab)) this.setTab(this._defaultTab());
          return;
        }
        this.compareOff = false;
        const base = d.base || this.base;
        if (base === this.base) { if (!this.tab) this.tab = this._defaultTab(); return; }
        this.base = base;
        this.baseName = d.baseName || base;
        // Both belong to the base that just left. See the header note.
        this.patch = '';
        this._baseMoved = true;
        if (this.loaded) this._reloadBase();
      },

      // Refetch the base side only. The new side did not move, and on a deck
      // slide it is already rendered: refetching it would blank the pane the
      // reader is looking at to arrive back at the same bytes.
      async _reloadBase() {
        if (this.binary || (this.kind && !TEXTUAL[this.kind])) return;
        this.baseText = null;
        this._teardown();
        this.loading = true;
        this.error = '';
        try {
          // prevPath is the rename as the ANNOUNCED base saw it, so on any
          // other ref it is a guess rather than a fact. It is still the best
          // guess available, so it goes first and the current path is the
          // fallback, at the cost of one extra call on a renamed file only.
          const g = this._gh(this.base);
          const grab = async (p) => {
            try { return (await g.get(p)).text; }
            catch (e) { if (e.status === 404) return null; throw e; }
          };
          this.baseText = await grab(this.prevPath || this.path);
          if (this.baseText === null && this.prevPath) this.baseText = await grab(this.path);
          this.status = this.newText === null ? 'removed'
            : this.baseText === null ? 'added'
            : this.newText === this.baseText ? 'unchanged' : 'modified';
        } catch (e) {
          this.error = 'Load failed: ' + (e.message || e);
        }
        this.loading = false;
        if (!this._tabUsable(this.tab)) this.tab = this._defaultTab();
        if (this.tab === 'diff') this._render();
      },

      // Whether a tab can actually show something, once the content is known.
      _tabUsable(t) {
        return t === 'patch' ? !!this.patch
             : t === 'diff' ? this.diffable
             : t === 'new' ? this.newText !== null
             : t === 'base' ? this.baseText !== null
             : t === this.shownPane;
      },

      // ── What this file is shown as ───────────────────────────────────────

      // The pane that shows the FILE rather than its source, or '' where the
      // file is just text. One per kind, so this is a lookup and not a policy.
      get shownPane() {
        // `html` answers only where tossUrl does. That getter is the allowlist
        // (the renderer fetches same-origin, so it takes mehrlander repos and
        // no others), and a Render tab whose iframe could not load anything
        // would be worse than no tab: the card would open on a blank frame
        // with its source tabs one tap further away than they used to be.
        if (this.kind === 'html') return this.tossUrl ? 'render' : '';
        return { markdown: 'read', image: 'image', svg: 'image', pdf: 'page',
                 gzip: 'inside', binary: 'binary' }[this.kind] || '';
      },

      // The strip, in reading order: what the file is, then how it changed.
      // Diff and the source panes are offered before the content is in hand,
      // since until the fetch runs there is no way to know whether a file is
      // diffable and hiding the tab that triggers the fetch would leave the
      // card with no way to reach it. A binary offers no source panes at all,
      // which is the whole point: there is nothing there a reader can use.
      get panes() {
        const p = [];
        const shown = this.shownPane;
        // A reading surface: the file, and the comparison as ONE pane, because
        // the pair is chosen elsewhere and Diff/Patch/New/Base were four
        // readings of a pair this card no longer owns. Where the file has no
        // presentation of its own, its source IS the file pane.
        if (this.read) {
          p.push(shown
            ? { id: shown, label: PANE_LABEL[shown] }
            : { id: 'new', label: 'File' });
          if (this.comparable) p.push({ id: 'diff', label: 'Compare' });
          return p;
        }
        if (shown) p.push({ id: shown, label: PANE_LABEL[shown] });
        if (this.kind === 'binary' || this.kind === 'image' || this.kind === 'pdf') {
          if (this.patch) p.push({ id: 'patch', label: 'Patch' });
          return p;
        }
        if (this.diffable || !this.loaded) p.push({ id: 'diff', label: 'Diff' });
        if (this.patch) p.push({ id: 'patch', label: 'Patch' });
        if (this.newText !== null || !this.loaded) p.push({ id: 'new', label: 'New' });
        if (this.baseText !== null || !this.loaded) p.push({ id: 'base', label: 'Base' });
        return p;
      },

      // Where a card lands once it knows what it is holding.
      //
      // An image, an archive and a binary have no useful diff, so their own
      // pane wins outright. Markdown is the judgement call, and it is the
      // SURFACE that decides: the deck exists to read a file and passes
      // `read`, while a changed-file list exists to review one and does not.
      // Whether there is a second version to show at all: the sidebar has not
      // turned comparison off, the file is one a diff means something for, and
      // either the bytes are in and they differ or the fetch has not run yet
      // (hiding the tab before the load would leave nothing to trigger it).
      get comparable() {
        if (this.compareOff || this.kind === 'image' || this.kind === 'pdf'
            || this.kind === 'binary') return false;
        return this.diffable || !this.loaded;
      },

      // WHICH KINDS DEFER TO THE DIFF IN A LIST, and it is the same argument
      // twice. Markdown and html are both source someone edits, so how they
      // CHANGED is the question a changed-file list is asking, while an image,
      // an archive and a binary have no useful diff and their own pane wins
      // outright. A reading surface (`read`) asks the other question and gets
      // the document or the running page.
      _defers: { read: 1, render: 1 },
      _defaultTab() {
        const shown = this.shownPane;
        if (this.read) {
          if (shown) return shown;
          return this.comparable && (this.diffable || this.newText === null) ? 'diff' : 'new';
        }
        if (shown && !this._defers[shown]) return shown;
        return this.diffable ? 'diff'
             : this.patch ? 'patch'
             : this.newText !== null ? 'new'
             : this.baseText !== null ? 'base'
             : (shown || '');
      },

      // ── ONE CONTROL WHERE THERE WERE TWO ────────────────────────────────
      //
      // A reading surface offered the file and the comparison as text tabs, and
      // then, once you were on the comparison, a second pair of icons for split
      // against unified. Three choices in two controls with a mode between
      // them, which is what the reader saw as too many buttons hovering at the
      // top (2026-09-05).
      //
      // One group of three now, and the icons say the LAYOUT rather than naming
      // the thing: one pane, two columns, two rows. That is why it can be
      // icon-only where the text tabs could not: a reader is picking how much
      // of the screen the comparison takes, not learning a vocabulary.
      //
      // Nothing where there is no comparison: a segmented control of one
      // segment is not a control, and an image or a binary with no diff would
      // have had exactly that.
      get viewModes() {
        // A reading surface's control and nothing else's. A list picks among
        // named panes, which is a different question from how wide to draw a
        // comparison, and stating that here keeps the template from being the
        // only place the rule lives.
        const first = this.panes[0];
        if (!this.read || !first || !this.comparable) return [];
        return [
          { key: 'file', id: first.id, view: '', icon: 'ph-square',
            label: first.label, on: this.tab !== 'diff' },
          { key: 'split', id: 'diff', view: 'split', icon: 'ph-columns',
            label: 'Compare, side by side', on: this.tab === 'diff' && this.view === 'split' },
          { key: 'unified', id: 'diff', view: 'unified', icon: 'ph-rows',
            label: 'Compare, inline', on: this.tab === 'diff' && this.view === 'unified' },
        ];
      },
      // View before tab: setTab('diff') mounts the editor, so setting the view
      // afterwards would build it once in the old layout and again in the new.
      pickView(m) {
        if (m.view && m.view !== this.view) this.setView(m.view);
        if (this.tab !== m.id) this.setTab(m.id);
      },

      // ── The comparison, as a control rather than a caption ──────────────
      //
      // A reading card used to carry a line under its tabs reading "against
      // main". True, and inert: the pair is chosen in the sidebar, which on a
      // phone is closed, so the one place the reader met the fact was the one
      // place they could do nothing about it. It is a dropdown on the control
      // row now and the line is gone, which is a whole row back.
      //
      // The card still does not OWN the pair. Picking here publishes on the
      // same web-tools:compare-ref channel the sidebar's compare bar uses, so
      // every card on the page moves together and the sidebar stays in step;
      // adoptCompare is what hears it, here and everywhere else.
      //
      // What it offers is what the card can name without a fetch: the base it
      // was mounted with, whatever ref has since been adopted, and off. A
      // branch list belongs to the sidebar, which can afford the call.
      get compareChoices() {
        const out = [], seen = new Set();
        const add = (base, label) => {
          if (!base || seen.has(base)) return;
          seen.add(base);
          out.push({ key: base, base, label: label || base,
                     on: !this.compareOff && this.base === base });
        };
        add(this._homeBase, this._homeBaseName);
        add(this.base, this.baseName);
        out.push({ key: 'off', off: true, label: 'No comparison', on: this.compareOff });
        return out;
      },
      // ALWAYS REACHABLE, which is the one thing the tab could not be. Turning
      // the comparison off empties viewModes (there is nothing to lay out), so
      // a control that appeared only on the comparison would have been the way
      // out of a state with no way back into it.
      get comparePicker() { return this.read && (this.comparable || this.compareOff); },
      pickCompare(c) {
        if (this.$refs.cmpMenu) this.$refs.cmpMenu.open = false;
        const detail = c.off ? { repo: this.repo, ref: this.ref, off: true }
                             : { repo: this.repo, ref: this.ref, base: c.base, baseName: c.label };
        window.__compareRef = detail;
        window.dispatchEvent(new CustomEvent('web-tools:compare-ref', { detail }));
        if (!c.off && this.tab !== 'diff') this.setTab('diff');
      },

      // A pane's frame, and whether it has one.
      //
      // In a list the pane is a box inside a row: a border, a cap on its
      // height, and its own scrollbar, so thirty rows stay navigable. In a
      // deck the pane IS the slide, the slide already scrolls, and repeating
      // all three put a scrollbar inside a scrollbar and cost width to two
      // layers of padding that framed nothing.
      get paneClass() {
        if (this.bare) return 'w-full p-0 bg-transparent';
        // A READING CARD GIVES THE CONTENT THE CARD'S WHOLE WIDTH. The frame
        // that earns its place around one pane of thirty in a list is, on a
        // surface whose point is looking at the file, three insets deep before
        // the prose starts: the page's px-4, the card's border, then this
        // pane's own border and padding. 42px of a 390px screen, and a reading
        // column narrowed to 314. The negative margin cancels the wrapper's
        // px-3 and px-2 is what keeps the text off the card's own border.
        if (this.read) return '-mx-3 px-2 py-1 max-h-[70vh] overflow-auto bg-base-100';
        return 'border border-base-200 rounded max-h-[70vh] overflow-auto bg-base-100 p-2';
      },

      get proseClass() {
        return window.GuideRender ? window.GuideRender.bodyClass('page') : 'prose !max-w-none';
      },
      // What one tap on the copy button takes, and it is whatever the reader
      // is looking at. The old pair of buttons made the reader map "content"
      // and "patch" onto the tab they were on, and offered "content" for a PNG.
      //
      // Diff is the one that needs saying: a CM6 editor is not text a clipboard
      // can take, so what it copies is the unified patch the diff was built
      // from. Where there is no patch (a card that fetched both sides itself)
      // there is nothing honest to give and the button goes.
      get copyable() {
        switch (this.tab) {
          case 'read':
          // A rendered page is not text a clipboard can take, but the file
          // behind it is, and it is the file the reader is looking at. Same
          // answer as `read` for the same reason.
          case 'render':
          case 'new': return this.newText;
          case 'base': return this.baseText;
          case 'patch':
          case 'diff': return this.patchDump || null;
          case 'inside': return this.insideText || null;
          default: return null;      // an image, a binary: nothing to take
        }
      },
      get copyTitle() {
        const what = { read: this.namePart, render: this.namePart, new: this.namePart,
                       base: 'the base version', patch: 'the patch', diff: 'the patch',
                       inside: 'what is inside' }[this.tab];
        return 'Copy ' + (what || 'this');
      },

      get binaryNote() {
        return [this.kind === 'binary' ? 'Not text' : 'Binary',
                KB(this.size)].filter(Boolean).join(' · ');
      },

      // Everything a non-text file needs, from the bytes rather than from a
      // UTF-8 decode of them. Runs instead of the two text fetches, not beside
      // them: an image has no base side worth diffing and a gzip's diff is the
      // diff of compressed bytes, which is noise.
      // The bytes, from `gh.bytes()` where the client has it and by hand where
      // it does not.
      //
      // The fallback is not defensive coding for its own sake. gh-api.js and
      // this file are two separate jsDelivr cache entries, so after a merge the
      // CDN can serve a NEW component against an OLD client for as long as it
      // takes the caches to agree, and `gh.bytes is not a function` would take
      // out the image and archive panes with no way for a reader to tell why.
      // The purge link in CLAUDE.md shortens that window; this closes it. Yes,
      // it repeats the client's own over-1MB blobs fallback, and that repeat is
      // the price of the pane never depending on which of two files arrived
      // first.
      async _bytes(ref) {
        const gh = this._gh(ref);
        if (typeof gh.bytes === 'function') return gh.bytes(this.path);
        const data = await gh.req('contents/' + this.path + '?ref=' + ref);
        const content = data.content || (await gh.req('git/blobs/' + data.sha)).content;
        const bin = atob(String(content).replace(/\s/g, ''));
        return { bytes: Uint8Array.from(bin, c => c.charCodeAt(0)), size: data.size };
      },

      async _loadShown() {
        const ref = this.status === 'removed' ? this.base : this.ref;
        const { bytes, size } = await this._bytes(ref);
        this.size = size ?? bytes.length;
        if (this.kind === 'image') {
          const mime = IMAGE_EXT[EXT(this.path)] || 'application/octet-stream';
          this.mediaUrl = 'data:' + mime + ';base64,' + b64(bytes);
          return;
        }
        if (this.kind === 'pdf') {
          // Held, not decoded: the bytes go to pdf.js, and a data: URI of a
          // multi-megabyte submittal would be a string nobody reads.
          this._pdfBytes = bytes;
          return;
        }
        if (this.kind === 'svg') {
          // An SVG is text, and inlining it as a data: URL keeps it in an
          // <img>, which is the sandbox that stops a repo file from running
          // script in this page.
          this.mediaUrl = 'data:image/svg+xml;base64,' + b64(bytes);
          return;
        }
        if (this.kind === 'gzip') {
          if (typeof DecompressionStream !== 'function') {
            this.kind = 'binary';
            return;
          }
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
          const inflated = new Uint8Array(await new Response(stream).arrayBuffer());
          // A .tgz inflates to a TAR, which is another archive and not text,
          // so the NUL sniff runs again on what came OUT rather than assuming
          // the inflate settled the question.
          const text = new TextDecoder().decode(inflated.subarray(0, CAP));
          if (text.includes('\u0000')) {
            this.kind = 'binary';
            this.size = inflated.length;
            return;
          }
          this.insideText = text;
          this.insideNote = KB(this.size) + ' compressed, ' + KB(inflated.length) + ' inside'
            + (inflated.length > CAP ? ', showing the first ' + KB(CAP) : '');
          return;
        }
      },

      // The workbench, addressed. Same grammar every other #gh= link uses, so
      // the card hands off rather than growing a pager it would have to keep
      // in step with pdf-inspect's.
      get pdfInspectUrl() {
        const addr = this.repo + (this.ref ? '@' + this.ref : '') + ':' + this.path;
        return 'https://mehrlander.github.io/web-tools/pages/pdf-inspect.html#gh=' + addr;
      },

      // One page, drawn, through kits/pdf.js's firstLook: the same helper the
      // viewer's pdf mode uses, so a page looks the same wherever it is shown
      // and the device-pixel arithmetic lives in one place. Lazy, like the
      // markdown pass below: a card never opened on its Page tab costs nothing
      // beyond the bytes it already fetched.
      async _drawPdf() {
        if (!this._pdfBytes || this.pdfPages || this._drawing) return;
        this._drawing = true;
        try {
          // Wait for the canvas rather than giving up on it. The first call
          // comes from load(), which finishes before the pane it just made
          // available has rendered, so `$refs.pdfCanvas` is reliably absent on
          // the tick that matters. Returning quietly there left the card
          // stuck on "Reading the PDF…" with every other signal correct,
          // which is a poor way to say "the element was not there yet".
          let canvas = null;
          for (let i = 0; i < 20 && !canvas; i++) {
            canvas = this.$refs.pdfCanvas;
            if (!canvas) await new Promise(r => setTimeout(r, 25));
          }
          if (!canvas) { this.pdfNote = 'No canvas to draw into.'; return; }

          if (!window.pdf) {
            if (window.gh?.load) await window.gh.load('kits/pdf.js');
            else await new Promise((res, rej) => Object.assign(
              document.head.appendChild(document.createElement('script')),
              { src: 'https://cdn.jsdelivr.net/gh/mehrlander/web-tools@main/lib/kits/pdf.js',
                onload: res, onerror: rej }));
          }
          if (!window.pdf) { this.pdfNote = 'The PDF kit did not load.'; return; }
          const look = await window.pdf.firstLook(this._pdfBytes);
          const room = Math.max(160, (canvas.parentElement?.clientWidth || 320) - 24);
          await look.draw(1, canvas, { width: room });
          this.pdfPages = look.pages;
          this.pdfNote = `${look.pages} page${look.pages === 1 ? '' : 's'} · ${KB(this.size)}`
            + (look.pages > 1 ? ' · page 1 shown' : '');
        } catch (e) {
          this.pdfNote = 'Could not read the PDF: ' + ((e && e.message) || String(e));
        } finally {
          this._drawing = false;
        }
      },

      // Markdown, rendered by the same kit that renders a guide body, so this
      // estate has one answer to what its prose looks like. Lazy, like the
      // registry read and the file deck: a card never opened on Read pays for
      // no parser.
      async _renderRead() {
        if (this.readHtml || this.newText == null) return;
        try {
          if (!window.GuideRender) await window.gh?.load('kits/guide-render.js');
          await window.GuideRender.needMarked();
        } catch { return; }
        // Frontmatter is FENCED first, through the peek card's own helper.
        // Half this estate's docs open with a `---` block, and marked renders
        // a bare one as a run of prose, so the doc opened on
        // "status: living date: 2026-08-14" as though that were its first
        // paragraph. kits/source-peek.js hit this and fixed it; map.js's
        // renderDoc already borrows the fix, and this is the third reader of
        // the same rule rather than a third copy of it.
        let src = this.newText;
        try {
          if (!window.SourcePeek) await window.gh?.load('kits/source-peek.js');
          if (window.SourcePeek?.fenceFrontmatter) src = window.SourcePeek.fenceFrontmatter(src);
        } catch { /* unfenced is the old behaviour, not a failure */ }
        const out = window.GuideRender.render(src, {
          knownRefs: [this.ref, this.base, 'main'].filter(Boolean),
          preferRef: this.ref,
        });
        this.readHtml = out.html;
        // AND THEN THE SECOND HALF, over the markup the guide renderer just
        // made. kits/md-doc.js contains what can widen the pane (a wide table,
        // a long command line), stamps every heading with a control over that
        // section's SOURCE, and declares the address so a note taken here reads
        // `docs/APP.md § Mechanism (lines 16-28)` rather than a css path.
        //
        // A pass rather than a second renderer, because the guide renderer's
        // link re-aiming is the reason this pane uses it and a card cannot have
        // both by choosing. `$nextTick`, because x-html has not written the
        // markup yet: enhancing now would stamp the PREVIOUS file's headings,
        // which is the quiet version of this going wrong.
        //
        // Best effort throughout: no kit, no controls, and the prose is
        // unchanged.
        this.$nextTick(async () => {
          try {
            if (!window.srcDoc) await window.gh?.load('kits/src-doc.js');
            if (!window.mdDoc) await window.gh?.load('kits/md-doc.js');
            const box = this.$refs.readBox;
            if (!window.mdDoc || !box) return;
            window.mdDoc.enhance(box, src, {
              addr: { repo: this.repo, ref: this.ref, path: this.path, url: this.newUrl },
            });
          } catch { /* the pane still reads */ }
        });
      },

      async _fetchLastCommit() {
        if (this.lastCommit || this.status === 'removed') return;
        try {
          const c = await this._gh(this.ref).req(
            'commits?path=' + encodeURIComponent(this.path)
            + '&sha=' + encodeURIComponent(this.ref) + '&per_page=1');
          this.lastCommit = c?.[0]?.sha || '';
        } catch { /* the link row just stays without it */ }
      },

      // Diff, New and Base are the three that need the file's bytes, so they
      // are where the fetch happens; Patch never does.
      setTab(t) {
        // A tab that is not on the strip cannot be shown, and showing nothing
        // is the one outcome worse than showing the wrong pane: an empty card
        // reads as a load that failed. Only reachable programmatically (the
        // strip renders `panes`), which is exactly when it happens.
        const on = this.panes;
        if (on.length && !on.some(p => p.id === t)) t = this._defaultTab();
        this.tab = t;
        this._picked = true;
        if (t !== 'patch' && !this.loaded && !this.loading) { this.load(); return; }
        if (t === 'diff') this._render();
        if (t === 'read') this._renderRead();
      },
      setView(v) {
        this.view = v;
        try { localStorage.setItem('reviewDiffView', v); } catch {}
        this._render();
      },

      async _render() {
        if (this.tab !== 'diff' || !this.diffable) return;
        const host = this.$refs.cmhost;
        if (!host || !window.cm6Merge) return;
        this._teardown();
        const mine = this._renderSeq = (this._renderSeq || 0) + 1;
        const language = cm6Merge.langFor(this.path);
        try {
          const h = this.view === 'unified'
            ? await cm6Merge.unified(host, { original: this.baseText, doc: this.newText, language })
            : await cm6Merge.split(host, { a: this.baseText, b: this.newText, language });
          // A tab/view flip while CM6 modules were loading supersedes this render.
          if (mine !== this._renderSeq) { h.destroy(); return; }
          this._cm = h;
        } catch (e) {
          // CM6 modules come from esm.sh; a blocked or flaky CDN must not kill
          // the card — the Patch / New / Base tabs stay usable.
          if (mine === this._renderSeq && this.$refs.cmhost) {
            this.$refs.cmhost.innerHTML =
              '<div class="p-3 text-sm opacity-60 italic">Diff view unavailable ('
              + ((e && e.message) || e) + '). '
              + (this.read ? 'The file itself is one tab away.'
                           : 'Use the Patch, New, or Base tab.') + '</div>';
          }
        }
      },

      _teardown() {
        if (this._cm) { this._cm.destroy(); this._cm = null; }
        if (this.$refs.cmhost) this.$refs.cmhost.innerHTML = '';
      },

      destroy() {
        this._teardown();
        if (this._onCompare) window.removeEventListener('web-tools:compare-ref', this._onCompare);
      }
    };
  });
});
