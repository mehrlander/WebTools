// alpineComponents/crumb-bar.js — a crumb trail sized for a nav bar.
//
// The repo already renders crumbs in four places (the explorer's folder path,
// path-picker's panel header, repo-atlas, repo-drag), each bespoke. This is the
// one meant to live in CHROME rather than inside a panel, so it differs from
// path-picker's row in exactly one way that matters: every crumb is a 44 px
// target. path-picker's crumbs are btn-xs because they sit in an already-open
// panel where the pointer has committed; a crumb in a header bar is a cold
// target on a phone and has to meet the floor. Everything else follows that
// component's idiom: shrink-0 buttons, thin separators, per-crumb truncation,
// and a row that scrolls sideways rather than wrapping or clipping.
//
// A crumb is data, so the host owns what the trail means:
//   { key, label?, icon?, title?, mono?, menu?, action? }
//     key     stable x-for key
//     label   the text; omit for an icon-only crumb (the leading home)
//     icon    Phosphor class, drawn before the label
//     title   tooltip; falls back to label. Use it to carry what the crumb
//             elides, e.g. the owner prefix a short repo name drops
//     mono    render the label monospace (paths, repo names)
//     menu    draw a caret: this crumb opens a menu rather than navigating
//     action  tap handler
//
// Usage (items is a function, re-read on every render, so the trail can be
// derived from live state):
//   <nav x-data="crumbBar({ items: () => window.__shell.sidebarCrumbs })"></nav>
//
// The LAST crumb is the one allowed to shrink, so a long trail truncates the
// name you are standing on rather than pushing the route back off-screen. That
// is the opposite of clipping from the right, which is what a plain flex row
// does and what would hide the menu caret exactly when it is wanted.

document.addEventListener('alpine:init', function () {
  Alpine.data('crumbBar', function (opts) {
    const cfg = opts || {};
    return {
      description: 'Crumb trail for a header bar: 44 px targets, per-crumb truncation, sideways scroll, optional menu caret on a crumb',

      template: `
        <nav aria-label="Breadcrumb"
             class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <template x-for="(c, i) in list" :key="c.key">
            <div class="flex items-center gap-0.5 min-w-0"
                 :class="i === list.length - 1 ? 'shrink min-w-0' : 'shrink-0'">
              <i x-show="i > 0" class="ph ph-caret-right shrink-0 text-sm text-base-content/25"></i>
              <button type="button" @click="c.action && c.action()"
                      :title="c.title || c.label || ''"
                      :aria-current="i === list.length - 1 ? 'page' : false"
                      class="flex h-11 min-w-0 items-center gap-1 rounded-lg px-2 transition-colors hover:bg-base-200 active:bg-base-300"
                      :class="!c.action && 'pointer-events-none'">
                <i x-show="c.icon" class="ph shrink-0 text-xl leading-none" :class="c.icon"></i>
                <span x-show="c.label" class="min-w-0 truncate text-base"
                      :class="c.mono && 'font-mono'" x-text="c.label"></span>
                <i x-show="c.menu" class="ph ph-caret-down shrink-0 text-sm text-base-content/40"></i>
              </button>
            </div>
          </template>
        </nav>`,

      // Re-read through a getter rather than caching at init: the trail is
      // derived from whatever the host is showing, which changes under it.
      get list() {
        const src = cfg.items;
        const out = (typeof src === 'function' ? src() : src) || [];
        return Array.isArray(out) ? out : [];
      },

      init() {
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
      },
    };
  });
});
