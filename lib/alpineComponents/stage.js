// The stage: a cross-repo fileset staged for action (view, copy out, send to
// a repo), presented as an estate-context view in show-repo — one stage above
// any repo, beside Repos and Surfaces, since staged items each carry their own
// origin and the set never belonged to the open repo. The link is the
// transport: a #stage= fragment names a set of refs and opens the view
// preloaded with them. Content stays behind the viewer's token; the link
// carries only refs. (A content-carrying #gz= bundle form for token-less
// contexts is a contemplated follow-up, not built here.)
//
// Takes from: upload (drop-zone), a repo (the path-picker grab row here, or
// the + on Files rows while visiting a repo), #stage= links, and manifest
// stage.files seeds. Puts to: clipboard (the concatenated bundle), a repo
// (send), with bundle download as the clipboard's fallback. Preview is inline;
// it does not route through any repo's Files view.
//
// A staged item is one of two kinds. A REF ({repo, ref, path}) points at a
// file that already lives in a repo; the bundle fetches it and the transfer
// copies it. A LOCAL item ({local:true, name, bytes|text}) is a file dropped
// straight into the stage, its bytes held in memory. Both ride the one stage
// array and both flow through the one "Copy to repo" deposit: refs via
// gh.copyTo, local bytes via gh.saveBytes/save. A local item is transient (its
// bytes can't serialize), so it is left out of the #stage= link and the
// .web-tools.json save; the ref items carry those.
//
// Grammar, both directions (StageLink.parseLink / StageLink.mint):
//
//   #stage=owner/repo[@ref]:path1,path2;owner2/repo2:path3[&prompts=<b64url>][&mode=diff]
//
// Groups are ';'-separated, paths ','-separated, @ref optional (absent means
// the source repo's default branch). Paths are URL-encoded per component with
// '/' left readable.
//
// A link is one object with three parts: REFS (the stage spec above),
// COMMENTARY (an optional &prompts= param, a base64url'd JSON list of
// {label, ask} review asks), and MODE (an optional &mode=diff, the intent that
// this stage opens as a diff, on the Diff tab, run without a click). Refs are
// pointers, so their content stays behind the token; the prompts and the mode
// are authored, so they ride the link itself. mint() serializes all of it from
// that object; parseLink() returns { items, prompts, mode }, and the bare
// parse() keeps returning just the items for callers (the shell seed) that only
// want refs. This is the seed of a richer "surface" schema: the same
// {refs, commentary, mode} shape a manifest's stage block or a future surface
// file would carry, with file content the file-only extra.

// The Diff lens's review-prompts panel: a fixed set of general review asks,
// shown once a diff has run. Each copies the two compared texts plus the
// diff, with that prompt's specific ask appended, for pasting into a
// separate chat as a second, independent review. Bespoke (document-specific)
// prompts ride the stage link's &prompts= commentary (see StageLink); the
// panel shows those first, then this fixed set.
const DIFF_PROMPTS = [
  ['Tighten it', 'Read the edit above without losing any information. Where can this be tightened further? Point to specific sentences or phrases that could be cut, and say what would be lost or gained by cutting them.'],
  ['Fresh-eyes clarity', 'Read this as someone new to the topic. Where does it lose you, assume too much, or need more context?'],
  ['Consistency check', 'Does the edited version stay consistent with the original in tone, terminology, and claims? Flag anything that drifted.'],
  ['Fact and logic check', 'Check the edit for factual, numerical, or logical errors relative to the original. Call out anything that does not hold up.'],
  ['Was it worth it', 'Compare the two versions plainly. Does the edit make the document better, or just different? Would you have made this edit?'],
  ['Open critique', 'Give an unprompted, honest critique of this edit. What would you push back on?'],
];

window.StageLink = (() => {
  // "owner/repo[@ref]:path" -> { repo, ref, path } | null (no match: a bare
  // path, or garbage). Used for manifest stage.files entries and link groups.
  //
  // Delegates to lib/repo-address.js, which owns the grammar. Read at call time
  // rather than at load: this component registers during the bundle's boot,
  // before a page's own gh.load chain has run.
  const parseItem = (s) => {
    if (!window.RepoAddress) throw new Error('stage.js requires window.RepoAddress (load repo-address.js first)');
    return window.RepoAddress.parse(s);
  };

  const fmtItem = (it) => it.repo + (it.ref ? '@' + it.ref : '') + ':' + it.path;

  // Commentary encoding: a base64url'd JSON list of {label, ask}. UTF-8-safe
  // (the escape/encodeURIComponent sandwich), so a prompt can hold any text.
  // A soft cap on the list length keeps a runaway set from bloating the URL.
  const PROMPTS_MAX = 24;
  const b64urlEnc = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64urlDec = (s) => decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))));
  const cleanPrompts = (list) => (Array.isArray(list) ? list : [])
    .map(p => ({ label: String(p && p.label || '').trim(), ask: String(p && p.ask || '').trim() }))
    .filter(p => p.label && p.ask)
    .slice(0, PROMPTS_MAX);
  const encodePrompts = (list) => {
    const clean = cleanPrompts(list);
    return clean.length ? b64urlEnc(JSON.stringify(clean)) : '';
  };
  const decodePrompts = (s) => {
    if (!s) return [];
    try { return cleanPrompts(JSON.parse(b64urlDec(s))); } catch { return []; }
  };

  // Split a hash/fragment into its '&'-joined key=value params. Paths in the
  // stage spec URL-encode '&' (encodeURIComponent), so a literal '&' in the
  // fragment is always a param delimiter, never path content.
  const fragParams = (hash) => {
    // Accept a full URL, a bare location.hash, or a bare spec: take everything
    // after a '#' when one is present, else the whole string.
    let s = String(hash || '');
    const h = s.indexOf('#');
    if (h >= 0) s = s.slice(h + 1);
    const out = {};
    for (const part of s.split('&')) {
      const eq = part.indexOf('=');
      if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
    }
    return out;
  };

  // Accepts a full location.hash (leading '#' and all) or a bare spec, and
  // returns the whole object: { items, prompts }. parse() below is the refs-only
  // projection for callers (the shell seed) that don't want commentary.
  const parseLink = (hash) => {
    const p = fragParams(hash);
    const items = [];
    if (p.stage != null) {
      for (const group of p.stage.split(';')) {
        // A group is one address whose path half is a ','-joined list, so the
        // shared parser reads it and the list is split out of `path`.
        const g = parseItem(group);
        if (!g) continue;
        for (const seg of g.path.split(',')) {
          let path;
          try { path = decodeURIComponent(seg.trim()); } catch { continue; }
          if (path) items.push({ repo: g.repo, ref: g.ref, path });
        }
      }
    }
    return { items, prompts: decodePrompts(p.prompts), mode: p.mode === 'diff' ? 'diff' : '' };
  };
  const parse = (hash) => parseLink(hash).items;

  // Read the whole object from a location, hash first, then the ?query as a
  // fallback (same keys: stage, prompts, mode). The query form is what lets a
  // stage ride a context that eats the fragment: a toss-render srcdoc (whose
  // params shim answers ?query lookups), an email or chat that strips the '#',
  // a deep link. The fragment stays the default and the private form.
  //
  // The source choice rides lib/url-params.js, so the precedence rule has one
  // statement, and the three keys always come from the SAME source: a fragment
  // stage is never paired with a stray ?prompts= from a different link. One
  // deliberate consequence of the shared rule (decided 2026-08-02): an empty
  // '#stage=' counts as a miss, so a truncated link that kept the fragment key
  // but lost its value falls back to a populated ?stage= instead of silently
  // staging nothing. The presence-based read this replaced kept the empty
  // fragment. The fragment itself still goes to parseLink raw, not through
  // UrlParams.get: paths encode '&' as %26, which URLSearchParams would decode
  // into a live delimiter.
  const read = (loc) => {
    const l = loc || (typeof location !== 'undefined' ? location : {});
    if (!window.UrlParams) throw new Error('stage.js requires window.UrlParams (load url-params.js first)');
    if (window.UrlParams.source('stage', l) === 'search') {
      let q;
      try { q = new URLSearchParams(String(l.search || '').replace(/^\?/, '')); }
      catch { return parseLink(String(l.hash || '')); }
      let synth = 'stage=' + q.get('stage');
      const pr = q.get('prompts'); if (pr) synth += '&prompts=' + pr;
      const md = q.get('mode'); if (md) synth += '&mode=' + md;
      return parseLink('#' + synth);
    }
    return parseLink(String(l.hash || ''));
  };

  // mint(items, base, opts): opts is { prompts, mode } (the surface object's
  // commentary and intent), or a bare prompts array for the legacy call.
  const mint = (items, base, opts) => {
    const o = Array.isArray(opts) ? { prompts: opts } : (opts || {});
    const groups = new Map();
    for (const it of items) {
      const k = it.repo + (it.ref ? '@' + it.ref : '');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(encodeURIComponent(it.path).replace(/%2F/gi, '/'));
    }
    const spec = [...groups.entries()].map(([k, ps]) => k + ':' + ps.join(',')).join(';');
    const enc = encodePrompts(o.prompts);
    const mode = o.mode === 'diff' ? '&mode=diff' : '';
    return (base || '') + '#stage=' + spec + (enc ? '&prompts=' + enc : '') + mode;
  };

  return { parse, parseLink, read, mint, parseItem, fmtItem, encodePrompts, decodePrompts };
})();

document.addEventListener('alpine:init', function() {
  Alpine.data('stager', function() {
    const fmt = t => t.replace(/ {4}/g, '  ');
    const joinDir = (dir, name) => dir ? dir.replace(/\/+$/, '') + '/' + name : name;
    // Monotonic id source for local items. A closure, not a component field:
    // onDropped runs in the drop-zone's child scope, where `this` is not the
    // stager, so a `this`-based counter would land on the wrong object.
    let seq = 0;

    return {
      description: 'The staged fileset as a main-area view: dropped local files and cross-repo refs in one stage, with view/remove per item and one send/save/mint deposit',

      template: `
        <div class="relative min-h-[55vh]"
             @dragenter.prevent="_dragDepth++"
             @dragover.prevent
             @dragleave.prevent="_dragDepth = Math.max(0, _dragDepth - 1)"
             @drop.prevent="onPageDrop($event)">

          <!-- Browse-to-add, the click path for the whole-page drop. -->
          <input type="file" multiple x-ref="fileInput" class="hidden" @change="onBrowse($event)">

          <!-- No title row: the sidebar tab already says Stage, and no other
               view titles itself. The stage-wide actions (add, link, clear)
               sit in the tab bar beside the lens actions; the count lives on
               the aside's Staged label; the empty state carries Add file,
               since the tab bar does not exist until something is staged. -->

          <!-- Two panes: the lens (Out / Diff) is the workspace and leads;
               staged items and the adder sit beside it on desktop, below it on
               mobile. The lens is what you came to do; the rest is supply. -->
          <div class="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_20rem]">

            <!-- MAIN: the lens. -->
            <div class="flex flex-col gap-2 min-w-0">
              <!-- Empty stage: the guidance the removed drop-box used to carry,
                   now that the whole view is the target. -->
              <div x-show="!items.length"
                   class="border border-dashed border-base-300 rounded-xl py-16 px-4 text-center">
                <i class="ph ph-tray-arrow-down text-4xl opacity-25 block mb-3"></i>
                <p class="text-base text-base-content/60">Drop files or paste refs anywhere, or grab from a repo.</p>
                <p class="text-base text-base-content/40 mt-1">Two files with the same name open ready to diff.</p>
                <button @click="$refs.fileInput.click()" class="btn btn-ghost btn-sm gap-1.5 mt-4"
                        title="Add a local file (or drop / paste anywhere on this view)">
                  <i class="ph ph-paperclip text-lg"></i>Add file
                </button>
              </div>

              <div x-show="items.length" class="flex flex-col gap-2">
                <!-- Tab bar: the two lenses (segmented pill, the shared internal-
                     tab style), the live stat, and the Out actions. -->
                <div class="flex items-center justify-between gap-2 border-b border-base-300 pb-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 shrink-0" role="tablist">
                      <button role="tab" @click="outTab = 'out'"
                              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                              :class="outTab === 'out' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                        <i class="ph ph-export text-lg"></i>Out</button>
                      <button role="tab" @click="outTab = 'diff'"
                              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                              :class="outTab === 'diff' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                        <i class="ph ph-git-diff text-lg"></i>Diff</button>
                    </div>
                    <span class="opacity-60 font-mono text-base truncate"
                          x-text="outTab === 'out' ? bundleStat : diffStat"></span>
                  </div>
                  <!-- Actions, in two groups: the lens's own (Out only, left of
                       the rule) and the stage-wide ones the removed title row
                       used to carry (right of it, on both tabs). -->
                  <div class="flex items-center gap-0.5 shrink-0">
                    <div class="flex items-center gap-0.5" x-show="outTab === 'out'">
                      <button @click="bundleShow = !bundleShow" class="btn btn-square btn-ghost"
                              :class="bundleShow && 'text-primary'" title="Show the concatenated block">
                        <i class="ph ph-brackets-curly text-xl"></i>
                      </button>
                      <button @click="rebuild()" :disabled="bundleBusy" class="btn btn-square btn-ghost" title="Refresh">
                        <i class="ph text-xl" :class="bundleBusy ? 'ph-circle-notch animate-spin' : 'ph-arrows-clockwise'"></i>
                      </button>
                      <button @click="copyBundle()" class="btn btn-square btn-ghost" title="Copy the concatenated block">
                        <i class="ph text-xl" :class="bundleCopied ? 'ph-check' : 'ph-copy'"></i>
                      </button>
                      <button @click="download()" class="btn btn-square btn-ghost" title="Download the concatenated block">
                        <i class="ph ph-download-simple text-xl"></i>
                      </button>
                      <span class="w-px h-5 bg-base-300 mx-1"></span>
                    </div>
                    <button @click="$refs.fileInput.click()" class="btn btn-square btn-ghost"
                            title="Add a local file (or drop / paste anywhere on this view)">
                      <i class="ph ph-paperclip text-xl"></i>
                    </button>
                    <button @click="copyLink()" class="btn btn-square btn-ghost"
                            title="Copy the persistent stage link: a #stage= URL that reopens these refs (and the current tab) anywhere (local files excluded)">
                      <i class="ph text-xl" :class="linkCopied ? 'ph-check' : 'ph-link'"></i>
                    </button>
                    <button @click="clearAll()" class="btn btn-square btn-ghost hover:text-error" title="Clear the stage">
                      <i class="ph ph-trash text-xl"></i>
                    </button>
                  </div>
                </div>

                <template x-if="outTab === 'out'">
                  <div class="flex flex-col gap-2">
                    <div x-show="bundleBusy && bundleShow" class="flex justify-center py-6">
                      <span class="loading loading-dots loading-md opacity-30"></span>
                    </div>
                    <div x-show="bundleShow && !bundleBusy && bundleText"
                         class="overflow-auto font-mono text-base leading-snug border border-base-300 rounded p-2 bg-base-200/40 max-h-[45vh] lg:max-h-[60vh] whitespace-pre"
                         x-text="bundleText"></div>

                    <!-- Send: destination via the dir-mode picker; two-tap arm. -->
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <div class="grow min-w-48" @path-pick="destSpec = $event.detail.spec">
                        <div x-data="pathPicker({ mode: 'dir', roots: () => pickerRoots(), placeholder: 'Send to: pick a repo folder' })"></div>
                      </div>
                      <button @click="send()" :disabled="sending || !destSpec.trim()"
                              class="btn gap-1" :class="sendArmed ? 'btn-error' : 'btn-primary'">
                        <i class="ph" :class="sending ? 'ph-circle-notch animate-spin' : 'ph-paper-plane-tilt'"></i>
                        <span x-text="sendLabel"></span>
                      </button>
                    </div>

                    <div class="flex items-center justify-between gap-2 flex-wrap">
                      <div class="flex items-center gap-1.5">
                        <input x-model="saveTarget" placeholder="owner/repo"
                               class="input input-bordered font-mono w-52" :disabled="savingStage">
                        <button @click="save()" :disabled="savingStage || !saveTarget.trim()"
                                class="btn btn-ghost gap-1 opacity-70 hover:opacity-100"
                                title="Write the staged ref list to that repo's .web-tools.json (local files excluded)">
                          <i class="ph" :class="savingStage ? 'ph-circle-notch animate-spin' : 'ph-push-pin'"></i>Save stage
                        </button>
                      </div>
                      <span class="text-base font-mono opacity-60 truncate" x-text="sendStatus"></span>
                    </div>
                  </div>
                </template>

                <template x-if="outTab === 'diff'">
                  <div class="flex flex-col gap-2">
                    <!-- A and B, each a full-width row: the select names the
                         side, the ref field overrides where it reads from
                         (blank = as staged). Same file twice with one ref
                         changed is the version diff. -->
                    <div class="flex items-center gap-1.5">
                      <span class="badge badge-sm badge-ghost font-bold w-6 justify-center shrink-0">A</span>
                      <select @change="diffA = +$event.target.value; _diffTouched = true; invalidateDiff()" class="select select-bordered font-mono flex-1 min-w-0">
                        <template x-for="(it, i) in items" :key="'a' + itemKey(it)">
                          <option :value="i" :selected="i === diffA" x-text="bundleHeader(it).replace('// === ', '')"></option>
                        </template>
                      </select>
                      <input x-show="!items[diffA]?.local" x-model="diffARef" @change="invalidateDiff()" placeholder="ref"
                             class="input input-bordered font-mono w-24 shrink-0" title="Read A at this ref instead of as staged">
                    </div>
                    <div class="flex items-center gap-1.5">
                      <span class="badge badge-sm badge-ghost font-bold w-6 justify-center shrink-0">B</span>
                      <select @change="diffB = +$event.target.value; _diffTouched = true; invalidateDiff()" class="select select-bordered font-mono flex-1 min-w-0">
                        <template x-for="(it, i) in items" :key="'b' + itemKey(it)">
                          <option :value="i" :selected="i === diffB" x-text="bundleHeader(it).replace('// === ', '')"></option>
                        </template>
                      </select>
                      <input x-show="!items[diffB]?.local" x-model="diffBRef" @change="invalidateDiff()" placeholder="ref"
                             class="input input-bordered font-mono w-24 shrink-0" title="Read B at this ref instead of as staged">
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button @click="runDiff()" :disabled="diffBusy" class="btn btn-primary gap-1">
                        <i class="ph" :class="diffBusy ? 'ph-circle-notch animate-spin' : 'ph-git-diff'"></i>Diff
                      </button>
                      <button x-show="diffRows" @click="copyDiff()" class="btn btn-ghost gap-1" title="Copy the diff as a patch-like block">
                        <i class="ph" :class="diffCopied ? 'ph-check' : 'ph-copy'"></i><span class="hidden sm:inline">Copy diff</span>
                      </button>
                      <!-- Hand-off, one way. This lens is the quick look that
                           feeds the review prompts; the Diff page is where the
                           same pair gets split view, word-level highlighting,
                           folding, navigation and a real patch. Both sides are
                           addresses already, so the link needs no new protocol. -->
                      <a x-show="diffHandoff" :href="diffHandoff" target="_blank" class="btn btn-ghost gap-1"
                         title="Open this pair in the Diff page">
                        <i class="ph ph-arrow-square-out"></i><span class="hidden sm:inline">Open in Diff</span>
                      </a>
                    </div>

                    <div x-show="diffRows"
                         class="overflow-auto font-mono text-base leading-snug border border-base-300 rounded bg-base-200/40 max-h-[45vh] lg:max-h-[60vh] whitespace-pre">
                      <template x-for="(r, i) in (diffRows || [])" :key="i">
                        <div class="px-2"
                             :class="r.t === 'add' ? 'bg-success/10 text-success' : r.t === 'del' ? 'bg-error/10 text-error' : 'text-base-content/55'"
                             x-text="(r.t === 'add' ? '+ ' : r.t === 'del' ? '- ' : '  ') + r.line"></div>
                      </template>
                    </div>

                    <!-- Review prompts: link-carried bespoke asks first
                         (sparkle), then the fixed set. Each row is the whole
                         affordance (click to copy); the ask is the tooltip. -->
                    <div x-show="diffRows" class="border border-base-300 rounded-lg overflow-hidden">
                      <template x-for="(p, idx) in diffPrompts" :key="(p.bespoke ? 'b:' : 'f:') + p.label">
                        <button @click="copyPrompt(p.ask, idx)" :title="p.ask"
                                class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left text-base hover:bg-base-200 border-t border-base-300 first:border-t-0">
                          <span class="flex items-center gap-1.5 min-w-0">
                            <i x-show="p.bespoke" class="ph ph-sparkle text-primary/70 shrink-0" title="Tailored to this edit, carried on the link"></i>
                            <span class="font-semibold truncate" x-text="p.label"></span>
                          </span>
                          <i class="ph shrink-0" :class="promptCopiedIdx === idx ? 'ph-check text-success' : 'ph-copy opacity-40'"></i>
                        </button>
                      </template>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- ASIDE: what is staged, then where to get more. -->
            <div class="flex flex-col gap-3 min-w-0">

              <!-- Staged items, grouped by source repo@ref, then local. -->
              <div x-show="items.length" class="flex flex-col gap-1.5">
                <div class="text-base font-semibold uppercase tracking-wide text-base-content/40">
                  Staged<span class="normal-case tracking-normal opacity-70" x-text="' · ' + items.length"></span>
                </div>
                <template x-for="g in groups" :key="g.key">
                  <div class="border border-base-300 rounded-lg bg-base-100 overflow-hidden">
                    <div class="px-2.5 py-1 bg-base-200/60 font-mono text-base flex items-center gap-1.5">
                      <i class="ph ph-git-branch opacity-60 shrink-0"></i><span class="truncate" x-text="g.key"></span>
                      <span class="opacity-40 shrink-0" x-text="'· ' + g.items.length"></span>
                    </div>
                    <div class="p-1">
                      <template x-for="it in g.items" :key="itemKey(it)">
                        <div class="group flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-base-200 text-base">
                          <button @click="view(it)" class="flex items-center gap-1.5 min-w-0 cursor-pointer hover:text-primary text-left">
                            <i class="ph ph-file text-info shrink-0"></i>
                            <span class="truncate font-mono text-base" x-text="it.path"></span>
                          </button>
                          <div class="grow"></div>
                          <!-- The row's jump-over, at the item's OWN repo@ref
                               rather than the shell's: a stage is cross-repo by
                               construction. It used to take opening the preview
                               to reach the file's GitHub home. -->
                          <a :href="itemGh(it)" :data-peek="itemPeek(it)" target="_blank" rel="noopener"
                             :title="itemKey(it) + ' on GitHub'"
                             class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0">
                            <i class="ph ph-github-logo"></i></a>
                          <button @click="rm(it)"
                                  class="btn btn-ghost w-5 h-5 min-h-0 p-0 opacity-30 hover:opacity-100 hover:text-error shrink-0">
                            <i class="ph ph-x"></i>
                          </button>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>

                <div x-show="localItems.length" class="border border-base-300 rounded-lg bg-base-100 overflow-hidden">
                  <div class="px-2.5 py-1 bg-base-200/60 font-mono text-base flex items-center gap-1.5">
                    <i class="ph ph-upload-simple opacity-60 shrink-0"></i><span>local</span>
                    <span class="opacity-40" x-text="'· ' + localItems.length"></span>
                  </div>
                  <div class="p-1">
                    <template x-for="it in localItems" :key="itemKey(it)">
                      <div class="group flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-base-200 text-base">
                        <button @click="view(it)" class="flex items-center gap-1.5 min-w-0 cursor-pointer hover:text-primary text-left">
                          <i class="ph ph-file-dashed text-warning shrink-0"></i>
                          <span class="truncate font-mono text-base" x-text="it.name"></span>
                          <span class="opacity-50 shrink-0 text-base" x-text="fmtSize(it.size)"></span>
                        </button>
                        <button @click="rm(it)"
                                class="btn btn-ghost w-5 h-5 min-h-0 p-0 opacity-30 hover:opacity-100 hover:text-error shrink-0">
                          <i class="ph ph-x"></i>
                        </button>
                      </div>
                    </template>
                  </div>
                </div>
              </div>

              <!-- Adder: grab from a repo, then the Recent / Search finder. -->
              <div class="flex flex-col gap-1.5">
                <div x-show="items.length" class="text-base font-semibold uppercase tracking-wide text-base-content/40">Add</div>
                <div @path-pick="grab($event.detail)">
                  <div x-data="pathPicker({ mode: 'file', roots: () => pickerRoots(), placeholder: 'Grab from a repo' })"></div>
                </div>

                <div class="flex flex-col gap-1">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5" role="tablist">
                      <button role="tab" @click="finderTab = 'recent'; recentOpen = true"
                              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                              :class="finderTab === 'recent' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                        Recent<span x-show="recent.length" class="badge badge-ghost badge-sm" x-text="recent.length"></span>
                      </button>
                      <button role="tab" @click="finderTab = 'search'; recentOpen = true; ensureTrees()"
                              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                              :class="finderTab === 'search' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                        Search
                      </button>
                    </div>
                    <div class="flex items-center gap-0.5">
                      <button x-show="finderTab === 'recent'" @click="loadRecent(true)" class="btn btn-ghost btn-square" title="Refresh">
                        <i class="ph text-xl" :class="recentLoading ? 'ph-circle-notch animate-spin' : 'ph-arrows-clockwise'"></i>
                      </button>
                      <button @click="recentOpen = !recentOpen" class="btn btn-ghost btn-square" title="Collapse">
                        <i class="ph ph-caret-down text-xl transition-transform" :class="!recentOpen && '-rotate-90'"></i>
                      </button>
                    </div>
                  </div>

                  <div x-show="recentOpen && finderTab === 'recent' && repoPills().length > 1" class="flex flex-wrap gap-1">
                    <template x-for="pl in repoPills()" :key="pl.repo">
                      <button @click="togglePill(pl.repo)"
                              class="badge badge-sm cursor-pointer gap-1 transition-opacity"
                              :class="pillSel === pl.repo ? 'badge-primary' : pillSel ? 'badge-ghost opacity-40' : 'badge-ghost'">
                        <span x-text="pl.repo.split('/').pop()"></span>
                        <span class="opacity-60" x-text="pl.n"></span>
                      </button>
                    </template>
                  </div>

                  <label x-show="recentOpen && finderTab === 'search'" class="input input-bordered flex items-center gap-2">
                    <i class="ph ph-magnifying-glass opacity-50"></i>
                    <input x-model="searchQ" type="text" placeholder="File name contains…"
                           autocomplete="off" autocapitalize="off" spellcheck="false"
                           class="grow font-mono text-lg sm:text-base">
                  </label>

                  <div x-show="recentOpen && finderTab === 'recent' && recentLoading && !recent.length" class="flex justify-center py-4">
                    <span class="loading loading-dots loading-md opacity-30"></span>
                  </div>
                  <div x-show="recentOpen && finderTab === 'search' && treesLoading" class="flex justify-center py-4">
                    <span class="loading loading-dots loading-md opacity-30"></span>
                  </div>

                  <div x-show="recentOpen" class="flex flex-col max-h-72 overflow-y-auto overscroll-contain rounded-lg">
                    <!-- A finder row's primary action is staging, so the row is a
                         button; the jump-over rides beside it rather than inside
                         it (an anchor nested in a button is not a control). -->
                    <template x-for="it in finderRows()" :key="'r:' + it.repo + ':' + it.path">
                      <div class="group flex items-center rounded-lg hover:bg-base-200 transition-colors">
                        <button @click="toggleRecent(it)"
                                class="flex items-center gap-2.5 px-2 py-1.5 min-w-0 flex-1 text-left">
                          <i class="ph text-lg shrink-0"
                             :class="recentStaged(it) ? 'ph-check-circle text-success' : 'ph-plus-circle text-primary/70'"></i>
                          <div class="min-w-0 flex-1">
                            <div class="flex items-baseline justify-between gap-2">
                              <span class="truncate font-mono text-base" x-text="baseName(it.path)"></span>
                              <span x-show="it.date" class="shrink-0 text-base opacity-50" x-text="ago(it.date)"></span>
                            </div>
                            <div class="truncate font-mono text-base opacity-50" :title="it.repo + ':' + it.path"
                                 x-text="whereFrom(it)"></div>
                          </div>
                        </button>
                        <a :href="itemGh(it)" :data-peek="itemPeek(it)" target="_blank" rel="noopener"
                           :title="it.repo + ':' + it.path + ' on GitHub'"
                           class="px-2 py-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0">
                          <i class="ph ph-github-logo"></i></a>
                      </div>
                    </template>
                    <div x-show="finderTab === 'search' && searchQ.trim().length >= 2 && !treesLoading && !finderRows().length"
                         class="py-4 text-center text-base text-base-content/50">No matching files.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Inline preview as a centered overlay, so a wide code view never
               fights the two-pane grid. Backdrop or X dismisses. The body is
               the shared file viewer (viewer.js), embedded (bindStore:false so
               it doesn't track the Files view's activeFile, fill so it grows to
               the modal), so a staged file previews with the same syntax
               highlighting, markdown/JSON modes, and wrapping raw mode as the
               Files tab. Full-bleed sheet on mobile, centered card on wider
               screens. The viewer carries its own header (name, links, mode);
               this chrome adds only the close. -->
          <div x-show="preview" x-cloak
               class="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4"
               @click.self="preview = null" @keydown.escape.window="preview = null">
            <div class="bg-base-100 border-base-300 shadow-xl w-full h-full flex flex-col overflow-hidden sm:h-auto sm:max-w-3xl sm:max-h-[85vh] sm:border sm:rounded-xl">
              <div class="px-3 py-2 bg-base-200/60 flex items-center gap-2 text-base border-b border-base-300 shrink-0">
                <i class="ph ph-eye opacity-60"></i>
                <span class="font-medium opacity-70">Preview</span>
                <span class="grow"></span>
                <button @click="preview = null" class="btn btn-ghost btn-square opacity-60 hover:opacity-100" title="Close">
                  <i class="ph ph-x text-2xl"></i>
                </button>
              </div>
              <div class="flex flex-col flex-1 min-h-0 overflow-hidden p-3"
                   id="stage-preview-viewer" x-data="viewer({ bindStore: false, fill: true })"></div>
            </div>
          </div>

          <!-- Whole-view drag cue: purely visual (pointer-events-none), so the
               drop lands on the root handler beneath it. -->
          <div x-show="_dragDepth > 0" x-cloak
               class="pointer-events-none absolute inset-0 z-40 rounded-xl border-2 border-dashed border-primary bg-primary/10 flex items-center justify-center">
            <div class="flex items-center gap-2 text-primary font-medium">
              <i class="ph ph-tray-arrow-down text-2xl"></i>Drop to stage
            </div>
          </div>
        </div>`,

      destSpec: '',
      preview: null,       // truthy ({ name }) opens the viewer modal; content is driven into the embedded viewer via its __viewer handle
      saveTarget: '',
      recent: [],          // [{repo, ref, path, date}] merged across root repos
      recentOpen: true,    // header toggles; the list scrolls inside its box
      recentLoading: false,
      _recentLoaded: false,
      finderTab: 'recent', // 'recent' | 'search'
      pillSel: '',         // single-select repo pill ('' = all repos)
      searchQ: '',
      treesLoading: false,
      _treePaths: null,    // {repo: [path…]} — one recursive tree per root repo
      outTab: 'out',       // 'out' | 'diff' — the two lenses on what's staged
      bundleShow: false,   // the concatenated block renders on demand
      diffA: 0, diffB: 0,  // staged-item indexes for the compare
      diffARef: '', diffBRef: '',   // optional ref overrides (version diff)
      diffRows: null,      // [{t:'ctx'|'add'|'del', line}] | null
      diffStat: '',
      diffBusy: false,
      diffCopied: false,
      promptCopiedIdx: -1,
      linkPrompts: [],     // bespoke review asks carried on the opening #stage= link
      linkMode: '',        // 'diff' when the opening link declared a diff intent
      _dragDepth: 0,       // whole-view drag counter (nested enter/leave safe)
      _autoDiffed: false,  // a diff-mode link auto-runs its diff once
      _diffTouched: false, // true once the user has picked A/B by hand
      _diffTextA: '', _diffTextB: '',  // the two sides' text from the last runDiff
      sending: false,
      sendArmed: false,
      resolvedDest: null,   // destination after any inbox resolution, for the label
      _inboxCache: {},      // repo -> box|null, one manifest read per repo per session
      sendStatus: '',
      savingStage: false,
      linkCopied: false,
      // The concatenated block and its content cache (keyed by itemKey, so a
      // remove/re-add never refetches). Rebuilt whenever the stage changes.
      bundleText: '',
      bundleBusy: false,
      bundleCopied: false,
      _cache: {},

      init() {
        this.$root.__stager = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
        // A general staging saves to the registry by default; the field stays
        // editable for a repo-specific one.
        this.saveTarget = window.__shell?.REGISTRY_REPO || '';
        // The Recent sweep costs a handful of API calls per root repo, so it
        // waits for the stage to actually be shown (the stager mounts hidden
        // behind x-show at page load), then caches until refreshed.
        const whenShown = () => { if (window.__shell?.view === 'stage') this.loadRecent(); };
        this.$watch(() => window.__shell?.view, whenShown);
        whenShown();
        // The repo's .web-tools.json manifest (probed by the shell) can carry
        // a durable staged-files list; fold it in whenever a config lands.
        this.$watch(() => Alpine.store('browser').config, cfg => this.seedStage(cfg));
        this.seedStage(Alpine.store('browser').config);
        // Keep the concatenated block in step with the stage. Newly-added
        // items fetch once (cache); removed items just drop out of the join.
        this.$watch(() => this.items.map(it => this.itemKey(it)).join('|'), () => this.ensureBundle());
        this.ensureBundle();
        // A and B default to the same item (index 0); once a second item is
        // staged, pair B to it automatically so "stage two things, diff them"
        // is zero extra taps. Only while the user hasn't picked by hand.
        const autoPair = () => {
          const n = this.items.length;
          // Clamp a selection the stage no longer holds (an item was removed),
          // so a diff never resolves against an out-of-range index.
          if (this.diffA >= n) { this.diffA = 0; this.invalidateDiff(); }
          if (this.diffB >= n) { this.diffB = Math.max(0, n - 1); this.invalidateDiff(); }
          if (this._diffTouched || this.diffB !== this.diffA) return;
          if (n >= 2) this.diffB = n - 1;
        };
        this.$watch(() => this.items.length, autoPair);
        autoPair();
        // The opening #stage= link carries commentary and, optionally, a diff
        // intent (the shell seeds the refs from the same hash and leaves it in
        // place). Read both once: the bespoke prompts show first in the panel,
        // and a mode=diff link opens on the Diff tab and runs the diff itself,
        // once its two items have landed (the shell seeds them after mount).
        try {
          const lk = window.StageLink.read(location);
          this.linkPrompts = lk.prompts;
          this.linkMode = lk.mode;
        } catch {}
        if (this.linkMode === 'diff') this.outTab = 'diff';
        const autoDiff = () => {
          if (this.linkMode !== 'diff' || this._autoDiffed || this.items.length < 2) return;
          this._autoDiffed = true;
          this.outTab = 'diff';
          this.$nextTick(() => this.runDiff());
        };
        this.$watch(() => this.items.length, autoDiff);
        autoDiff();
        // Paste anywhere on the view stages a file or a block of refs, but
        // never when a form field is the target (let that field paste). Bound
        // to the window so it works over the whole view, gated to the stage.
        this._onPaste = (e) => {
          if (window.__shell && window.__shell.view !== 'stage') return;
          const t = e.target;
          if (t && t.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
          const cd = e.clipboardData;
          if (!cd) return;
          if (cd.files && cd.files.length) { e.preventDefault(); for (const f of cd.files) this.ingestFile(f); return; }
          const text = cd.getData('text');
          if (text) { e.preventDefault(); this.onDropped({ text, size: text.length }); }
        };
        window.addEventListener('paste', this._onPaste);
      },

      // Whole-view file intake: a drop anywhere on the view, or the Browse
      // button. Each file is read to bytes and folded in through onDropped, the
      // one intake the drop-zone box used to feed; a dropped block of text goes
      // through the same ref-or-prose parse.
      async onPageDrop(e) {
        this._dragDepth = 0;
        const dt = e.dataTransfer;
        if (!dt) return;
        if (dt.files && dt.files.length) { for (const f of dt.files) await this.ingestFile(f); return; }
        const text = dt.getData('text');
        if (text) this.onDropped({ text, size: text.length });
      },
      async ingestFile(file) {
        try {
          const buf = await file.arrayBuffer();
          this.onDropped({ file, name: file.name, size: file.size, type: file.type, bytes: new Uint8Array(buf), buf });
        } catch {
          Alpine.store('toast')('warning', 'Could not read ' + file.name, 'alert-error', 4000);
        }
      },
      onBrowse(e) {
        const input = e.target;
        if (input.files) for (const f of input.files) this.ingestFile(f);
        input.value = '';   // let the same file re-trigger a change next time
      },

      get items() {
        return Alpine.store('browser').stage || [];
      },
      // Ref items (repo/ref/path) vs local (dropped) items, split for the two
      // renderers and the two deposit paths.
      get refItems() { return this.items.filter(it => !it.local); },
      get localItems() { return this.items.filter(it => it.local); },
      get groups() {
        const map = new Map();
        for (const it of this.refItems) {
          const key = it.repo + (it.ref ? '@' + it.ref : '');
          if (!map.has(key)) map.set(key, { key, repo: it.repo, ref: it.ref || '', items: [] });
          map.get(key).items.push(it);
        }
        return [...map.values()];
      },
      get targets() {
        return Alpine.store('browser').config?.stage?.targets || [];
      },
      get sendLabel() {
        if (this.sending) return 'Sending…';
        if (!this.sendArmed) return 'Send';
        const d = this.resolvedDest;
        // Naming the resolved directory matters most when the user did not
        // type it: an inbox redirect the reader cannot see is a surprise.
        return d && d.dir ? 'Send to ' + d.dir + '/ ?' : 'Sure?';
      },

      // The destination repo's declared inbox, read from ITS manifest (the
      // receiver owns the landing spot). Cached per repo for the session, and
      // failure-tolerant: no manifest, no inbox, no problem, the deposit lands
      // at the root as it always did.
      async receiverInbox(repo) {
        if (!window.RepoAddress) return null;
        if (this._inboxCache[repo] !== undefined) return this._inboxCache[repo];
        let box = null;
        try {
          const cfg = JSON.parse((await this.srcGh(repo, '').get('.web-tools.json')).text);
          box = window.RepoAddress.box(cfg, 'inbox', repo);
        } catch { box = null; }
        this._inboxCache[repo] = box;
        return box;
      },
      get bundleStat() {
        if (!this.bundleText) return '';
        const kb = (new Blob([this.bundleText]).size / 1024).toFixed(1);
        return this.items.length + ' file' + (this.items.length === 1 ? '' : 's') + ' · ' + kb + ' KB';
      },

      fmtSize(n) {
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
      },

      itemKey(it) {
        return it.local ? 'local:' + it.id : window.StageLink.fmtItem(it);
      },
      // A staged item's GitHub home. An unspecified ref becomes HEAD in the URL
      // rather than a guessed branch name, which is the same honesty
      // RepoAddress.parse keeps: '' means "the repo's default", and only the
      // link needs it spelled.
      itemGh(it) {
        if (!it || it.local || !it.repo || !it.path) return '';
        return 'https://github.com/' + it.repo + '/blob/' + (it.ref || 'HEAD') + '/' + it.path;
      },
      itemPeek(it) {
        if (!this.itemGh(it)) return null;
        return window.SourcePeek?.addr(it.repo, it.ref || '', it.path) || null;
      },
      // The label a bundle block carries; local items have no ref to name.
      bundleHeader(it) {
        return it.local ? '(local) ' + it.name : this.itemKey(it);
      },

      // A file (or pasted text) arrived from the drop-zone. A file becomes a
      // local stage item holding its bytes. Pasted text that reads entirely as
      // stage refs (one per line) stages those refs instead; anything else is
      // held as a local text item.
      onDropped(d) {
        const s = Alpine.store('browser');
        if (d.file || d.name) {
          s.stage = [...this.items, {
            local: true, id: ++seq, name: d.name, path: d.name,
            size: d.size, type: d.type, isText: false, bytes: d.bytes, buf: d.buf,
          }];
          return;
        }
        if (d.text != null) {
          const lines = String(d.text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const refs = lines.map(l => window.StageLink.parseItem(l)).filter(Boolean);
          if (lines.length && refs.length === lines.length) {
            const seen = new Set(this.items.map(it => this.itemKey(it)));
            const fresh = refs.filter(r => !seen.has(window.StageLink.fmtItem(r)));
            if (fresh.length) s.stage = [...this.items, ...fresh];
            return;
          }
          s.stage = [...this.items, {
            local: true, id: ++seq, name: 'pasted.txt', path: 'pasted.txt',
            size: d.size, type: 'text/plain', isText: true, text: d.text,
          }];
        }
      },

      // A GH instance pointed at a repo. ref '' rides through: the API treats an
      // empty ref param as the default branch. Used for both source reads and
      // destination writes (save/saveBytes ignore ref, landing on default).
      srcGh(repo, ref) {
        const base = Alpine.store('browser').gh;
        const inst = new base.constructor({ token: base.token, repo });
        inst.ref = ref || '';
        return inst;
      },

      // Manifest seeding: entries are bare paths ("lib/foo.js", this repo at
      // its default branch) or qualified refs ("owner/repo[@ref]:path"). Only
      // an empty stage is seeded: a working set the user built wins. The
      // destination field is left empty on purpose (empty dir = root); targets
      // stay as datalist suggestions.
      seedStage(cfg) {
        const s = Alpine.store('browser');
        const files = cfg?.stage?.files;
        if (!Array.isArray(files) || !files.length || this.items.length) return;
        s.stage = files
          .map(f => window.StageLink.parseItem(f) || (typeof f === 'string' && f.trim() ? { repo: s.repo, ref: '', path: f.trim() } : null))
          .filter(Boolean);
      },

      rm(it) {
        const s = Alpine.store('browser');
        const key = this.itemKey(it);
        s.stage = s.stage.filter(x => this.itemKey(x) !== key);
      },
      clearAll() {
        Alpine.store('browser').stage = [];
      },

      // Preview a staged item inline. The stage is estate-context, so this
      // never routes through a repo's Files view: a ref loads from its origin
      // (with a GitHub jump-over in the header); a local text item shows its
      // held text; a local binary can't be previewed, so say so.
      async view(it) {
        const toast = Alpine.store('toast');
        // Open the modal (preview truthy) and drive the embedded viewer: the
        // path is its display name and ext, origin gives it the file's true
        // home so its GitHub/Raw links and highlighting match the Files tab.
        const drive = (file, content, origin) => {
          this.preview = { name: file };
          this.$nextTick(() => document.getElementById('stage-preview-viewer')?.__viewer?.show(file, content, origin || null));
        };
        if (it.local) {
          if (it.isText) {
            drive(it.path || it.name, fmt(it.text || ''), { local: true });
          } else {
            toast('file-dashed', it.name + ' is binary (' + this.fmtSize(it.size) + '); staged for copy, not preview', 'alert-info', 4000);
          }
          return;
        }
        try {
          const res = await this.srcGh(it.repo, it.ref).get(it.path);
          drive(it.path, fmt(res.text), { repo: it.repo, ref: it.ref });
        } catch (e) {
          toast('warning', 'Could not load ' + it.path + ': ' + (e.message || e), 'alert-error', 5000);
        }
      },

      // Recent committed files across the estate's root repos, so the latest
      // thing is one tap from staged. One recentFiles() sweep per repo (a
      // commits list plus a batch of commit details, the PR #214 machinery),
      // run in parallel; a repo that fails just contributes nothing.
      async loadRecent(force) {
        if (this.recentLoading || (this._recentLoaded && !force)) return;
        this._recentLoaded = true;
        this.recentLoading = true;
        const repos = [...new Set(this.pickerRoots().map(r => r.repo))].slice(0, 4);
        const lists = await Promise.all(repos.map(async repo => {
          try {
            const files = await this.srcGh(repo, 'HEAD').recentFiles(12);
            return files.map(f => ({ repo, ref: '', path: f.path, date: f.date }));
          } catch { return []; }
        }));
        this.recent = lists.flat()
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .slice(0, 48);
        this.recentLoading = false;
      },
      recentStaged(it) {
        const key = window.StageLink.fmtItem({ repo: it.repo, ref: '', path: it.path });
        return this.items.some(x => this.itemKey(x) === key);
      },
      // Tap to stage, tap again to unstage: the row is the whole affordance.
      toggleRecent(it) {
        if (this.recentStaged(it)) this.rm({ repo: it.repo, ref: '', path: it.path });
        else this.grab({ repo: it.repo, ref: '', path: it.path });
      },
      baseName(p) { return (p || '').split('/').pop(); },
      // "web-tools · lib/alpineComponents": repo short name, then the folder.
      whereFrom(it) {
        const repo = (it.repo || '').split('/').pop();
        const dir = it.path.includes('/') ? it.path.slice(0, it.path.lastIndexOf('/')) : '';
        return repo + (dir ? ' · ' + dir : '');
      },
      ago(d) {
        if (!d) return '';
        const gh = Alpine.store('browser').gh;
        if (gh?.ago) return gh.ago(d);
        const s = (Date.now() - new Date(d).getTime()) / 1000;
        if (!isFinite(s)) return '';
        for (const [v, u] of [[86400 * 365, 'y'], [86400 * 30, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']]) {
          if (s >= v) return Math.floor(s / v) + u + ' ago';
        }
        return 'now';
      },

      // Pills: the repos present in Recent, with counts; single-select — tap
      // one to show only that repo, tap it again for all.
      repoPills() {
        const counts = new Map();
        for (const it of this.recent) counts.set(it.repo, (counts.get(it.repo) || 0) + 1);
        return [...counts.entries()].map(([repo, n]) => ({ repo, n }));
      },
      togglePill(repo) {
        this.pillSel = this.pillSel === repo ? '' : repo;
      },

      // Search: filename-contains over the root repos' full trees. One
      // recursive-tree call per repo, fetched when the Search tab is first
      // opened and cached; matching is then pure local string work per
      // keystroke, no API calls.
      async ensureTrees() {
        if (this._treePaths || this.treesLoading) return;
        this.treesLoading = true;
        const repos = [...new Set(this.pickerRoots().map(r => r.repo))].slice(0, 4);
        const out = {};
        await Promise.all(repos.map(async repo => {
          try {
            const res = await this.srcGh(repo, 'HEAD').req('git/trees/HEAD?recursive=1');
            out[repo] = (res.tree || []).filter(e => e.type === 'blob').map(e => e.path);
          } catch { out[repo] = []; }
        }));
        this._treePaths = out;
        this.treesLoading = false;
      },
      // The finder's rows: Recent filtered by the pills, or search hits.
      finderRows() {
        if (this.finderTab === 'recent') return this.recent.filter(it => !this.pillSel || it.repo === this.pillSel);
        const q = this.searchQ.trim().toLowerCase();
        if (q.length < 2 || !this._treePaths) return [];
        const hits = [];
        for (const [repo, paths] of Object.entries(this._treePaths)) {
          for (const path of paths) {
            if (path.toLowerCase().includes(q)) {
              hits.push({ repo, ref: '', path });
              if (hits.length >= 50) return hits;
            }
          }
        }
        return hits;
      },

      // A file chosen in the grab picker joins the stage (deduped by key).
      grab(d) {
        if (!d || !d.repo || !d.path) return;
        const it = { repo: d.repo, ref: d.ref || '', path: d.path };
        const key = window.StageLink.fmtItem(it);
        if (this.items.some(x => this.itemKey(x) === key)) {
          return Alpine.store('toast')('stack', d.path + ' is already staged', 'alert-info', 2000);
        }
        Alpine.store('browser').stage = [...this.items, it];
        Alpine.store('toast')('plus-circle', 'Staged ' + d.path, 'alert-success', 2000);
      },

      // The repo set both pickers open at: the open repo (if any), the estate's
      // members, then configured transfer targets, deduped. Estate-level on
      // purpose: the stage belongs to no repo, so its reach is the estate.
      // Members come from the shell's estateRepos (each repo's own
      // `estate: true`, via the config cache). This used to read the shell's
      // quickLinks, a second list that named seven of the eight members.
      pickerRoots() {
        const s = Alpine.store('browser');
        const seen = new Set();
        const roots = [];
        const add = (repo, ref) => {
          if (!repo) return;
          const key = repo + '@' + (ref || '');
          if (seen.has(key)) return;
          seen.add(key);
          roots.push({ repo, ref: ref || '' });
        };
        add(s.repo, '');
        for (const r of (window.__shell?.estateRepos || [])) add(r.repo, '');
        for (const t of this.targets) {
          const d = this.parseDest(t);
          if (d) add(d.repo, d.ref);
        }
        return roots;
      },

      copyLink() {
        const refs = this.refItems;
        if (!refs.length) {
          return Alpine.store('toast')('warning', 'Nothing to link: local files can\'t ride a #stage= link, send them to a repo instead', 'alert-error', 5000);
        }
        const url = window.StageLink.mint(refs, location.origin + location.pathname,
          { prompts: this.linkPrompts, mode: this.outTab === 'diff' ? 'diff' : '' });
        navigator.clipboard.writeText(url);
        this.linkCopied = true;
        setTimeout(() => { this.linkCopied = false; }, 1500);
        const note = this.localItems.length ? ' (local files excluded)' : '';
        Alpine.store('toast')('link', 'Stage link copied' + note, 'alert-success', 2500);
      },

      // The staged files spliced into one block, each under a `// === key ===`
      // header. Refs fetch (cached per item, so only new refs hit the network);
      // local text is inlined; a local binary shows a note, not bytes.
      async ensureBundle(force) {
        if (!this.items.length) { this.bundleText = ''; return; }
        this.bundleBusy = true;
        const parts = await Promise.all(this.items.map(async it => {
          const k = this.itemKey(it);
          let content;
          if (it.local) {
            content = it.isText ? (it.text || '') : '// (binary — ' + this.fmtSize(it.size) + ', staged for copy)';
          } else {
            if (force || this._cache[k] == null) {
              try { this._cache[k] = fmt((await this.srcGh(it.repo, it.ref).get(it.path)).text); }
              catch (e) { this._cache[k] = '// ERROR: ' + (e.message || e); }
            }
            content = this._cache[k];
          }
          return '// === ' + this.bundleHeader(it) + ' ===\n' + content;
        }));
        this.bundleText = parts.join('\n\n');
        this.bundleBusy = false;
      },
      async rebuild() {
        this._cache = {};
        await this.ensureBundle(true);
      },
      async copyBundle() {
        if (!this.items.length) return;
        if (this.bundleBusy || !this.bundleText) await this.ensureBundle();
        try {
          await navigator.clipboard.writeText(this.bundleText);
          this.bundleCopied = true;
          setTimeout(() => { this.bundleCopied = false; }, 1500);
          Alpine.store('toast')('copy', 'Copied ' + this.items.length + ' file' + (this.items.length === 1 ? '' : 's') + ' as text', 'alert-success', 2500);
        } catch (e) {
          Alpine.store('toast')('warning', 'Copy failed: ' + (e.message || e), 'alert-error', 5000);
        }
      },
      async download() {
        if (!this.items.length) return;
        if (this.bundleBusy || !this.bundleText) await this.ensureBundle();
        const blob = new Blob([this.bundleText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stage-bundle.txt';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Alpine.store('toast')('download-simple', 'Downloaded stage-bundle.txt', 'alert-success', 2500);
      },

      // "owner/repo", "owner/repo:dir", or "owner/repo@ref:dir". No dir = root.
      parseDest(spec) {
        const m = spec.trim().match(/^([\w.-]+\/[\w.-]+?)(?:@([\w./-]+))?(?::(.*))?$/);
        return m ? { repo: m[1], ref: m[2] || '', dir: (m[3] || '').trim() } : null;
      },

      // A plain line diff: common prefix/suffix trimmed, LCS over the middle.
      // Returns [{t:'ctx'|'add'|'del', line}], or null when the middle is too
      // large to DP over (the caller reports rather than freezing the page).
      // Line diff via kits/text-diff.js. This used to be an inlined LCS table
      // capped at 4 million cells, which reported "files too large to diff" on
      // any real pair of long documents; the shared kit is patience diff, so
      // that ceiling is gone. Rows stay {t,line} with full context, since the
      // row set here IS the whole compare.
      diffLines(aText, bText) {
        if (!window.textDiff) throw new Error('text-diff kit not loaded');
        const a = String(aText).split('\n'), b = String(bText).split('\n');
        return textDiff.rows(textDiff.lines(a, b), a, b);
      },

      // One side of the compare: a local text item reads its held text; a ref
      // reads from its origin, or from the override ref when one is given
      // (that override is what makes same-file-twice a version diff).
      async diffSide(it, refOverride) {
        if (!it) throw new Error('nothing selected');
        if (it.local) {
          if (!it.isText) throw new Error(it.name + ' is binary');
          return it.text || '';
        }
        const ref = (refOverride || '').trim() || it.ref;
        return fmt((await this.srcGh(it.repo, ref).get(it.path)).text);
      },
      // A change to the A/B selection or a ref override makes the shown diff
      // stale: its rows and stored text are from the last runDiff, but the
      // copy actions label their header from the CURRENT selection, so a copy
      // taken without re-running would name one side and carry another's text.
      // Drop the shown diff on any such change; the copy buttons (x-show on
      // diffRows) go with it, forcing a re-run against what's actually picked.
      invalidateDiff() {
        this.diffRows = null;
        this.diffStat = '';
        this._diffTextA = '';
        this._diffTextB = '';
      },
      async runDiff() {
        if (this.diffBusy) return;
        const toast = Alpine.store('toast');
        this.diffBusy = true;
        try {
          const [a, b] = await Promise.all([
            this.diffSide(this.items[this.diffA], this.diffARef),
            this.diffSide(this.items[this.diffB], this.diffBRef),
          ]);
          const rows = this.diffLines(a, b);
          if (!rows) throw new Error('files too large to diff');
          this.diffRows = rows;
          this._diffTextA = a;
          this._diffTextB = b;
          const add = rows.filter(r => r.t === 'add').length;
          const del = rows.filter(r => r.t === 'del').length;
          this.diffStat = (add || del) ? ('+' + add + ' \u2212' + del) : 'identical';
        } catch (e) {
          this.diffRows = null;
          this.diffStat = '';
          toast('warning', 'Diff failed: ' + (e.message || e), 'alert-error', 5000);
        }
        this.diffBusy = false;
      },

      // The Diff page's address for the current pair, or '' when it cannot be
      // built. Both sides have to be repo items: the Diff page takes addresses
      // (?a=&b=), and a dropped or pasted local file has no address to hand
      // over, so the link hides rather than half-working.
      get diffHandoff() {
        const a = this.items[this.diffA], b = this.items[this.diffB];
        if (!a || !b || a.local || b.local) return '';
        const spec = (it, refOverride) => {
          const ref = (refOverride || '').trim() || it.ref || '';
          return it.repo + (ref ? '@' + ref : '') + ':' + it.path;
        };
        const q = new URLSearchParams({ a: spec(a, this.diffARef), b: spec(b, this.diffBRef) });
        return new URL('../diff-tool.html?' + q, location.href).href;
      },

      // A compare side's display label: repo@ref:path for a ref item (the
      // override ref if one was used, else the item's own), or "(local) name"
      // for a dropped/pasted item. Used by the diff dump and the review
      // prompts, so both name what was actually compared, not just what's
      // staged.
      diffLabel(it, refOverride) {
        if (!it) return '?';
        if (it.local) return '(local) ' + it.name;
        const ref = (refOverride || '').trim() || it.ref || 'default';
        return it.repo + '@' + ref + ':' + it.path;
      },

      // The diff as a copyable, patch-like text block: a header naming both
      // sides (honoring ref overrides), then the tagged rows as +/-/context
      // lines. Not a real unified-diff hunk format (no @@ markers, no
      // surrounding-line trimming) \u2014 the row set already IS the full compare.
      get diffDump() {
        if (!this.diffRows) return '';
        const a = this.diffLabel(this.items[this.diffA], this.diffARef);
        const b = this.diffLabel(this.items[this.diffB], this.diffBRef);
        const lines = this.diffRows.map(r => (r.t === 'add' ? '+ ' : r.t === 'del' ? '- ' : '  ') + r.line);
        return '--- A: ' + a + '\n+++ B: ' + b + '\n\n' + lines.join('\n');
      },

      async copyDiff() {
        if (!this.diffRows) return;
        try {
          await navigator.clipboard.writeText(this.diffDump);
          this.diffCopied = true;
          setTimeout(() => { this.diffCopied = false; }, 1500);
        } catch (e) {
          Alpine.store('toast')('warning', 'Copy failed: ' + (e.message || e), 'alert-error', 5000);
        }
      },

      // The review-prompts list: the bespoke asks carried on the link first
      // (tailored to this edit), then the fixed general asks (DIFF_PROMPTS). A
      // getter, not a stored field, so it never needs its own reactivity wiring.
      get diffPrompts() {
        const bespoke = (this.linkPrompts || []).map(p => ({ label: p.label, ask: p.ask, bespoke: true }));
        const fixed = DIFF_PROMPTS.map(([label, ask]) => ({ label, ask, bespoke: false }));
        return [...bespoke, ...fixed];
      },

      // Copy one review prompt: both compared texts, the diff, and that
      // prompt's specific ask, assembled for pasting into a separate chat as
      // a second, independent review. Uses the text already fetched by the
      // last runDiff \u2014 no re-fetch, so this reflects exactly what's on screen.
      async copyPrompt(ask, idx) {
        if (!this.diffRows) return;
        const a = this.diffLabel(this.items[this.diffA], this.diffARef);
        const b = this.diffLabel(this.items[this.diffB], this.diffBRef);
        const text = [
          'Reviewing an edit.',
          '',
          'A (' + a + '):',
          this._diffTextA,
          '',
          'B (' + b + '):',
          this._diffTextB,
          '',
          'DIFF:',
          this.diffDump,
          '',
          'REVIEW REQUEST: ' + ask,
        ].join('\n');
        try {
          await navigator.clipboard.writeText(text);
          this.promptCopiedIdx = idx;
          setTimeout(() => { if (this.promptCopiedIdx === idx) this.promptCopiedIdx = -1; }, 1500);
        } catch (e) {
          Alpine.store('toast')('warning', 'Copy failed: ' + (e.message || e), 'alert-error', 5000);
        }
      },

      // Two-tap confirm: first tap arms for 3s, second deposits. Cross-repo
      // write with the viewer's token, so the extra gesture stays deliberate.
      // Refs copy grouped by source repo@ref via gh.copyTo; local files write
      // their held bytes via gh.saveBytes/save. Both land in dest.dir (root when
      // empty) under their basenames, on the destination's default branch.
      async send() {
        if (this.sending || !this.items.length) return;
        const toast = Alpine.store('toast');
        let dest = this.parseDest(this.destSpec);
        if (!dest) return toast('warning', 'Destination must be owner/repo, owner/repo:dir, or owner/repo@ref:dir', 'alert-error', 5000);
        // An unaddressed deposit (a repo, no dir) lands where the RECEIVER
        // says, not at its root: the destination repo's own .web-tools.json
        // may declare an `inbox`. One extra read, keyed to the picked repo,
        // and only when no dir was given. Root stays the fallback, so a repo
        // that declares nothing behaves exactly as before. The resolved
        // destination is shown on the armed button, so the second tap is a
        // confirm of where the files actually go.
        if (!dest.dir) {
          const box = await this.receiverInbox(dest.repo);
          if (box) dest = { ...dest, dir: box.dir, ref: box.ref || dest.ref };
        }
        this.resolvedDest = dest;
        // A ref copying onto itself (same repo/ref, no dir) is a no-op guard;
        // local files have no source, so they never trip it.
        const selfCopies = this.refItems.filter(it =>
          it.repo === dest.repo && !dest.dir && (dest.ref || '') === (it.ref || ''));
        if (selfCopies.length) {
          return toast('warning', selfCopies.length + ' staged file' + (selfCopies.length === 1 ? '' : 's') + ' would copy onto themselves — add a :dir or @ref', 'alert-error', 5000);
        }
        if (!this.sendArmed) {
          this.sendArmed = true;
          setTimeout(() => { this.sendArmed = false; }, 3000);
          return;
        }
        this.sendArmed = false;
        this.sending = true;
        this.sendStatus = '';
        try {
          const gh = Alpine.store('browser').gh;
          if (this.groups.length && !gh.copyTo) await window.gh?.load('gh-transfer.js');
          if (this.groups.length && !gh.copyTo) throw new Error('gh-transfer.js unavailable');
          if (this.localItems.length && !gh.saveBytes) await window.gh?.load('gh-store.js');
          if (this.localItems.length && !gh.saveBytes) throw new Error('gh-store.js unavailable');
          const total = this.items.length;
          let done = 0;
          const failures = [];
          // Refs: one grouped copyTo per source repo@ref.
          for (const g of this.groups) {
            const src = this.srcGh(g.repo, g.ref);
            const res = await src.copyTo(dest, g.items.map(i => i.path), {
              onProgress: (d) => {
                this.sendStatus = 'copying ' + Math.min(done + d + 1, total) + '/' + total + '…';
              }
            });
            done += g.items.length;
            failures.push(...res.filter(r => r.status === 'error'));
          }
          // Local files: write held bytes/text into dest.dir.
          if (this.localItems.length) {
            const destGh = this.srcGh(dest.repo, dest.ref);
            for (const it of this.localItems) {
              const path = joinDir(dest.dir, it.name);
              const msg = 'Add ' + path + ' via show-repo';
              try {
                if (it.isText) await destGh.save(path, it.text, msg);
                else await destGh.saveBytes(path, it.bytes, msg);
                done++;
                this.sendStatus = 'copying ' + Math.min(done, total) + '/' + total + '…';
              } catch (e) {
                failures.push({ path, status: 'error', error: e });
              }
            }
          }
          const ok = total - failures.length;
          this.sendStatus = ok + '/' + total + ' copied to ' + dest.repo + (dest.dir ? ':' + dest.dir : '');
          if (failures.length) {
            console.warn('copy failures:', failures);
            toast('warning', failures.length + ' file' + (failures.length === 1 ? '' : 's') + ' failed — see console', 'alert-error', 6000);
          } else {
            toast('paper-plane-tilt', 'Copied ' + ok + ' file' + (ok === 1 ? '' : 's') + ' to ' + dest.repo, 'alert-success', 4000);
          }
        } catch (e) {
          this.sendStatus = '';
          toast('warning', 'Copy failed: ' + (e.message || e), 'alert-error', 6000);
        }
        this.sending = false;
      },

      // Persist the staged REFS as stage.files in the NAMED repo's manifest,
      // merging into whatever else its .web-tools.json declares. The stage is
      // estate-level, so saving one means saying where: the registry by
      // default (a general staging, no repo's property), or any repo the field
      // names. Local files can't serialize, so they are dropped from the saved
      // list. Items already in the target repo at its default branch save as
      // bare paths (backward compatible); everything else fully qualified.
      // Explicit gesture, one commit; lands on the target's default branch.
      async save() {
        if (this.savingStage) return;
        const toast = Alpine.store('toast');
        const s = Alpine.store('browser');
        const target = (this.saveTarget || '').trim();
        if (!/^[\w.-]+\/[\w.-]+$/.test(target)) {
          return toast('warning', 'Save target must be owner/repo', 'alert-error', 4000);
        }
        this.savingStage = true;
        try {
          if (!s.gh.save) await window.gh?.load('gh-store.js');
          if (!s.gh.save) throw new Error('gh-store.js unavailable');
          const dst = this.srcGh(target, '');
          let cfg = {};
          // SUNSET(2026-08-15): the '.show-repo.json' entry is the legacy-name
          // read fallback; drop it once consumer repos are migrated.
          for (const name of ['.web-tools.json', '.show-repo.json']) {
            try { cfg = JSON.parse((await dst.get(name)).text); break; } catch {}
          }
          cfg.stage = {
            ...(cfg.stage || {}),
            files: this.refItems.map(it =>
              (it.repo === target && !it.ref) ? it.path : this.itemKey(it))
          };
          await dst.save('.web-tools.json', cfg, 'Update staged files via show-repo');
          if (target === s.repo) s.config = cfg;
          const note = this.localItems.length ? ' (local files not saved)' : '';
          toast('push-pin', 'Stage saved to ' + target + note, 'alert-success', 3000);
        } catch (e) {
          toast('warning', 'Save failed: ' + (e.message || e), 'alert-error', 6000);
        }
        this.savingStage = false;
      }
    };
  });
});
