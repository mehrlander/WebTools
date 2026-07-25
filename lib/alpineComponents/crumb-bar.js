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
// HEIGHT is the tap target and stays at 44 px; WIDTH is the scarce thing on a
// phone, so the horizontal padding, the gaps around the separator, and the
// caret are all pulled in tight. A crumb trail reads as one path, and air
// between its parts works against that as well as against the width.
//
// A crumb is data, so the host owns what the trail means:
//   { key, label?, icon?, img?, title?, mono?, menu?, action? }
//     key     stable x-for key
//     label   the text; omit for an icon-only crumb (the leading home)
//     icon    Phosphor class, drawn before the label
//     img     image src, drawn instead of an icon (a product mark, say). Muted
//             to grayscale at rest and restored on hover, so it reads as a
//             control in a row of controls rather than as branding
//     title   tooltip; falls back to label. Use it to carry what the crumb
//             elides, e.g. the owner prefix a short repo name drops
//     mono    render the label monospace (paths, repo names)
//     menu    draw a caret: this crumb opens a menu rather than navigating
//     action  tap handler
//
// Whether that menu is OPEN is state this component OWNS, not an item field and
// not something it reads back off the host. Two earlier attempts failed the same
// way: a flag on the item went stale (the host mints fresh items on every read,
// and the x-for effect does not re-run for a plain host property), and reading
// the host through `window.__shell` inside the caret's own binding was not
// tracked either, since that handle is the raw object rather than Alpine's
// proxy. So the caret binds `open`, which is local and therefore reactive, and
// the host hears about the change through the action callback.
//
// Usage (items is a function, re-read on every render, so the trail can be
// derived from live state):
//   <nav x-data="crumbBar({ items: () => window.__shell.sidebarCrumbs })"></nav>
//
// A `menu` crumb's action receives the new open state. The instance publishes
// itself as `$root.__crumbBar` (the repo.js / path-picker pattern), so a host
// that closes the menu some other way (a tap outside, an action taken) can put
// the caret back down with `__crumbBar.setOpen(false)`.
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
             class="flex min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <!-- Keyed on content, not just the slot name: the host mints new item
               objects on every read, so a row keyed only by its slot ('repo')
               can keep a stale label when the trail changes underneath it. -->
          <template x-for="(c, i) in list" :key="c.key + '|' + (c.label || '')">
            <div class="flex items-center min-w-0"
                 :class="i === list.length - 1 ? 'shrink min-w-0' : 'shrink-0'">
              <i x-show="i > 0" class="ph ph-caret-right shrink-0 text-xs text-base-content/25"></i>
              <button type="button" @click="tap(c)"
                      :title="c.title || c.label || ''"
                      :aria-current="i === list.length - 1 ? 'page' : false"
                      class="group/crumb flex h-11 min-w-0 items-center gap-0.5 rounded-lg px-1.5 transition-colors hover:bg-base-200 active:bg-base-300"
                      :class="!c.action && 'pointer-events-none'">
                <i x-show="c.icon" class="ph shrink-0 text-xl leading-none" :class="c.icon"></i>
                <img x-show="c.img" :src="c.img" :alt="c.title || ''" width="20" height="20"
                     class="h-5 w-5 shrink-0 opacity-60 transition group-hover/crumb:opacity-100"
                     style="filter:grayscale(1)"
                     @mouseenter="$el.style.filter = ''" @mouseleave="$el.style.filter = 'grayscale(1)'">
                <span x-show="c.label" class="min-w-0 truncate text-base"
                      :class="c.mono && 'font-mono'" x-text="c.label"></span>
                <!-- Two glyphs, not one rotated. A rotate-180 that only ever
                     arrives by toggling a class is never generated: Tailwind's
                     browser build picks up classes present in the DOM, and an
                     attribute flip on an existing node does not bring a new
                     utility into being. Both carets ship in the markup from the
                     start, so x-show alone does the work. -->
                <i x-show="c.menu && !open" class="ph ph-caret-down -mr-0.5 shrink-0 text-xs text-base-content/40"></i>
                <i x-show="c.menu && open" class="ph ph-caret-up -mr-0.5 shrink-0 text-xs text-base-content/60"></i>
              </button>
            </div>
          </template>
        </nav>`,

      // Local, so the caret's binding is tracked. Tapping any non-menu crumb
      // closes it: that tap has navigated away from what the menu was listing.
      open: false,
      setOpen(v) { this.open = !!v; },
      tap(c) {
        const next = c.menu ? !this.open : false;
        this.open = next;
        if (c.action) c.action(next);
      },

      // Re-read through a getter rather than caching at init: the trail is
      // derived from whatever the host is showing, which changes under it.
      get list() {
        const src = cfg.items;
        const out = (typeof src === 'function' ? src() : src) || [];
        return Array.isArray(out) ? out : [];
      },

      init() {
        this.$root.__crumbBar = this;
        this.$el.innerHTML = this.template;
        this.$nextTick(() => Alpine.initTree(this.$el));
      },
    };
  });
});
