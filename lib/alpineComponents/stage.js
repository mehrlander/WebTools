// The stage: a cross-repo fileset staged for action (view, copy out, send to
// a repo). This component is the BENCH, the working half of show-repo's Stage
// view: it mounts once, fixed at the top of that view, above the shelf of
// saved surfaces the estate component renders below it. One stage above any
// repo, beside Repos, since staged items each carry their own origin and the
// set never belonged to the open repo. The link is the
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
  // Delegates to lib/kits/repo-address.js, which owns the grammar. Read at call time
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
  // The source choice rides lib/kits/url-params.js, so the precedence rule has one
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

          <!-- No title row and no mode pill. The bench mounts under the Stage
               view's own "Stage" heading (lib/alpineComponents/estate.js),
               which names the place and, when the set came from a saved
               surface, says which one. A title here would be the second copy.
               The stage-wide actions sit on the thing they act on; the empty
               state carries Add file, since the lens bar does not exist until
               something is staged. -->
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
                <p class="text-base text-base-content/60">Drop files or paste refs anywhere, or find one below.</p>
                <p class="text-base text-base-content/40 mt-1">Stage two and the Diff lens compares them.</p>
                <button @click="$refs.fileInput.click()" class="btn btn-ghost btn-sm gap-1.5 mt-4"
                        title="Add a local file (or drop / paste anywhere on this view)">
                  <i class="ph ph-paperclip text-lg"></i>Add file
                </button>
              </div>

              <div x-show="items.length" class="flex flex-col gap-2">
                <!-- NO LENS STRIP. Out and Diff were a segmented pill here
                     until 2026-08-04, but they were never two views of one
                     thing: Out is where the set LEAVES (bundle, send), and
                     Diff was a way to READ two of its files. Reading now
                     happens where reading happens, in the preview, which
                     already walks the staged set and can therefore pair two of
                     it without a second set of controls. So this side keeps
                     only the deposit surface, and it needs no tab to name it. -->
                <div class="flex items-center justify-between gap-2 border-b border-base-300 pb-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="flex items-center gap-1.5 text-base font-medium text-base-content/70 shrink-0">
                      <i class="ph ph-export text-lg"></i>Out</span>
                    <span class="opacity-60 font-mono text-base truncate" x-text="bundleStat"></span>
                  </div>
                  <!-- What acts on the BUNDLE. What acts on the staged SET
                       (add, link, save, clear) sits on the set, in the aside.

                       NO SHOW-THE-BLOCK TOGGLE. The bundle is something you
                       send somewhere else, so the three verbs that leave with
                       it are the whole surface; reading a wall of concatenated
                       files here answered no question the staged list and the
                       preview do not answer better. The size still reads out,
                       which is the part of "show me the block" anyone wanted. -->
                  <div class="flex items-center gap-0.5 shrink-0">
                    <button @click="rebuild()" :disabled="bundleBusy" class="btn btn-square btn-ghost" title="Refresh">
                      <i class="ph text-xl" :class="bundleBusy ? 'ph-circle-notch animate-spin' : 'ph-arrows-clockwise'"></i>
                    </button>
                    <button @click="copyBundle()" class="btn btn-square btn-ghost" title="Copy the concatenated block">
                      <i class="ph text-xl" :class="bundleCopied ? 'ph-check' : 'ph-copy'"></i>
                    </button>
                    <button @click="download()" class="btn btn-square btn-ghost" title="Download the concatenated block">
                      <i class="ph ph-download-simple text-xl"></i>
                    </button>
                  </div>
                </div>

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

                <div class="flex items-center justify-end gap-2 flex-wrap">
                  <span class="text-base font-mono opacity-60 truncate" x-text="sendStatus"></span>
                </div>
              </div>
            </div>

            <!-- ASIDE: what is staged, then where to get more. -->
            <div class="flex flex-col gap-3 min-w-0">

              <!-- Staged items, grouped by source repo@ref, then local. -->
              <div x-show="items.length" class="flex flex-col gap-1.5">
                <!-- The label row carries the set's own actions, in the order
                     they escalate: a link serializes it into a URL, a pin
                     serializes it into a file, a sweep empties it. All three
                     act on exactly the list beneath them, where the per-item x
                     already removes one. Send lives with the bundle instead,
                     since it moves file CONTENTS into a folder, where these
                     move the LIST; putting them in one row read as variations
                     on each other when they are unrelated acts. -->
                <div class="flex items-center gap-1 text-base font-semibold uppercase tracking-wide text-base-content/40">
                  Staged<span class="normal-case tracking-normal opacity-70" x-text="' · ' + items.length"></span>
                  <div class="grow"></div>
                  <button @click="copyLink()" class="btn btn-square btn-ghost btn-sm hover:text-primary"
                          title="Copy the persistent stage link: a #stage= URL that reopens these refs (and the current tab) anywhere (local files excluded)">
                    <i class="ph text-base" :class="linkCopied ? 'ph-check' : 'ph-link'"></i>
                  </button>
                  <button @click="openSave()" class="btn btn-square btn-ghost btn-sm hover:text-primary"
                          title="Save this set as a surface, kept alongside the others">
                    <i class="ph ph-push-pin text-base"></i>
                  </button>
                  <button @click="clearAll()" class="btn btn-square btn-ghost btn-sm hover:text-error" title="Clear the stage">
                    <i class="ph ph-broom text-base"></i>
                  </button>
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

              <!-- ── Add: three pills ────────────────────────────────────────
                   Browse, Recent, and Search share one corpus (addRoots) and
                   one outcome (a staged ref), but they are not one question.
                   Folding them into a single query box put recent files in the
                   same list as the repos you navigate, and a list that is half
                   "places to go" and half "things that happened" reads as
                   neither. They are three panes behind the app's segmented
                   pill, the same control the Stage, Activity, and Map use.

                   What survives from the one-box build is the part that was
                   actually about cost rather than layout: BROWSE AND SEARCH
                   SHARE ONE TREE CACHE. Entering a repo reads its tree, and
                   Search reads only what is still missing, so browsing pays
                   for searching in advance instead of the two each fetching
                   the same thing. The pill tap is the gate on that cost, which
                   is what a tap is for and what a keystroke is not. -->
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-1 text-base font-semibold uppercase tracking-wide text-base-content/40">
                  Add
                  <div class="grow"></div>
                  <!-- The one source that is not a repo file, so it belongs to
                       no pane: local bytes cannot be named by ref, which is why
                       they drop out of a #stage= link and a saved surface. -->
                  <button @click="$refs.fileInput.click()" class="btn btn-square btn-ghost btn-sm hover:text-primary"
                          title="Add a local file (or drop / paste anywhere on this view)">
                    <i class="ph ph-paperclip text-base"></i>
                  </button>
                  <button x-show="addTab === 'recent'" @click="loadRecent(true)" class="btn btn-square btn-ghost btn-sm hover:text-primary" title="Refresh recent">
                    <i class="ph text-base" :class="recentLoading ? 'ph-circle-notch animate-spin' : 'ph-arrows-clockwise'"></i>
                  </button>
                  <button @click="recentOpen = !recentOpen" class="btn btn-square btn-ghost btn-sm" title="Collapse">
                    <i class="ph ph-caret-down text-base transition-transform" :class="!recentOpen && '-rotate-90'"></i>
                  </button>
                </div>

                <div class="flex items-center gap-0.5 rounded-lg bg-base-200/60 p-0.5 w-fit" role="tablist">
                  <button role="tab" @click="addTab = 'browse'"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                          :class="addTab === 'browse' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    <i class="ph ph-folder-open text-lg"></i>Browse</button>
                  <button role="tab" @click="addTab = 'recent'"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                          :class="addTab === 'recent' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    <i class="ph ph-clock-counter-clockwise text-lg"></i>Recent
                    <span x-show="recent.length" class="font-mono text-sm opacity-60" x-text="recent.length"></span></button>
                  <button role="tab" @click="addTab = 'search'; loadAllTrees()"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-base font-medium transition-colors"
                          :class="addTab === 'search' ? 'bg-base-100 text-primary shadow-sm' : 'text-base-content/60 hover:text-base-content'">
                    <i class="ph ph-magnifying-glass text-lg"></i>Search</button>
                </div>

                <!-- BROWSE: repos, then folders, then files. Crumbs walk back
                     up; the house returns to the roots. No text input, which is
                     path-picker's rule and its reason: an input invites iOS's
                     focus zoom for what is entirely navigation. -->
                <div x-show="recentOpen && addTab === 'browse' && addScope" class="flex items-center gap-0.5 flex-wrap text-base">
                  <button @click="addUp(-1)" class="px-1.5 py-0.5 rounded hover:bg-base-200 text-base-content/50 hover:text-primary" title="All repos">
                    <i class="ph ph-house"></i></button>
                  <template x-for="(c, i) in addCrumbs()" :key="i">
                    <div class="flex items-center gap-0.5 min-w-0">
                      <i class="ph ph-caret-right text-base-content/25 text-sm"></i>
                      <button @click="addUp(i)" class="px-1.5 py-0.5 rounded hover:bg-base-200 truncate font-mono"
                              :class="i === addCrumbs().length - 1 ? 'text-base-content/70' : 'text-base-content/45 hover:text-primary'"
                              x-text="c.label"></button>
                    </div>
                  </template>
                  <div class="grow"></div>
                  <span x-show="addTruncated" class="text-base-content/40" title="This repo's tree is too large to list in full">partial</span>
                </div>

                <!-- RECENT: the cross-repo sweep, with its own repo filter.
                     Badges, not tabs: they narrow one list rather than swapping
                     panes, and reading as a different control is the point. -->
                <div x-show="recentOpen && addTab === 'recent' && repoPills().length > 1" class="flex flex-wrap gap-1">
                  <template x-for="pl in repoPills()" :key="pl.repo">
                    <button @click="togglePill(pl.repo)"
                            class="badge badge-sm cursor-pointer gap-1 transition-opacity"
                            :class="pillSel === pl.repo ? 'badge-primary' : pillSel ? 'badge-ghost opacity-40' : 'badge-ghost'">
                      <span x-text="shortRepo(pl.repo)"></span>
                      <span class="opacity-60" x-text="pl.n"></span>
                    </button>
                  </template>
                </div>

                <!-- SEARCH: filename-contains across every root repo. 16px
                     below sm so iOS does not zoom on focus, and never
                     autofocused. Matching is local per keystroke; the trees it
                     reads were paid for when this pill was tapped. -->
                <label x-show="recentOpen && addTab === 'search'" class="input input-bordered flex items-center gap-2">
                  <i class="ph ph-magnifying-glass opacity-50"></i>
                  <input x-model="addQ" type="text" placeholder="File name contains…"
                         autocomplete="off" autocapitalize="off" spellcheck="false"
                         class="grow font-mono text-lg sm:text-base">
                  <button x-show="addQ" @click="addQ = ''" class="opacity-40 hover:opacity-100 shrink-0" title="Clear">
                    <i class="ph ph-x-circle"></i></button>
                </label>

                <div x-show="recentOpen && addBusy" class="flex justify-center py-4">
                  <span class="loading loading-dots loading-md opacity-30"></span>
                </div>

                <div x-show="recentOpen" class="flex flex-col max-h-72 overflow-y-auto overscroll-contain rounded-lg">
                  <template x-for="row in addRows()" :key="row.key">
                    <div class="group flex items-center rounded-lg hover:bg-base-200 transition-colors">
                      <!-- One row shape for all three panes, and the icon says
                           what the tap does: a caret descends, a plus stages, a
                           check unstages. The GitHub jump rides beside the
                           button, since an anchor inside a button is not a
                           control. -->
                      <button @click="addPick(row)"
                              class="flex items-center gap-2.5 px-2 py-1.5 min-w-0 flex-1 text-left">
                        <i class="ph text-lg shrink-0" :class="addRowIcon(row)"></i>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-baseline justify-between gap-2">
                            <span class="truncate font-mono text-base" x-text="row.label"></span>
                            <span x-show="row.date" class="shrink-0 text-base opacity-50" x-text="ago(row.date)"></span>
                          </div>
                          <div x-show="row.sub" class="truncate font-mono text-base opacity-50"
                               :title="row.title" x-text="row.sub"></div>
                        </div>
                        <i x-show="row.kind === 'repo' || row.kind === 'dir'"
                           class="ph ph-caret-right text-base-content/25 shrink-0"></i>
                      </button>
                      <a x-show="row.kind === 'file'" :href="itemGh(row)" :data-peek="itemPeek(row)" target="_blank" rel="noopener"
                         :title="row.title + ' on GitHub'"
                         class="px-2 py-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 text-base-content/30 hover:text-primary transition-opacity shrink-0">
                        <i class="ph ph-github-logo"></i></a>
                    </div>
                  </template>

                  <div x-show="addEmpty" class="py-4 text-center text-base text-base-content/50" x-text="addEmpty"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Inline preview as a centered overlay, so a wide code view never
               fights the two-pane grid. Backdrop, X, or Escape dismisses. The
               body is the shared file viewer (viewer.js), embedded
               (bindStore:false so it doesn't track the Files view's activeFile,
               fill so it grows to the modal), so a staged file previews with
               the same syntax highlighting, markdown/JSON modes, and wrapping
               raw mode as the Files tab. Full-bleed sheet on mobile, centered
               card on wider screens.

               THE PREVIEW IS A POSITION IN THE STAGE, not one file. Opening a
               row used to be a dead end: to see the next staged file you closed
               the modal, found the row, and opened it again, which is three
               taps to move one place in a list you are already looking at. It
               now carries an index, so the set is walkable: swipe on a phone,
               the arrows or the arrow keys anywhere. Same gesture as the
               estate's branch takeover (estate.js, dTouch*) with the same
               constants, so a horizontal drag reads alike in both places and a
               vertical one still scrolls the file.

               EVERY INDEX SHOWS SOMETHING, which is what makes the counter
               honest. A binary local file and a failed fetch render a note in
               place of the viewer rather than refusing to open, so "2 / 3"
               always means the second of three and a swipe never skips. -->
          <div x-show="preview" x-cloak
               class="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4"
               @click.self="preview = null"
               @keydown.escape.window="preview = null"
               @keydown.arrow-left.window="preview && previewStep(-1)"
               @keydown.arrow-right.window="preview && previewStep(1)">
            <div class="bg-base-100 border-base-300 shadow-xl w-full h-full flex flex-col overflow-hidden sm:h-auto sm:max-w-3xl sm:max-h-[85vh] sm:border sm:rounded-xl">
              <div class="px-3 py-2 bg-base-200/60 flex items-center gap-1 text-base border-b border-base-300 shrink-0">
                <i class="ph opacity-60 shrink-0" :class="preview?.mode === 'diff' ? 'ph-git-diff' : 'ph-eye'"></i>
                <span class="font-medium opacity-70 shrink-0" x-text="preview?.mode === 'diff' ? 'Diff' : 'Preview'"></span>
                <span x-show="preview?.mode === 'diff' && diffStat"
                      class="font-mono text-base opacity-50 shrink-0" x-text="diffStat"></span>
                <!-- Position, and the pointer's version of the swipe. Shown
                     only when there is somewhere to go. -->
                <template x-if="items.length > 1">
                  <span class="flex items-center gap-0.5 ml-1">
                    <button @click="previewStep(-1)" :disabled="preview?.i <= 0"
                            class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100 disabled:opacity-20" title="Previous staged file">
                      <i class="ph ph-caret-left text-lg"></i></button>
                    <span class="font-mono text-base opacity-50 tabular-nums"
                          x-text="(preview?.i + 1) + ' / ' + items.length"></span>
                    <button @click="previewStep(1)" :disabled="preview?.i >= items.length - 1"
                            class="btn btn-ghost btn-square btn-sm opacity-60 hover:opacity-100 disabled:opacity-20" title="Next staged file">
                      <i class="ph ph-caret-right text-lg"></i></button>
                  </span>
                </template>
                <span class="grow"></span>
                <!-- The pair is the position: previewing a staged set, the two
                     things you would compare are the one you are on and its
                     neighbour, so no selection is needed and none is offered.
                     With exactly two staged it is simply "the two", from
                     either position. -->
                <button x-show="items.length > 1" @click="togglePreviewDiff()"
                        class="btn btn-ghost btn-square opacity-60 hover:opacity-100 shrink-0"
                        :class="preview?.mode === 'diff' && 'text-primary opacity-100'"
                        :title="preview?.mode === 'diff' ? 'Back to the file' : ('Compare ' + previewPairLabel())">
                  <i class="ph text-2xl" :class="diffBusy ? 'ph-circle-notch animate-spin' : (preview?.mode === 'diff' ? 'ph-file' : 'ph-git-diff')"></i>
                </button>
                <button @click="preview = null" class="btn btn-ghost btn-square opacity-60 hover:opacity-100 shrink-0" title="Close">
                  <i class="ph ph-x text-2xl"></i>
                </button>
              </div>
              <div class="flex flex-col flex-1 min-h-0 overflow-hidden"
                   x-ref="pPane"
                   @touchstart.passive="pTouchStart($event)" @touchmove="pTouchMove($event)"
                   @touchend.passive="pTouchEnd($event)" @touchcancel.passive="pTouchCancel()">
                <div x-show="preview?.mode !== 'diff' && !preview?.note" class="flex flex-col flex-1 min-h-0 overflow-hidden p-3"
                     id="stage-preview-viewer" x-data="viewer({ bindStore: false, fill: true })"></div>
                <div x-show="preview?.mode !== 'diff' && preview?.note" class="flex flex-col items-center justify-center flex-1 gap-2 p-8 text-center">
                  <i class="ph ph-file-dashed text-4xl opacity-25"></i>
                  <p class="text-base text-base-content/60" x-text="preview?.note"></p>
                  <p class="font-mono text-base text-base-content/40" x-text="preview?.name"></p>
                </div>

                <!-- The diff, in the same modal and over the same pair the
                     position names. Everything the page's Diff lens carried
                     comes with it: the tagged rows, the copy, the hand-off to
                     the Diff page, and the review prompts (link-carried
                     bespoke asks first, then the fixed set). -->
                <div x-show="preview?.mode === 'diff'" class="flex flex-col flex-1 min-h-0 overflow-auto p-3 gap-2">
                  <div class="flex items-center gap-1.5 flex-wrap shrink-0">
                    <span class="font-mono text-base opacity-60 truncate" x-text="previewPairLabel()"></span>
                    <span class="grow"></span>
                    <button x-show="diffRows" @click="copyDiff()" class="btn btn-ghost btn-sm gap-1" title="Copy the diff as a patch-like block">
                      <i class="ph" :class="diffCopied ? 'ph-check' : 'ph-copy'"></i><span class="hidden sm:inline">Copy</span>
                    </button>
                    <a x-show="diffHandoff" :href="diffHandoff" target="_blank" class="btn btn-ghost btn-sm gap-1"
                       title="Open this pair in the Diff page: split view, word-level highlighting, folding, a real patch">
                      <i class="ph ph-arrow-square-out"></i><span class="hidden sm:inline">Open in Diff</span>
                    </a>
                  </div>

                  <div x-show="diffRows"
                       class="overflow-auto font-mono text-base leading-snug border border-base-300 rounded bg-base-200/40 whitespace-pre shrink-0">
                    <template x-for="(r, i) in (diffRows || [])" :key="i">
                      <div class="px-2"
                           :class="r.t === 'add' ? 'bg-success/10 text-success' : r.t === 'del' ? 'bg-error/10 text-error' : 'text-base-content/55'"
                           x-text="(r.t === 'add' ? '+ ' : r.t === 'del' ? '- ' : '  ') + r.line"></div>
                    </template>
                  </div>

                  <div x-show="diffRows" class="border border-base-300 rounded-lg overflow-hidden shrink-0">
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
              </div>
            </div>
          </div>

          <!-- Save-as-surface dialog. It exists for the preview, not the two
               text fields: the serialized form is not guessable from the list
               on screen (a path shortens or keeps its owner/repo@ref by where
               it came from, a diff pair becomes a relation, a local file rides
               its own bytes or is left behind), so the one honest way to show
               what is about to be written is to show it. Saving APPENDS: every
               save mints a new file, and a set is removed by deleting its own,
               which is why nothing here asks what to overwrite. -->
          <dialog x-ref="saveDlg" class="modal" onclick="if(event.target===this)this.close()">
            <div class="modal-box max-w-2xl">
              <h3 class="font-bold text-lg flex items-center gap-2 mb-3">
                <i class="ph ph-push-pin"></i>
                <span x-text="origin ? 'Update surface' : 'Save as surface'"></span>
              </h3>
              <p class="text-base text-base-content/50 -mt-2 mb-3"
                 x-text="origin ? 'Writes back to the file this set was read from.'
                                : 'Writes a new file. Nothing already saved is touched.'"></p>
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-base font-semibold uppercase tracking-wide text-base-content/40">Name</label>
                  <input x-model="saveName" :placeholder="autoName"
                         class="input input-bordered w-full" :disabled="savingStage">
                  <span class="text-base text-base-content/40">Blank takes the generated name. A saved set is a
                    clipboard entry before it is a document; rename it later if it becomes one.</span>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-base font-semibold uppercase tracking-wide text-base-content/40">Why this set exists</label>
                  <input x-model="saveDesc" placeholder="optional"
                         class="input input-bordered w-full" :disabled="savingStage">
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-base font-semibold uppercase tracking-wide text-base-content/40">Proposed destination</label>
                  <input x-model="saveDest" placeholder="owner/repo:dir (optional)"
                         class="input input-bordered w-full font-mono" :disabled="savingStage">
                  <span class="text-base text-base-content/40">Where this set is meant to go. A claim about the set,
                    not a transfer: nothing is sent by saving.</span>
                </div>
                <div x-show="saveSkipped.length" class="text-base text-warning flex items-start gap-1.5">
                  <i class="ph ph-warning shrink-0 mt-0.5"></i>
                  <span>Left out, being bytes a JSON field cannot carry:
                    <span class="font-mono" x-text="saveSkipped.join(', ')"></span></span>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-base font-semibold uppercase tracking-wide text-base-content/40 flex items-center gap-2">
                    Will be written
                    <span class="font-mono normal-case tracking-normal opacity-60" x-text="savePath"></span>
                  </label>
                  <div class="overflow-auto font-mono text-base leading-snug border border-base-300 rounded p-2 bg-base-200/40 max-h-64 whitespace-pre"
                       x-text="savePreview"></div>
                </div>
              </div>
              <div class="modal-action">
                <button @click="$refs.saveDlg.close()" class="btn btn-ghost">Cancel</button>
                <button @click="saveAsSurface()" :disabled="savingStage || !items.length" class="btn btn-primary gap-1">
                  <i class="ph" :class="savingStage ? 'ph-circle-notch animate-spin' : 'ph-push-pin'"></i>
                  <span x-text="savingStage ? 'Saving…' : 'Save'"></span>
                </button>
              </div>
            </div>
          </dialog>

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
      // The preview is a POSITION in the stage: { i, name, note } opens the
      // modal at item i, with content driven into the embedded viewer via its
      // __viewer handle, or `note` shown in its place when there is nothing to
      // render (binary, or a fetch that failed). Holding the index is what
      // makes the set walkable by swipe and arrows.
      preview: null,
      saveName: '', saveDesc: '', saveDest: '',   // save-as-surface dialog fields
      recent: [],          // [{repo, ref, path, date}] merged across root repos
      recentOpen: true,    // header toggles; the list scrolls inside its box
      recentLoading: false,
      _recentLoaded: false,
      // ── Add: three panes ───────────────────────────────────────────────
      // Browse (addScope), Recent (pillSel), Search (addQ). Each pane owns its
      // own state and reads none of the others'. Folding them into one query
      // box put recent files in the same list as the repos you navigate, and a
      // list that is half "places to go" and half "things that happened" reads
      // as neither; they are three questions, so they are three panes.
      addTab: 'recent',    // 'browse' | 'recent' | 'search'
      addQ: '',            // Search only
      addScope: null,      // Browse only: null | {repo, ref, dir}
      pillSel: '',         // Recent only: single-select repo filter ('' = all)
      // One recursive tree per repo, keyed by repo, filled from either
      // direction: descending into a repo loads its tree, and the deep search
      // loads whatever is still missing. Sharing the cache is what makes the
      // escalation get cheaper the more you have browsed.
      trees: {},           // {repo: {paths:[…], truncated:bool}}
      treeBusy: '',        // repo whose tree is in flight (descent)
      deepBusy: false,     // the escalation is in flight (all remaining repos)
      diffA: 0, diffB: 0,  // staged-item indexes for the compare
      diffRows: null,      // [{t:'ctx'|'add'|'del', line}] | null
      diffStat: '',
      diffBusy: false,
      diffCopied: false,
      promptCopiedIdx: -1,
      linkPrompts: [],     // bespoke review asks carried on the opening #stage= link
      linkMode: '',        // 'diff' when the opening link declared a diff intent
      _dragDepth: 0,       // whole-view drag counter (nested enter/leave safe)
      _autoDiffed: false,  // a diff-mode link auto-runs its diff once
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
        // The Recent sweep can just run: the bench mounts on the first visit to
        // the Stage (estate.js latches its x-if), not hidden at page load, so
        // reaching here already means the view is being looked at. It is the
        // Add box's landing content, and the only read the box makes without
        // being asked; the per-repo trees behind browsing and the deep search
        // are both pulled on a tap. Cached until the header's refresh.
        this.loadRecent();
        // The repo's .web-tools.json manifest (probed by the shell) can carry
        // a durable staged-files list; fold it in whenever a config lands.
        this.$watch(() => Alpine.store('browser').config, cfg => this.seedStage(cfg));
        this.seedStage(Alpine.store('browser').config);
        // Keep the concatenated block in step with the stage. Newly-added
        // items fetch once (cache); removed items just drop out of the join.
        this.$watch(() => this.items.map(it => this.itemKey(it)).join('|'), () => this.ensureBundle());
        this.ensureBundle();
        // The pair is chosen by the preview's position (previewPair), so
        // nothing here picks one. This only CLAMPS: an item removed under an
        // open diff must not leave an index pointing past the end.
        const clampPair = () => {
          const n = this.items.length;
          if (this.diffA >= n) { this.diffA = 0; this.invalidateDiff(); }
          if (this.diffB >= n) { this.diffB = Math.max(0, n - 1); this.invalidateDiff(); }
        };
        this.$watch(() => this.items.length, clampPair);
        clampPair();
        // The opening #stage= link carries commentary and, optionally, a diff
        // intent (the shell seeds the refs from the same hash and leaves it in
        // place). Read both once: the bespoke prompts show first in the panel,
        // and a mode=diff link OPENS THE PREVIEW ON ITS DIFF once the two items
        // have landed (the shell seeds them after mount). It used to select a
        // tab on the page; with the diff living in the preview, the link's
        // intent is best served by putting the reader in front of it.
        try {
          const lk = window.StageLink.read(location);
          this.linkPrompts = lk.prompts;
          this.linkMode = lk.mode;
        } catch {}
        const autoDiff = () => {
          if (this.linkMode !== 'diff' || this._autoDiffed || this.items.length < 2) return;
          this._autoDiffed = true;
          this.previewAt(0, 'diff');
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
      // Size only. The count was here too, and it was the third copy on screen
      // (the Staged label and the group row both carry it), so at narrow widths
      // the truncation ate the one fact that appears nowhere else.
      get bundleStat() {
        if (!this.bundleText) return '';
        return (new Blob([this.bundleText]).size / 1024).toFixed(1) + ' KB';
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
      // Clearing drops the origin with the items. Keeping it would leave the
      // bench pointing at a saved surface it no longer holds, so the next save
      // would silently overwrite that file with whatever was staged next.
      clearAll() {
        const s = Alpine.store('browser');
        s.stage = [];
        s.stageOrigin = null;
      },

      // Preview a staged item inline. The stage is estate-context, so this
      // never routes through a repo's Files view: a ref loads from its origin
      // (with a GitHub jump-over in the header); a local text item shows its
      // held text; a local binary can't be previewed, so say so.
      // Open the preview at this item's place in the stage. The row hands us
      // the item, not an index, because the staged list is grouped by repo; the
      // index is what the preview walks, so it is resolved here once.
      view(it) {
        const k = this.itemKey(it);
        const i = this.items.findIndex(x => this.itemKey(x) === k);
        return this.previewAt(i < 0 ? 0 : i);
      },
      previewStep(dir) {
        const i = (this.preview ? this.preview.i : 0) + dir;
        if (i < 0 || i >= this.items.length) return;
        return this.previewAt(i, this.preview?.mode);
      },

      // ── The diff, from the position ────────────────────────────────────
      // The pair is where you are and what is next to it, so there is nothing
      // to select. min(i, n-2) keeps it valid at the end of the list, which
      // means a diff is always available with two or more staged and the last
      // position compares the last two rather than offering nothing. With
      // exactly two staged it is "the two" from either position, which is the
      // case this exists for.
      previewPair() {
        const n = this.items.length;
        if (n < 2) return null;
        const i = this.preview ? this.preview.i : 0;
        const a = Math.max(0, Math.min(i, n - 2));
        return [a, a + 1];
      },
      previewPairLabel() {
        const pr = this.previewPair();
        if (!pr) return '';
        const nm = (i) => { const it = this.items[i]; return this.baseName(it.local ? (it.path || it.name) : it.path); };
        return nm(pr[0]) + ' \u2194 ' + nm(pr[1]);
      },
      // One toggle: into the diff and back to the file, over the same modal.
      async togglePreviewDiff() {
        if (!this.preview) return;
        if (this.preview.mode === 'diff') return this.previewAt(this.preview.i, 'file');
        return this.previewAt(this.preview.i, 'diff');
      },
      // Load one position. Every outcome opens: a binary local file and a
      // failed fetch set `note` and render it instead of the viewer, so the
      // counter stays truthful and a swipe never lands on nothing.
      async previewAt(i, mode) {
        const it = this.items[i];
        if (!it) { this.preview = null; return; }
        const name = it.local ? (it.path || it.name) : it.path;
        // Diff mode is a property of the modal, not of the item, so it survives
        // stepping: walk the set with the diff open and each position re-pairs
        // and re-runs. Falls back to the file when there is nothing to pair.
        if (mode === 'diff' && this.items.length > 1) {
          this.preview = { i, name, note: '', mode: 'diff' };
          const [a, b] = this.previewPair();
          if (a !== this.diffA || b !== this.diffB) { this.diffA = a; this.diffB = b; this.invalidateDiff(); }
          if (!this.diffRows) await this.runDiff();
          return;
        }
        const drive = (content, origin) => {
          this.preview = { i, name, note: '', mode: 'file' };
          this.$nextTick(() => document.getElementById('stage-preview-viewer')?.__viewer?.show(name, content, origin || null));
        };
        if (it.local) {
          if (it.isText) drive(fmt(it.text || ''), { local: true });
          else this.preview = { i, name, mode: 'file', note: 'Binary (' + this.fmtSize(it.size) + '). Staged for copy, not preview.' };
          return;
        }
        try {
          const res = await this.srcGh(it.repo, it.ref).get(it.path);
          drive(fmt(res.text), { repo: it.repo, ref: it.ref });
        } catch (e) {
          this.preview = { i, name, mode: 'file', note: 'Could not load it: ' + (e.message || e) };
        }
      },

      // ── Preview swipe ──────────────────────────────────────────────────
      // The estate's branch-detail takeover gesture (estate.js dTouch*),
      // against a local pane instead of an embedded frame. Same constants, so
      // the two read alike: lock to an axis after 8px, let a vertical drag
      // scroll the file, rubber-band at the ends, and commit past a fraction
      // of the pane. Touch only, so a pointer is never affected; the header's
      // arrows and the arrow keys are its equivalent.
      P_DRAG_MIN: 8,
      P_COMMIT_FRAC: 0.22,
      P_COMMIT_MAX: 90,
      _pT: null, _pLock: null, _pBusy: false,
      pTouchStart(e) {
        const t = e.touches && e.touches[0];
        if (!t || !this.preview || this._pBusy || e.touches.length !== 1) { this._pT = null; return; }
        const pane = this.$refs.pPane;
        this._pT = { x: t.clientX, y: t.clientY, w: (pane && pane.clientWidth) || window.innerWidth };
        this._pLock = null;
        if (pane) pane.style.transition = '';
      },
      pTouchMove(e) {
        const s = this._pT, t = e.touches && e.touches[0];
        if (!s || !t || e.touches.length !== 1) return;
        const dx = t.clientX - s.x, dy = t.clientY - s.y;
        if (this._pLock === null) {
          if (Math.abs(dx) < this.P_DRAG_MIN && Math.abs(dy) < this.P_DRAG_MIN) return;
          this._pLock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        }
        if (this._pLock !== 'h') return;            // vertical: let the file scroll
        if (e.cancelable) e.preventDefault();
        const pane = this.$refs.pPane;
        if (!pane) return;
        const i = this.preview.i, n = this.items.length;
        const atEdge = (dx > 0 && i <= 0) || (dx < 0 && i >= n - 1);
        pane.style.transform = 'translateX(' + (atEdge ? dx * 0.3 : dx) + 'px)';
      },
      pTouchCancel() {
        const s = this._pT; this._pT = null;
        if (s && this._pLock === 'h') this._pSettle();
      },
      pTouchEnd(e) {
        const s = this._pT, t = e.changedTouches && e.changedTouches[0];
        this._pT = null;
        if (!s || !t || !this.preview || this._pLock !== 'h') return;
        const dx = t.clientX - s.x;
        const dir = dx < 0 ? 1 : -1;
        const j = this.preview.i + dir;
        const committed = Math.abs(dx) > Math.min(this.P_COMMIT_MAX, s.w * this.P_COMMIT_FRAC)
          && j >= 0 && j < this.items.length;
        if (committed) this._pCommit(dir, s.w);
        else this._pSettle();
      },
      _pSettle() {
        const pane = this.$refs.pPane;
        if (!pane) return;
        pane.style.transition = 'transform .18s ease-out';
        pane.style.transform = 'translateX(0)';
        setTimeout(() => { pane.style.transition = ''; pane.style.transform = ''; }, 240);
      },
      // Slide out on the dragged edge, step, then bring the next one in from
      // the opposite edge, so the commit reads as one continuous surface
      // rather than a swap.
      async _pCommit(dir, w) {
        const pane = this.$refs.pPane;
        if (!pane) { await this.previewStep(dir); return; }
        this._pBusy = true;
        pane.style.transition = 'transform .18s ease-out';
        pane.style.transform = 'translateX(' + (dir === 1 ? -w : w) + 'px)';
        setTimeout(async () => {
          pane.style.transition = '';
          await this.previewStep(dir);
          pane.style.transform = 'translateX(' + (dir === 1 ? w : -w) + 'px)';
          requestAnimationFrame(() => {
            pane.style.transition = 'transform .18s ease-out';
            pane.style.transform = 'translateX(0)';
            setTimeout(() => { pane.style.transition = ''; pane.style.transform = ''; this._pBusy = false; }, 240);
          });
        }, 190);
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
      pathStaged(it) {
        const key = window.StageLink.fmtItem({ repo: it.repo, ref: it.ref || '', path: it.path });
        return this.items.some(x => this.itemKey(x) === key);
      },
      // Tap to stage, tap again to unstage: the row is the whole affordance.
      toggleFile(it) {
        if (this.pathStaged(it)) this.rm({ repo: it.repo, ref: it.ref || '', path: it.path });
        else this.grab({ repo: it.repo, ref: it.ref || '', path: it.path });
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

      // ── The Add box: one field, one list ────────────────────────────────
      // Ranking, mirroring path-picker.js's rule so the two finders in this app
      // order alike: exact, then prefix, then substring, then no match; and at
      // equal score a container sorts before a leaf, so descending is never
      // buried under files. Kept as a local function rather than imported
      // because the picker's is internal to its component; if a third caller
      // ever wants it, that is the moment to lift it into a shared kit.
      addRank(text, q) {
        const t = (text || '').toLowerCase();
        if (!q) return 2;
        if (t === q) return 0;
        if (t.startsWith(q)) return 1;
        return t.includes(q) ? 2 : 3;
      },
      shortRepo(r) { return (r || '').split('/').pop(); },
      // The effective query. A leading '@' is eaten, not matched: this whole
      // field is a path finder, so the sigil that mention.js needs mid-prose to
      // say "now I mean a path" is redundant here. But the muscle memory is
      // real and arrives from the other field, and a reader who types it gets
      // a character that matches no filename and an empty list. Eating it makes
      // '@' behave as the picker it was reaching for.
      get addQuery() { return this.addQ.replace(/^@+/, '').trim().toLowerCase(); },

      addRoots() { return this.pickerRoots(); },
      // The repos with no tree read yet, which is what tapping Search has left
      // to fetch. Browsing a repo fills the same cache, so the two never read
      // the same tree twice and Search after browsing costs only the rest.
      addUnread() {
        return [...new Set(this.addRoots().map(r => r.repo))].filter(r => !this.trees[r]);
      },
      get addBusy() {
        if (this.addTab === 'browse') return !!this.treeBusy;
        if (this.addTab === 'recent') return this.recentLoading && !this.recent.length;
        return this.deepBusy;
      },
      get addTruncated() {
        const sc = this.addScope;
        return !!(sc && this.trees[sc.repo] && this.trees[sc.repo].truncated);
      },
      // One recursive tree per repo, cached. Both the descent and the deep
      // search fill this, so neither pays for what the other already read.
      async loadTree(repo) {
        if (this.trees[repo]) return this.trees[repo];
        this.treeBusy = repo;
        try {
          const res = await this.srcGh(repo, 'HEAD').req('git/trees/HEAD?recursive=1');
          const t = { paths: (res.tree || []).filter(e => e.type === 'blob').map(e => e.path),
                      truncated: !!res.truncated };
          this.trees = { ...this.trees, [repo]: t };
          return t;
        } catch {
          const t = { paths: [], truncated: false };
          this.trees = { ...this.trees, [repo]: t };
          return t;
        } finally { this.treeBusy = ''; }
      },
      // Read every root repo still unread, so Search can run across all of
      // them. One recursive tree call per repo: the expensive thing here, and
      // the reason it hangs off the pill tap rather than off a keystroke.
      async loadAllTrees() {
        if (this.deepBusy) return;
        this.deepBusy = true;
        try { await Promise.all(this.addUnread().map(r => this.loadTree(r))); }
        finally { this.deepBusy = false; }
      },

      // Descend into a repo (dir '') or a folder. Browse carries no query of
      // its own, so there is nothing to clear: the search box belongs to the
      // Search pane, which is the split this restores.
      async enter(repo, ref, dir) {
        this.addScope = { repo, ref: ref || '', dir: dir || '' };
        await this.loadTree(repo);
      },
      // Crumbs: the repo, then each folder. addUp(-1) is the root.
      addCrumbs() {
        const sc = this.addScope;
        if (!sc) return [];
        const out = [{ label: this.shortRepo(sc.repo), dir: '' }];
        let acc = '';
        for (const seg of (sc.dir ? sc.dir.split('/') : [])) {
          acc = acc ? acc + '/' + seg : seg;
          out.push({ label: seg, dir: acc });
        }
        return out;
      },
      addUp(i) {
        if (i < 0) { this.addScope = null; return; }
        const c = this.addCrumbs()[i];
        if (c) this.addScope = { ...this.addScope, dir: c.dir };
      },

      // The folder listing at a scope, derived from the flat path list rather
      // than a second API shape: the immediate next segment of every path under
      // this dir, folders first. One recursive read per repo answers every
      // level, so descending never costs another call.
      dirEntries(repo, ref, dir) {
        const t = this.trees[repo];
        if (!t) return [];
        const base = dir ? dir + '/' : '';
        const dirs = new Set(), files = [];
        for (const p of t.paths) {
          if (!p.startsWith(base)) continue;
          const rest = p.slice(base.length);
          const cut = rest.indexOf('/');
          if (cut < 0) files.push({ name: rest, path: p });
          else dirs.add(rest.slice(0, cut));
        }
        const rows = [];
        for (const d of [...dirs].sort())
          rows.push({ kind: 'dir', key: 'd:' + repo + ':' + base + d, repo, ref, dir: base + d,
                      label: d, sub: '', title: repo + ':' + base + d });
        for (const f of files.sort((a, b) => a.name.localeCompare(b.name)))
          rows.push(this.fileRow(repo, ref, f.path, ''));
        return rows;
      },
      fileRow(repo, ref, path, date) {
        return { kind: 'file', key: 'f:' + repo + ':' + path, repo, ref: ref || '', path,
                 label: this.baseName(path), sub: this.whereFrom({ repo, path }),
                 title: repo + ':' + path, date: date || '' };
      },

      // THE LIST, one renderer over three panes. Each reads only its own
      // state, so nothing is mixed: Browse never shows a recent file, Recent
      // never shows a repo to enter, Search never shows either.
      addRows() {
        if (this.addTab === 'browse') {
          const sc = this.addScope;
          if (!sc) return this.addRoots().map(r => ({
            kind: 'repo', key: 'r:' + r.repo, repo: r.repo, ref: r.ref || '',
            label: this.shortRepo(r.repo), sub: r.repo, title: r.repo }));
          return this.trees[sc.repo] ? this.dirEntries(sc.repo, sc.ref, sc.dir) : [];
        }

        if (this.addTab === 'recent') {
          return this.recent
            .filter(it => !this.pillSel || it.repo === this.pillSel)
            .map(it => this.fileRow(it.repo, it.ref, it.path, it.date));
        }

        // Search: filename-contains over every root repo's tree, ranked on the
        // basename so an exact hit is not buried under a path that merely
        // contains the string. The trees were read when the pill was tapped,
        // so this is local string work per keystroke.
        const q = this.addQuery;
        if (q.length < 2) return [];
        const hits = [];
        for (const repo of [...new Set(this.addRoots().map(r => r.repo))]) {
          for (const path of (this.trees[repo]?.paths || [])) {
            if (path.toLowerCase().includes(q)) hits.push({ repo, path });
            if (hits.length >= 300) break;
          }
        }
        return hits
          .sort((x, y) => this.addRank(this.baseName(x.path), q) - this.addRank(this.baseName(y.path), q)
                       || x.path.localeCompare(y.path))
          .slice(0, 100)
          .map(h => this.fileRow(h.repo, '', h.path, ''));
      },
      get addEmpty() {
        if (this.addBusy || this.addRows().length) return '';
        if (this.addTab === 'browse')
          return this.addScope ? 'This folder is empty.' : 'No repos to browse.';
        if (this.addTab === 'recent')
          return this.recentLoading ? '' : 'Nothing recent yet.';
        return this.addQuery.length < 2 ? 'Type at least two characters.' : 'No matching files.';
      },
      addRowIcon(row) {
        if (row.kind === 'repo') return 'ph-git-branch text-primary/70';
        if (row.kind === 'dir') return 'ph-folder text-primary/70';
        return this.pathStaged(row) ? 'ph-check-circle text-success' : 'ph-plus-circle text-primary/70';
      },
      addPick(row) {
        if (row.kind === 'repo') return this.enter(row.repo, row.ref, '');
        if (row.kind === 'dir') return this.enter(row.repo, row.ref, row.dir);
        this.toggleFile(row);
      },
      // Recent's repo filter: single-select, tap again for all. A badge rather
      // than a tab, since it narrows one list instead of swapping panes.
      repoPills() {
        const counts = new Map();
        for (const it of this.recent) counts.set(it.repo, (counts.get(it.repo) || 0) + 1);
        return [...counts.entries()].map(([repo, n]) => ({ repo, n }));
      },
      togglePill(repo) { this.pillSel = this.pillSel === repo ? '' : repo; },

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
          // A diff intent rides the link when this stage HAS been diffed. The
          // signal used to be "the Diff tab is showing"; with no tab, the fact
          // that a diff was run is the honest version of the same claim.
          { prompts: this.linkPrompts, mode: this.diffRows ? 'diff' : '' });
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
      // One side's text. Reads the bundle's content cache first: it is keyed
      // by itemKey and holds exactly this, so a diff over a stage whose bundle
      // has already built costs nothing. That is what lets the diff just run
      // when the lens opens instead of waiting behind a button.
      async diffSide(it) {
        if (!it) throw new Error('nothing selected');
        if (it.local) {
          if (!it.isText) throw new Error(it.name + ' is binary');
          return it.text || '';
        }
        const k = this.itemKey(it);
        if (this._cache[k] != null) return this._cache[k];
        return fmt((await this.srcGh(it.repo, it.ref).get(it.path)).text);
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
            this.diffSide(this.items[this.diffA]),
            this.diffSide(this.items[this.diffB]),
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
        const spec = (it) => it.repo + (it.ref ? '@' + it.ref : '') + ':' + it.path;
        const q = new URLSearchParams({ a: spec(a), b: spec(b) });
        return new URL('../diff-tool.html?' + q, location.href).href;
      },

      // A compare side's display label: repo@ref:path for a ref item (the
      // override ref if one was used, else the item's own), or "(local) name"
      // for a dropped/pasted item. Used by the diff dump and the review
      // prompts, so both name what was actually compared, not just what's
      // staged.
      diffLabel(it) {
        if (!it) return '?';
        if (it.local) return '(local) ' + it.name;
        return it.repo + '@' + (it.ref || 'default') + ':' + it.path;
      },

      // The diff as a copyable, patch-like text block: a header naming both
      // sides, then the tagged rows as +/-/context
      // lines. Not a real unified-diff hunk format (no @@ markers, no
      // surrounding-line trimming) \u2014 the row set already IS the full compare.
      get diffDump() {
        if (!this.diffRows) return '';
        const a = this.diffLabel(this.items[this.diffA]);
        const b = this.diffLabel(this.items[this.diffB]);
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
        const a = this.diffLabel(this.items[this.diffA]);
        const b = this.diffLabel(this.items[this.diffB]);
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

      // ── Save as surface ──────────────────────────────────────────────────
      //
      // A saved stage is a surface (docs/envelopes/surface.md, the stage/1
      // profile), written to the registry's surfaces/ beside every other one,
      // and that is the whole reorganization: the shelf IS the history, so
      // there is no second list to browse and no per-repo drilldown to pick a
      // repo before picking a set.
      //
      // This replaced a write of stage.files into a NAMED repo's manifest,
      // which was wrong in three ways at once. It OVERWROTE, so each save
      // destroyed the last, with nothing on screen saying what was about to
      // go. It wrote a cross-repo set into one repo's config, when a stage's
      // items each carry their own origin and the set belongs to no repo. And
      // it silently dropped every local file, since a manifest has no place
      // for bytes. Appending v2 surfaces to the registry answers all three.
      //
      // stage.targets stays where it was: where a repo ACCEPTS files is a fact
      // about that repo, and the only part of the old block that ever was.
      // What the bench was read from, when it was read from a saved surface:
      // { uid, file, manifest, context }. Saving then writes THAT file, so
      // editing a saved set updates it instead of leaving a near-duplicate
      // beside it. Appending is for promoting a working set, which is the case
      // with no origin.
      get origin() { return Alpine.store('browser')?.stageOrigin || null; },

      get saveSurface() {
        const o = this.origin;
        return window.Surface.fromStage(this.items, {
          name: (this.saveName || '').trim() || (o ? o.manifest?.name : ''),
          description: (this.saveDesc || '').trim() || (o ? o.manifest?.description : ''),
          created_at: o ? o.manifest?.created_at : '',
          destination: (this.saveDest || '').trim() || (o ? o.context?.destination : ''),
          prompts: this.linkPrompts,
          // Same signal as the link's mode: a pair is recorded once it has
          // actually been compared, which is a fact about the set rather than
          // about which control happened to be open.
          compare: this.diffRows ? { a: this.diffA, b: this.diffB } : null,
        });
      },
      get autoName() { return window.Surface.autoName(this.saveSurface.surface.items); },
      get saveSkipped() { return this.saveSurface.skipped; },
      get savePreview() { return JSON.stringify(window.Surface.write(this.saveSurface.surface), null, 2); },
      get savePath() {
        const o = this.origin;
        return 'surfaces/' + (o ? o.file : window.Surface.fileName(this.saveSurface.surface));
      },

      // Prefill from the origin rather than falling back to it silently: a
      // blank-looking field over a value the preview will write is the form
      // lying about what it is going to do.
      openSave() {
        if (!this.items.length) return;
        const o = this.origin;
        if (o) {
          this.saveName = this.saveName || o.manifest?.name || '';
          this.saveDesc = this.saveDesc || o.manifest?.description || '';
          this.saveDest = this.saveDest || o.context?.destination || '';
        }
        this.$refs.saveDlg?.showModal();
      },

      async saveAsSurface() {
        if (this.savingStage || !this.items.length) return;
        const toast = Alpine.store('toast');
        const s = Alpine.store('browser');
        this.savingStage = true;
        try {
          if (!s.gh.save) await window.gh?.load('gh-store.js');
          if (!s.gh.save) throw new Error('gh-store.js unavailable');
          const { surface, skipped } = this.saveSurface;
          const path = this.savePath;
          const reg = this.srcGh(window.__shell?.REGISTRY_REPO || '', '');
          await reg.save(path, window.Surface.write(surface),
            (this.origin ? 'Update surface' : 'Save stage as surface') + ' via show-repo');
          this.$refs.saveDlg?.close();
          this.saveName = this.saveDesc = this.saveDest = '';
          // The shelf is the history, so it has to show the new entry without
          // a reload for the append to read as one.
          window.dispatchEvent(new CustomEvent('web-tools:surfaces-changed'));
          const note = skipped.length ? ' (' + skipped.length + ' left out)' : '';
          toast('push-pin', 'Saved ' + surface.manifest.name + note, 'alert-success', 3000);
        } catch (e) {
          toast('warning', 'Save failed: ' + (e.message || e), 'alert-error', 6000);
        }
        this.savingStage = false;
      }
    };
  });
});
