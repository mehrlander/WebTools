// alpineComponents/repo-menu.js — the actions for one repo.
//
// Reads window.__shell.menuRepo, so the host only has to say which repo the
// menu is about and where to put it. In show-repo it hangs off a Repos row's
// trailing button as an anchored dropdown.
//
// It is deliberately FLAT and SHORT. An earlier version gave Files and Branches
// chevrons that expanded into the repo's folders and its branch list; both are
// gone, since "what is inside" is a browsing question the sidebar and the Files
// view already answer once you are in the repo. An "Open" row went too: tapping
// the row itself is what opens the repo, so the menu was offering the thing the
// user had just declined to do. What is left is the set of things you do TO a
// repo rather than inside one. No row expands, so no row carries a chevron; the
// one row that leaves the app carries an out-arrow.

document.addEventListener('alpine:init', function () {
  Alpine.data('repoMenu', function () {
    return {
      description: 'Flat, compact action menu for one repo (window.__shell.menuRepo): config, GitHub, the -private companion, copy link',

      // Dense on purpose: 36 px rows, not the 44 px floor. That floor is for a
      // COLD target in chrome; these rows sit inside a panel the pointer has
      // already aimed at and opened, the same reasoning that lets path-picker
      // run its option rows and crumbs below full size.
      template: `
        <div class="flex flex-col p-1">
          <template x-for="item in items" :key="item.key">
            <button @click="run(item.key)"
                    class="w-full min-h-9 flex items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-base-200 active:bg-base-300">
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
