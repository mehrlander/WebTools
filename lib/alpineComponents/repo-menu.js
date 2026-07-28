// alpineComponents/repo-menu.js — one repo's menu, whichever of the two it is.
//
// Reads window.__shell.repoMenuItems, so the host owns which repo the menu is
// about, which list it is showing (menuKind: the repo's actions, or its GitHub
// destinations), and where to put it. In show-repo one instance serves both
// lists: the Repos row's marker button, the github button beside it, and the
// Activity view's repo chip all fill this same panel.
//
// It is deliberately FLAT and SHORT. An earlier version gave Files and Branches
// chevrons that expanded into the repo's folders and its branch list; both are
// gone, since "what is inside" is a browsing question the sidebar and the Files
// view already answer once you are in the repo. An "Open" row went too: tapping
// the row itself is what opens the repo, so the menu was offering the thing the
// user had just declined to do. What is left is the set of things you do TO a
// repo rather than inside one. No row expands, so no row carries a chevron; a
// row that leaves the app carries an out-arrow.

document.addEventListener('alpine:init', function () {
  Alpine.data('repoMenu', function () {
    return {
      description: 'Flat, compact menu for one repo (window.__shell.menuRepo/menuKind): its actions, or its GitHub destinations',

      // Dense on purpose: below the 44 px floor, which is for a COLD target in
      // chrome, where these rows sit inside a panel the pointer has already
      // aimed at and opened. The same reasoning lets path-picker run its option
      // rows and crumbs below full size. .wt-menu-row (show-repo's <style>)
      // carries the height, 26 px for a fine pointer and 32 px for a thumb, so
      // this panel and the Activity view's branch menu stay one size.
      // A HEAD ROW (item.head) opens a section and is itself the section's
      // destination: the mark of WHERE plus the name of WHAT, over the places
      // inside it. It replaced an inert uppercase label, which cost a row and
      // then needed a second row underneath to say the obvious thing ("Open
      // repo", "Repository"). One row now does both, and the two sections read
      // as the same name under two marks rather than as two vocabularies.
      // A rule sits above every head row but the first, so the sections are
      // separated without a label to read.
      //
      // The rows UNDER a head row are indented, so the two sections read as
      // structure rather than as a flat list with two odd entries in it. The
      // indent puts a sub-row's glyph under its head row's label, the usual
      // nesting alignment.
      //
      // item.mark: 'app' draws the app's own mark INLINE rather than as an
      // <img>, and that is the point: an <img> cannot take currentColor, so a
      // file would sit there in brand blue beside a column of muted glyphs and
      // stay blue on hover. Drawn inline with stroke:currentColor it behaves
      // like every Phosphor glyph in the panel, including going primary with
      // the row. It is an OUTLINE rendition of lib/favicon.svg (the filled
      // original): the same hexagon, bore and centre slot, with the slot
      // widened so the two halves still read as < > at 16 px. Change one and
      // look at the other. No backticks in here: this markup is a JS template
      // literal, and one would end it mid-component.
      template: `
        <div class="flex flex-col p-0.5">
          <template x-for="(item, i) in items" :key="item.key">
            <div>
              <div x-show="item.head && i" class="mx-1.5 my-1 border-t border-base-200"></div>
              <button @click="run(item.key)" :title="item.title || ''"
                      class="wt-menu-row w-full flex items-center gap-1.5 rounded pr-1.5 text-left transition-colors hover:bg-base-200 active:bg-base-300"
                      :class="item.head || item.strong ? 'pl-1.5' : 'pl-6'">
                <template x-if="item.mark === 'app'">
                  <svg viewBox="4.5 4.5 23 23" fill="none" stroke="currentColor" aria-hidden="true"
                       stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"
                       class="w-4 h-4 shrink-0 text-base-content/70">
                    <path d="M10.5 6.474 L14 6.474 L14 11.969 A4.5 4.5 0 0 0 14 20.031 L14 25.526 L10.5 25.526 L5 16 Z"/>
                    <path d="M21.5 6.474 L18 6.474 L18 11.969 A4.5 4.5 0 0 1 18 20.031 L18 25.526 L21.5 25.526 L27 16 Z"/>
                  </svg>
                </template>
                <template x-if="item.mark !== 'app'">
                  <i class="ph shrink-0 text-sm"
                     :class="[item.icon, item.head ? 'text-base-content/70' : 'text-base-content/50']"></i>
                </template>
                <span class="min-w-0 flex-1 truncate"
                      :class="item.head ? 'font-mono font-semibold' : (item.strong && 'font-semibold')"
                      x-text="item.label"></span>
                <i x-show="item.external && !allExternal" class="ph ph-arrow-square-out shrink-0 text-xs text-base-content/30"></i>
              </button>
            </div>
          </template>
        </div>`,

      get items() { return window.__shell?.repoMenuItems || []; },

      // The out-arrow marks the odd row out, so a list where EVERY row leaves
      // the app (the GitHub one) drops the column rather than repeating itself
      // seven times: the github-logo that opened it already said so, and the
      // width goes back to the labels. A grouped list keeps the arrows, since
      // there the in-app rows are exactly what the arrow distinguishes.
      get allExternal() { const it = this.items; return it.length > 0 && it.every(i => i.external); },

      run(key) {
        window.__shell?.runRepoMenu(key);
        this.$dispatch('repo-menu-done');
      },

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
      },
    };
  });
});
