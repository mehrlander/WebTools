// alpineComponents/repo-menu.js — the actions for one repo.
//
// Reads window.__shell.menuRepo, so the host only has to say which repo the
// menu is about and where to put it. In show-repo it hangs off a Repos row's
// trailing button as an anchored dropdown.
//
// It is deliberately FLAT. An earlier version gave Files and Branches chevrons
// that expanded into the repo's folders and its branch list; both are gone.
// They answered "what is inside that repo", which is a browsing question the
// sidebar and the Files view already answer once you are in the repo, and a
// row's menu is not the place to start browsing from. What is left is the set
// of things you do TO a repo rather than inside one, so no row expands and no
// row carries a chevron. The one row that leaves the app carries an out-arrow.

document.addEventListener('alpine:init', function () {
  Alpine.data('repoMenu', function () {
    return {
      description: 'Flat action menu for one repo (window.__shell.menuRepo): open, config, GitHub, the -private companion, copy link',

      template: `
        <div class="flex flex-col py-1">
          <template x-for="item in items" :key="item.key">
            <button @click="run(item.key)"
                    class="w-full min-h-11 flex items-center gap-3 rounded-lg px-3 text-left text-base transition-colors hover:bg-base-200 active:bg-base-300">
              <i class="ph shrink-0 text-xl text-base-content/50" :class="item.icon"></i>
              <span class="min-w-0 flex-1 truncate" x-text="item.label"></span>
              <i x-show="item.external" class="ph ph-arrow-square-out shrink-0 text-base-content/30"></i>
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
