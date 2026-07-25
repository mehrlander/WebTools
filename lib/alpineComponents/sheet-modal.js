// alpineComponents/sheet-modal.js — one overlay, two presentations.
//
//   < 640px  : iOS-style bottom sheet. Pointer drag with snap points,
//              velocity flick-to-dismiss, rubber-band past the top. JS owns
//              the panel's translateY.
//   >= 640px : centered modal. Gestures don't bind; it fades + scales in, and
//              the scrim / Esc close it.
//
// The breakpoint is watched live, so dragging the window across 640px
// re-presents the open overlay in place.
//
// The component renders its own chrome (scrim + panel + header) and slots the
// host's markup into a scrollable body. Just drop bare content inside — no
// wrapper element needed. Slot bindings resolve against this component's scope
// (and chain up to the page), so they can read isDesktop / shown and call
// open() / close(). (init() preserves the original slot nodes rather than
// rebuilding them from a string; see the note there for why that matters.)
//
// Usage:
//   <div x-data="sheetModal({ title: 'Editor', openOn: 'open-editor' })">
//     ...body markup (yours)...
//   </div>
//   <button @click="$dispatch('open-editor')">Edit…</button>
//
// Or drive it from in-scope markup via open() / close(). Options:
//   title    : header text                                  (default '')
//   openOn   : window event name that opens it              (optional)
//   snaps    : mobile snap heights, fractions of viewport   (default [0.5, 0.92])
//   maxWidth : desktop width class                          (default 'max-w-lg')

(function () {
  if (!document.getElementById('sheet-modal-css')) {
    const s = document.createElement('style');
    s.id = 'sheet-modal-css';
    // Mobile: JS drives transform; .animate eases the snap/dismiss tween.
    // Desktop opacity/scale ride Tailwind transition utilities (see template).
    s.textContent =
      '.sheet-modal-panel.as-sheet{touch-action:none}' +
      '.sheet-modal-panel.as-sheet.animate{transition:transform .35s cubic-bezier(.32,.72,0,1)}';
    document.head.appendChild(s);
  }

  document.addEventListener('alpine:init', function () {
    Alpine.data('sheetModal', function (opts) {
      opts = opts || {};

      return {
        description: 'Bottom sheet under 640px, centered modal at or above it; one API for both',

        title: opts.title || '',
        openOn: opts.openOn || '',
        maxWidth: opts.maxWidth || 'max-w-lg',
        snaps: opts.snaps || [0.5, 0.92],   // mobile snap heights (viewport fractions)

        shown: false,
        isDesktop: false,
        snapIdx: 0,
        dragging: false,
        startY: 0, startTrans: 0, lastY: 0, lastT: 0, velocity: 0,

        shell() {
          return `
            <div class="sheet-modal-scrim fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 transition-opacity duration-300"
                 :class="shown ? 'opacity-100' : 'opacity-0 pointer-events-none'"
                 @click="close()"></div>

            <div x-ref="panel" role="dialog" aria-modal="true"
                 class="sheet-modal-panel fixed z-50 bg-base-100 shadow-2xl flex flex-col will-change-transform"
                 :class="isDesktop
                   ? 'as-card top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-base-300 w-[92%] ${this.maxWidth} h-fit max-h-[85vh] transition duration-200 ease-out ' + (shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none')
                   : 'as-sheet inset-x-0 bottom-0 rounded-t-2xl h-[99dvh]'"
                 style="transform: translateY(100%)"
                 @keydown.escape.window="shown && close()"
                 @pointerdown="grab($event)" @pointermove="move($event)"
                 @pointerup="release($event)" @pointercancel="release($event)">

              <div class="shrink-0 relative flex items-center justify-center px-4 pt-4 pb-3 border-b border-base-200"
                   :class="!isDesktop && 'cursor-grab active:cursor-grabbing'">
                <span x-show="!isDesktop" class="absolute top-2 left-1/2 -translate-x-1/2 h-1 w-9 rounded-full bg-base-content/20"></span>
                <h2 class="font-bold text-lg" x-text="title"></h2>
                <button class="absolute right-3 top-1/2 -translate-y-1/2 btn btn-circle btn-ghost"
                        aria-label="Close" @pointerdown.stop @click="close()">
                  <i class="ph-bold ph-x text-lg"></i>
                </button>
              </div>

              <div data-sheet-body class="flex-1 overflow-y-auto" style="touch-action: pan-y"></div>
            </div>`;
        },

        init() {
          // Slotting without a custom element / shadow DOM. The host's children
          // are the slot content; Alpine has already queued their effects by the
          // time init() runs, so we must PRESERVE those nodes, not rebuild them
          // from a string — rebuilding orphans the queued effects and they throw
          // (e.g. "isDesktop is not defined") when they flush detached.
          //
          // So: lift the existing children into a fresh body element (a move,
          // which keeps node identity + queued effects), assemble the chrome
          // around them synchronously, reattach, then initTree the new chrome.
          // initTree skips already-initialized nodes, so the slot isn't
          // double-bound. Net: the caller just drops bare markup inside — no
          // <template>, no wrapper — and it can read isDesktop / shown / close().
          const slot = document.createDocumentFragment();
          while (this.$el.firstChild) slot.appendChild(this.$el.firstChild);

          const chrome = document.createElement('div');
          chrome.innerHTML = this.shell();
          chrome.querySelector('[data-sheet-body]').appendChild(slot);

          while (chrome.firstChild) this.$el.appendChild(chrome.firstChild);
          this.$nextTick(() => Alpine.initTree(this.$el));

          const mq = window.matchMedia('(min-width: 640px)');
          const apply = matches => {
            this.isDesktop = matches;
            const el = this.$refs.panel;
            if (!el) return;
            if (matches) el.style.transform = '';            // desktop centers via CSS
            else if (this.shown) this.snapTo(this.snapIdx);  // re-present as a sheet
            else el.style.transform = 'translateY(100%)';    // park offscreen
          };
          this.$nextTick(() => apply(mq.matches));           // after $refs.panel exists
          mq.addEventListener('change', e => apply(e.matches));

          if (this.openOn) window.addEventListener(this.openOn, () => this.open());
        },

        open() {
          this.shown = true;
          if (this.isDesktop) return;     // CSS handles the desktop entrance
          this.snapIdx = 0;
          this.snapTo(0);
        },
        close() {
          this.shown = false;
          if (this.isDesktop) return;     // CSS handles the desktop exit
          this.animate(this.h());
        },

        // --- mobile sheet mechanics (no-ops on desktop) -------------------
        h() { return window.innerHeight },
        posFor(frac) { return this.h() * (1 - frac) },   // translateY from top
        snapTo(idx) { this.snapIdx = idx; this.animate(this.posFor(this.snaps[idx])); },

        animate(y) {
          const el = this.$refs.panel;
          el.classList.add('animate');
          el.style.transform = `translateY(${y}px)`;
        },
        current() {
          const m = this.$refs.panel.style.transform.match(/-?[\d.]+/);
          return m ? +m[0] : this.h();
        },

        grab(e) {
          if (this.isDesktop) return;
          if (e.target.closest('[data-sheet-body]')) return;   // let content scroll
          this.dragging = true;
          this.$refs.panel.classList.remove('animate');
          this.$refs.panel.setPointerCapture(e.pointerId);
          this.startY = e.clientY;
          this.startTrans = this.current();
          this.lastY = e.clientY;
          this.lastT = performance.now();
        },
        move(e) {
          if (!this.dragging) return;
          let y = this.startTrans + (e.clientY - this.startY);
          const top = this.posFor(this.snaps[this.snaps.length - 1]);
          if (y < top) y = top + (y - top) * 0.25;   // rubber-band past the top
          this.$refs.panel.style.transform = `translateY(${y}px)`;
          const now = performance.now();
          this.velocity = (e.clientY - this.lastY) / (now - this.lastT || 1);
          this.lastY = e.clientY; this.lastT = now;
        },
        release() {
          if (!this.dragging) return;
          this.dragging = false;
          const y = this.current();

          // a fast flick wins outright
          if (this.velocity > 0.9) return this.close();
          if (this.velocity < -0.9) return this.snapTo(this.snaps.length - 1);

          // otherwise settle to the nearest target; below the lowest snap dismisses
          const targets = [this.h(), ...this.snaps.map(s => this.posFor(s))];
          const nearest = targets.reduce((a, b) => Math.abs(b - y) < Math.abs(a - y) ? b : a);
          if (nearest === this.h()) return this.close();
          this.snapIdx = Math.max(0, this.snaps.findIndex(s => this.posFor(s) === nearest));
          this.animate(nearest);
        }
      };
    });
  });
})();
