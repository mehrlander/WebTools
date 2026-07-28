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
      // item.img carries a real image (the app's own mark, which is an SVG
      // file rather than a glyph) in place of item.icon. x-if rather than
      // x-show, since a bound :src on a hidden <img> still resolves and fetches
      // "undefined".
      template: `
        <div class="flex flex-col p-0.5">
          <template x-for="(item, i) in items" :key="item.key">
            <div>
              <div x-show="item.head && i" class="mx-1.5 my-1 border-t border-base-200"></div>
              <button @click="run(item.key)" :title="item.title || ''"
                      class="wt-menu-row w-full flex items-center gap-1.5 rounded px-1.5 text-left transition-colors hover:bg-base-200 active:bg-base-300">
                <template x-if="item.img">
                  <img :src="item.img" alt="" class="w-4 h-4 shrink-0">
                </template>
                <template x-if="!item.img">
                  <i class="ph shrink-0 text-sm"
                     :class="[item.icon, item.head ? 'text-base-content/70' : 'text-base-content/50']"></i>
                </template>
                <span class="min-w-0 flex-1 truncate"
                      :class="item.head && 'font-mono font-semibold'" x-text="item.label"></span>
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
