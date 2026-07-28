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
      // carries the height, 30 px for a fine pointer and 36 px for a thumb, so
      // this panel and the Activity view's branch menu stay one size.
      template: `
        <div class="flex flex-col p-0.5">
          <template x-for="item in items" :key="item.key">
            <button @click="run(item.key)"
                    class="wt-menu-row w-full flex items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-base-200 active:bg-base-300">
              <i class="ph shrink-0 text-base text-base-content/50" :class="item.icon"></i>
              <span class="min-w-0 flex-1 truncate" x-text="item.label"></span>
              <i x-show="item.external" class="ph ph-arrow-square-out shrink-0 text-xs text-base-content/30"></i>
            </button>
          </template>
        </div>`,

      get items() { return window.__shell?.repoMenuItems || []; },

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
