// Review asks carried to the stage alongside a page's fileset. The stage's
// Diff lens already renders a fixed panel of general asks; these are the ones
// specific to taking a page somewhere else for a second opinion, so they ride
// the link as its &prompts= commentary rather than living in the stage.
const BRIEF_PROMPTS = [
  { label: 'Reinterpret', ask: 'This is a working page plus the modules it loads. Propose a different concept for it: a reinterpretation, not a refactor. What is this page really for, and what would a better answer to that look like?' },
  { label: 'Focus one piece', ask: 'Pick the single weakest part of this page and go deep on just that. Ignore everything else. Say what is wrong and show a concrete alternative.' },
  { label: 'Fresh eyes', ask: 'You have never seen this codebase. Read this page and tell me what confused you, in the order it confused you.' },
  { label: 'Cut it down', ask: 'What could be removed from this page without losing anything a user relies on? Be specific and name the lines.' },
];

// Registered at once when Alpine is already running (gh-boot loads this file
// after a page's own chain since 2026-09-02, so Alpine may have started), and
// on alpine:init otherwise. A component registered late is fine: gh-boot
// mounts the launcher with initTree after the registration lands.
const registerFab = function() {
  Alpine.data('fab', function() {
    return {
      description: 'Draggable floating button that doubles as a view-mode indicator: its launcher shows the neutral sidebar mark whenever the view sits at the default branch and a warning-tinted disc only when it is rendered off it (a toss, or a ?use= lib pin, at some other ref — a toss at main is main, so it reads neutral); off the default branch the drawer\'s ref bar goes warning-tinted and grows a button (labeled with the default branch, "main") that returns to the live deployed page, or, where the repo serves no Pages and no such page exists, re-addresses this same view at that branch. Opens a right-side drawer with four tabs, under a one-line READOUT strip carried on all but Notes (what this page load cost, how many calls browsing has added, what is left of the rate limit) which is also the way the Traffic tab is found. Above the tabs, not inside one, sits the LAYER strip naming the frame stack this view arrived through (a toss is renderer over page, the app view is app over renderer over page, a nested toss four), one row each, outermost first, the selected one ringed and every row carrying its own off-ref mark so a layer on branch code cannot hide behind a neutral launcher two levels up: the layer is the drawer\'s subject and every tab is a lens on it, so picking a row re-points the whole drawer and a lone page renders as a one-line label rather than vanishing, which would leave Inspect and Traffic with nothing naming what they describe. It is derived by walking the live frames each time the drawer opens rather than from a remembered announcement (so a frame that goes away needs no clear), and a cross-origin layer is listed as sealed rather than omitted. Render (the default) leads with a ref bar naming the ref this view is rendered at, which opens a dropdown of the branches carrying a different version of this page (blob-compare against the default branch); one tap renders there, outside a toss by navigating to toss-render (the one renderer, no bespoke overlay), inside one by re-addressing in place via __tossNavigate. Under it a WIDTH bar answers the sibling question, what shape the view is rendered at: Actual / Phone 390 / Tablet 820 / Desktop 1280, each resolving to a frame of that width, since a frame is the only thing in a browser that honestly IS a viewport (media queries and a boot-time innerWidth read both see it, and pointer/hover are the part no width can fake, which the bar says rather than leaves to be discovered). Inside a toss it moves the frame in place through the shell\'s window.__tossWidth; outside one it navigates to toss-render carrying ?w=, the same trip the ref rows make, which is also what makes it trustworthy, since the page boots fresh at the target width. It tints itself warning off actual rather than borrowing the launcher\'s mark, which is reserved for the off-ref state a viewer cannot otherwise see. Sharing that row, past a hairline, are the page\'s own `toggles`, the state counterpart to `actions`: a page declares { key, label, icon, on, title, set } and each becomes one on/off control beside the presets, since which ref, what width, and whatever else a page is presented at are one question. The presets go icon-only under a single Width label so the row holds one line at a phone\'s drawer width, and nothing on it explains itself in prose. show-repo contributes HEADER there, which is the way to an unframed view and the way back from one; the sidebar is deliberately not offered, having two owners already (the header\'s hamburger, and ?shell= in the address). Above it the repo/path block carries two controls: the PATH is a picker (alpineComponents/path-picker, trigger-less, rooted at this repo and ref) so any file in the repo can be chosen and rendered from the drawer, and the github mark is a MENU (this file, its commits, then the repo rows lib/kits/github-links.js gives the sidebar). The ref bar sits under that block rather than above it. The body of the tab is the branch\'s GUIDE, its PR body rendered as markdown, with the links inside re-aimed at what can show them (a blob link to a page becomes a toss of that page, one to markdown or data becomes a data-view read) and lifted into a chip strip deduped by file; arrows step through every PR the branch has had, newest first, since a merge ends a PR but not the branch. With no PR the pane reports the ref\'s standing instead (the commit it is at, the PR that code came from, how long ago) and the file\'s own last change on that ref, which is where the version chip went; the guide reads with one REST call on open and never waits on the branch scan, which is the dropdown\'s and runs when it opens. Inspect merges the page scripts (loaded via gh.load(), with per-entry status) and Alpine components (tap to outline in place) into one scroll; in a #gh= toss it scans the subject frame too, listing the tossed page first and badging the rows that belong to the shell; each script row carries what it cost, reading "inlined" for a module the pre-build served from its cache rather than a byte figure that would imply a fetch nobody made. Traffic answers the size question in three bands that do not share a unit: BOOT is what this one page load cost (Resource Timing, weight by role with a bar, then every resource, each marked network / cached / size-not-disclosed), API is what browsing has spent since (the fetch wrapper reading content-length, grouped by endpoint shape since a browser has no honest async caller context, with the rate limit remaining), and a collapsed STORAGE line reports what the origin keeps (Web Storage plus navigator.storage.estimate, which is quota-managed storage only: the HTTP cache is not counted there and shows up as the cached rows under Boot instead), opening itself only where there is mass to look at. Notes was a fifth tab and is not: the annotator\'s set is read in its own card now (kits/annotate.js), whose expander opens the list, either serialization and the actions on the set, so the drawer carries no second implementation of that view and no handshake to keep it in step. What survives here is STARTING the annotator, from the take grid and from the launcher menu. A LONG PRESS or right-click on the launcher opens a short menu with two built-in rows. "Take a note" turns the annotator on and stages a PAGE draft with the microphone off: an offer rather than a recorder that started itself, and the three aimed targets are still reached by the gesture that defines each one. Reading the set is the card\'s own job, one tap on its Notes header. "Home" leaves for the deployed app at the default branch, which is the one way out of a view that does not depend on the view: a fixed address rather than the ref bar\'s re-render of THIS page elsewhere, so it reaches the app from a toss, from a ?use= pin, and from a page that was never part of it. Under them sit the rows the page contributes through `menu`, the third opt-in contract beside `actions` and `toggles` and the one for a verb wanted BEFORE the drawer rather than inside it (show-repo contributes the HEADER row, the second owner of the Render tab\'s header switch and the one a reader finds without knowing which tab to open, which is what an app view needs since it opens with no header on screen); they are read at open time rather than from the drawer\'s scan, so the first long press of a page load is not an empty menu. Every row is one line carrying a label and an icon, since a menu raised by a held finger is read in the half-second before the finger lifts and has no room for prose. A tap still opens the drawer, and a drag still moves the launcher; a right-click raises the menu and does ONLY that, spending the gesture the way a fired long press does so the pointerup behind it cannot toggle the drawer as well. A take menu sits under the render tab in every context the drawer appears in, toss included, with six named outputs: a rendering copy (one pasteable HTML string carrying the page plus its own code and read() data inlined, for CodePen or any bare HTML preview), a review brief (sized before it is taken, and refused over a token cap rather than silently copying megabytes), a picked REGION (Peek armed on its Render reading: tap an element, step to the ancestor you mean, and copy it wrapped as a page that renders alone, with the theme and vendor tags carried and the framework attributes stripped, proved in a frame before the copy), a stage link, and the two zips. Inside a toss it aims at the subject rather than the shell. A header hard-refresh button reloads bypassing the browser cache, for Safari on iOS. Plus a collapsible console and a compact version chip. Singleton per viewport: toss-render stamps __fabHosted so a fab booting under it declines to mount (handing the rendered subject up via __tossSubject/__tossFrame for the shell fab to adopt), and a fab booting inside an iframe declines on its own (data-allow-framed opts back in) — the host page offers the bust-out instead',

      template: `
        <div :style="'transform:translate(' + x + 'px,' + y + 'px)'"
             @pointerdown="onDown($event)"
             @pointermove="onMove($event)"
             @pointerup="onUp($event)"
             @pointercancel="onUp($event)"
             @contextmenu.prevent="onContextMenu()"
             @touchstart="holdTouch($event)" @touchmove="holdTouch($event)"
             class="fixed bottom-6 right-6 group touch-none z-[80]">
          <!-- ABOVE the swipe deck's takeover (z-70), not under it. The fab is
               the app's control surface, and once the deck announces what it is
               showing (kits/file-deck.js, the subject channel) the drawer is
               describing exactly the file on screen: hidden behind the thing it
               describes, the coupling is there and unreachable. Raised from 55
               on 2026-08-14, found by opening the drawer over an open deck. -->
          <!-- Launcher. Its icon + color are the always-on mode indicator: the
               neutral sidebar mark whenever the view is at the default branch,
               a warning-tinted disc only when it is rendered off it (a toss or
               a ?use= lib pin at some OTHER ref). A toss at main is main, so it
               reads neutral. The old ?use= corner pill is retired in favor of
               this. -->
          <div tabindex="0" role="button" aria-label="Web-tools panel"
               class="size-14 rounded-2xl border flex items-center justify-center cursor-grab active:cursor-grabbing outline-none transition-all duration-300"
               :class="offRef
                 ? (open ? 'bg-warning/30 border-warning/50' : 'bg-warning/10 border-warning/20 hover:bg-warning/20 hover:border-warning/40')
                 : (open ? 'bg-primary/30 border-primary/50' : 'bg-primary/10 border-primary/20 hover:bg-primary/20 hover:border-primary/40')">
            <i class="text-2xl transition-colors"
               :class="[offRef ? 'ph ph-disc' : 'ph ph-sidebar-simple',
                        offRef ? (open ? 'text-warning' : 'text-warning/70')
                               : (open ? 'text-primary' : 'text-primary/40 group-hover:text-primary/70')]"></i>
          </div>

          <!-- The launcher's second gesture: a long press (or a right-click)
               opens a short menu, where a tap still opens the drawer. It exists
               because the thing a reader most often wants from the launcher is
               not the drawer at all but to WRITE SOMETHING DOWN, which
               otherwise costs a tap to open, a tab to find, and a button to
               start. That is the first built-in row, and it stays first.

               THE SECOND IS THE PASTE, and it is built in rather than
               contributed because a phone has no other intake gesture at all.
               show-repo contributed it through menu until 2026-08-22, which
               limited it to the one page that already had a Stage on screen and
               left it missing from every page where a paste is the only way to
               get something in. What it costs to be everywhere is a carrier
               (kits/stage-handoff.js): off the app the paste is parked in
               storage and the app picks it up at boot, since the stage is a
               store array held for one page load and the navigation that
               reaches the Stage is what would otherwise discard it.

               THE THIRD IS THE WAY OUT: "Home", which leaves for the
               deployed app at the default branch. The launcher is the one
               control floating over every view, including a toss of a branch
               page and a ?use= pin at some other ref, and from inside one of
               those there is otherwise no way back to the app itself that does
               not go through the address bar. It is a fixed address rather than
               a ref switch, which is what separates it from the Render tab's
               return-to-live button: that one re-addresses THIS view at the
               default branch, and this one leaves the view behind.

               EVERY ROW IS ONE LINE, AND NOTHING EXPLAINS ITSELF. "Take a note"
               carried a two-line hint under it until 2026-08-19, on the theory
               that its unusual part (the composer opens, the microphone does
               not) wanted saying. It does not belong here: a menu raised by a
               held finger is read in the half-second before the finger lifts,
               and a paragraph in that window is something to get past rather
               than something to read. The Render tab's toggle bar already keeps
               the same rule, and says so ("there is no hint"), so the
               contributed rows below take a label and an icon and nothing else.

               UNDER THEM, WHAT THE PAGE CONTRIBUTES: menu, the third opt-in
               contract beside actions and toggles, and the one for a verb a
               reader wants BEFORE the drawer rather than inside it, reachable
               at the cost of one gesture on a control already floating over
               every view. No page fills it today, the paste having been
               promoted; it stays because the question it answers (a verb this
               page wants before the drawer) is a page's to answer, and the
               promotion is evidence of the contract working rather than of it
               being unnecessary: the row earned its way to every page by being
               built here first. Rows are read at open time (readPageMenu), not
               at scan time, because the drawer's own scan is detect() and a
               menu that had to wait for it would open empty.

               Its own pointer handlers are stopped: the wrapper is the drag
               surface, and without this a tap on the row would also toggle the
               drawer under it. -->
          <div x-show="fabMenu" x-cloak x-transition.opacity.duration.120ms
               @pointerdown.stop @pointerup.stop @pointermove.stop
               @click.outside="closeFabMenu()"
               class="absolute bottom-full right-0 mb-2 w-56 rounded-box border border-base-300 bg-base-100 shadow-2xl overflow-hidden">
            <!-- ONE ROW WHERE THERE WERE FOUR. The card's aim menu still has
                 four rows, each with a hint under it; this one has the four
                 aims as icon buttons beside the verb they share, since the
                 word "Note" repeated four times was the redundancy and the
                 aim is the only thing that changes between them. Each icon
                 button carries its aim as an aria-label rather than visible
                 text, since a phone-width row has no space for four labels
                 beside the verb; runMenuRow and the test file both read that
                 attribute where a visible span held the words before.

                 THE SECTION AIM NAMES ITSELF, and it is the only conditional
                 one. Its label comes from the kind the page declared, carried
                 on the declaration by kits/md-doc.js and owned by
                 docs/routes-kinds.csv, so a page with no markdown render offers
                 no button at all and the next kind to declare gets its own name
                 here without this file learning it. -->
            <div class="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-base-200">
              <i class="ph ph-note-pencil text-[17px] text-primary"></i>
              <span class="text-sm font-semibold">Note</span>
              <div class="ml-auto flex gap-1">
                <button @click="fabMenu = false; annAim('page')" aria-label="Note the page"
                        class="btn btn-ghost btn-sm btn-square" title="the page">
                  <i class="ph ph-file text-[19px] text-primary"></i>
                </button>
                <button @click="fabMenu = false; annAim('pick')" aria-label="Note an element"
                        class="btn btn-ghost btn-sm btn-square" title="an element">
                  <i class="ph ph-crosshair-simple text-[19px] text-primary"></i>
                </button>
                <button x-show="annKind" @click="fabMenu = false; annAim('section')"
                        class="btn btn-ghost btn-sm btn-square"
                        :aria-label="'Note a ' + ((annKind &amp;&amp; annKind.aimLabel) || 'section').toLowerCase()"
                        :title="((annKind &amp;&amp; annKind.aimLabel) || 'section').toLowerCase()">
                  <i class="ph ph-text-align-left text-[19px] text-primary"></i>
                </button>
                <button @click="fabMenu = false; annAim('region')" aria-label="Note a region"
                        class="btn btn-ghost btn-sm btn-square" title="a region">
                  <i class="ph ph-frame-corners text-[19px] text-primary"></i>
                </button>
              </div>
            </div>
            <!-- Peek, moved in from the drawer's Take tab (Open group) since
                 it answers the same "before the drawer" question the aims
                 above do: what is this, pointed at rather than written down.
                 Annotate's own grid entry is gone with it, superseded by the
                 aim row above; openAnnotate() itself is still what annAim
                 calls to turn the annotator on. -->
            <button @click="fabMenu = false; openPeek()"
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-base-200 border-t border-base-200"
                    title="Point at anything to name it: selector, box, layout, subtree and the ancestors containing it.">
              <i class="ph ph-crosshair text-[17px] text-primary"></i>
              <span class="text-sm font-semibold">Peek</span>
            </button>
            <button @click="fabMenu = false; pasteToStage()"
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-base-200 border-t border-base-200"
                    title="Read the clipboard and stage what is on it">
              <i class="ph ph-clipboard-text text-[17px] text-primary"></i>
              <span class="text-sm font-semibold">To Stage</span>
            </button>
            <button @click="fabMenu = false; goHome()"
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-base-200 border-t border-base-200"
                    title="Leave for the deployed Web Tools app at the default branch">
              <i class="ph ph-house text-[17px] text-primary"></i>
              <span class="text-sm font-semibold">Home</span>
            </button>
            <template x-for="(m, i) in pageMenu" :key="m.label + ':' + i">
              <button @click="fabMenu = false; runMenuRow(m)"
                      class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-base-200 border-t border-base-200"
                      :title="m.title || ''">
                <i class="ph text-[17px] text-primary" :class="m.icon || 'ph-dot-outline'"></i>
                <span class="text-sm font-semibold" x-text="m.label"></span>
              </button>
            </template>
          </div>
        </div>

        <!-- Off-canvas drawer inside a viewport-clipping wrapper. When closed
             the panel is translated off-screen to the right; a FIXED off-canvas
             element is not clipped by body overflow, so on mobile it widens the
             layout viewport and the whole page zooms out (renders small). Making
             the panel an ABSOLUTE child of a fixed inset-0 overflow-hidden layer
             clips the off-screen part, so the layout stays at device width.

             Above the swipe deck's takeover (z-70) and below the launcher, the
             order it has always had relative to that. Raised from 50 on
             2026-08-14: once the deck announces its subject the drawer is
             describing the file on screen, and a drawer behind the thing it
             describes is a coupling nobody can reach. -->
        <div class="fixed inset-0 z-[75] overflow-hidden pointer-events-none">
        <div class="absolute inset-y-0 right-0 transition-transform duration-300 ease-out pointer-events-none"
             :class="open ? 'translate-x-0' : 'translate-x-full'"
             style="width: 22rem; max-width: 92vw;">
          <!-- overscroll-contain on the panel as well as on each pane inside
               it: a gesture that reaches the end of a scroll must not hand the
               rest to the document, because a document that scrolls at its top
               edge inside a sheet-presented in-app browser is the gesture that
               dismisses the sheet. That is a native gesture and a page cannot
               switch it off; keeping the scroll chain out of the document is
               the part a page can do. -->
          <!-- Built on the FIRST OPEN, not at mount (x-if on opened): the launcher is
               on every page, the drawer on few of them, and this body is 121 KB of
               template with ~330 bindings and a nested path picker. -->
          <template x-if="opened">
          <div class="h-full bg-base-100 border-l border-base-300 shadow-2xl flex flex-col pointer-events-auto overscroll-contain">
            <!-- WHICH LAYER, above the tabs rather than inside one of them.

                 A page reaches the screen through a stack of frames: a toss is
                 the renderer over the page, the app view is the app over both,
                 a nested toss is four. Every tab below is a LENS on one of
                 them, so the layer is the drawer's subject and the tabs are
                 readings of it. It shipped inside the Render tab first, which
                 read as though the layer were a Render setting and left Inspect
                 and Traffic with no statement of what they were inspecting.

                 THE PLACEMENT DECIDES THE ONE-ROW CASE, which is why it moved
                 rather than being copied. Inside a tab this was a control, so a
                 single row was a chooser that could not choose and was hidden.
                 Up here it is the subject line, so one row is a LABEL and is
                 always shown: a header that disappears on the ordinary case
                 makes the drawer jump between two shapes, and the tabs that are
                 not Render would lose the only thing naming their subject.

                 Short form on purpose. This band carries a filename and a role;
                 the Render tab's identity block below carries the repo and the
                 full path. Three bands above a phone's tab body is the budget,
                 so the label form is one line rather than a row of buttons.

                 SELECTION AND SEALED MUST NOT SHARE THE OPACITY CHANNEL.
                 The unselected rows were dimmed with a hover that restored
                 them, which is fine with a mouse and wrong on the device this
                 drawer is mostly read on: with no hover, every row you are not
                 on sits permanently at 60% and reads as disabled, which is the
                 same thing the genuinely sealed row says. Selection is carried
                 by the raised background and the ring; dimming is left to mean
                 one thing, that a row cannot be tapped.

                 :disabled TAKES !! AND THAT IS NOT DEFENSIVE STYLE. Alpine's
                 x-bind coerces an undefined result to '' whenever the
                 expression contains a dot, and '' is not one of the three
                 values bind() treats as absent, so a boolean attribute gets
                 SET. readLayers stamps a sealed flag only on a sealed row, so
                 L.sealed on every other row was undefined, became '', and
                 disabled the button: every row in the strip, the selected one
                 included, was unclickable from the day it shipped. The unit
                 tests call selectLayer on the component and so never touched a
                 button; fab-layer-strip.mjs drives the real one.

                 Each row keeps its own off-ref mark. The launcher is one glyph
                 and follows the selected layer, so without a mark per row a
                 layer sitting on branch code could hide behind a neutral button
                 two levels up. That mark still WINS the glyph slot, and what it
                 wins it from is now an identity rather than a placeholder: a
                 row at its default ref used to spend the slot on a 25%-opacity
                 circle carrying nothing, which left two rows reading app and
                 app.html with no way to tell which one was the app you are
                 standing in. See layerIcon. -->
            <div x-show="layers.length" class="shrink-0 border-b border-base-300 bg-base-200/50 px-1.5 py-1">
              <template x-if="layers.length > 1">
                <div class="flex items-stretch gap-0.5">
                  <template x-for="(L, i) in layers" :key="i">
                    <button @click="selectLayer(i)" :disabled="!!L.sealed" :title="layerTitle(L)"
                            class="min-w-0 flex-1 rounded px-1.5 py-0.5 text-left transition-colors"
                            :class="[i === layerIndex ? 'bg-base-100 shadow-sm ring-1 ring-primary/40'
                                                      : 'hover:bg-base-content/10',
                                     L.sealed ? 'opacity-50 cursor-not-allowed' : '']">
                      <span class="flex items-center gap-1">
                        <i class="ph shrink-0 text-[11px]" :class="layerIcon(L)"></i>
                        <span class="min-w-0 truncate font-mono text-[11px] font-semibold"
                              x-text="layerName(L)"></span>
                      </span>
                      <span class="block truncate text-[9px] uppercase tracking-wide text-base-content/40"
                            x-text="L.role"></span>
                    </button>
                  </template>
                </div>
              </template>
              <!-- One layer: a line, not a control. Same three facts in the
                   same order, so the eye lands in the same place either way. -->
              <template x-if="layers.length === 1">
                <div class="flex items-center gap-1.5 px-1 py-0.5">
                  <i class="ph shrink-0 text-[11px]" :class="layerIcon(layers[0])"></i>
                  <span class="min-w-0 truncate font-mono text-[11px] font-semibold"
                        x-text="layerName(layers[0])"></span>
                  <span class="shrink-0 text-[9px] uppercase tracking-wide text-base-content/40"
                        x-text="layers[0].role"></span>
                </div>
              </template>
            </div>

            <header class="px-2 py-1.5 border-b border-base-300 flex items-center justify-between gap-2 shrink-0">
              <!-- ONE LABEL, IN A FIXED SLOT, AND THE ICONS NEVER MOVE.
                   Five tabs of icon-plus-label do not fit a 22rem drawer on a
                   390px phone; measured, four already filled it edge to edge,
                   and the comment this replaces recorded the last time width
                   was bought (dropping Render's branch count, which had bought
                   room for Traffic's label after it hid below 400px). That
                   ratchet had one notch left and Text was the fifth tab.
                   Scrolling was the standing fallback and is the wrong answer:
                   a strip with no scroll affordance hides a whole tab behind a
                   gesture nobody performs, and the tab most likely to be hidden
                   is the newest, which is the one nobody knows to look for. The
                   overflow rule stays as a floor (a long theme font, a 320px
                   viewport) rather than as the plan.
                   The first fix put the label INSIDE the selected button, which
                   fits and is still wrong: the label grows in whichever button
                   is active, so every icon to its right shifts on every tap and
                   the strip reflows under the finger that just used it. A tab
                   strip is a spatial memory (the third icon is Traffic, always),
                   and one that rearranges itself cannot be one.
                   So the label sits in its own slot at the LEFT, at a fixed
                   width, naming whichever tab is selected. The icons after it
                   hold one set of coordinates for the life of the strip, no
                   matter which is active or how long its name is. Reading order
                   follows: what you are looking at, then what you could switch
                   to. The slot is sized to the longest label rather than to its
                   content, since a slot that resizes is the same bug moved one
                   element to the left.
                   The label is not a control and must not read as one: no
                   button styling, no hit target. It takes the selected icon's
                   colour, which is what ties the two together and is the whole
                   reason the icon keeps its pill.
                   Data-driven because a hand-written button per tab is how five
                   copies of one class string drift, and because the pane list
                   below now has to stay in step with exactly these keys. -->
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="shrink-0 text-[13px] font-semibold text-primary truncate"
                      style="width: 3.9rem" x-text="tabLabel"></span>
                <div class="flex items-center gap-0.5 min-w-0 overflow-x-auto" role="tablist">
                  <template x-for="t in TABS" :key="t.key">
                    <button @click="setTab(t.key)" :title="t.label" :aria-label="t.label"
                            :aria-selected="activeTab === t.key" role="tab"
                            class="flex items-center px-1.5 py-1 rounded transition-colors shrink-0"
                            :class="activeTab === t.key ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:bg-base-200'">
                      <i class="ph text-base" :class="t.icon"></i>
                    </button>
                  </template>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button x-show="activeTab === 'inspect'" @click="detect()" class="btn btn-ghost btn-xs btn-square" title="Rescan page" aria-label="Rescan">
                  <i class="ph ph-arrows-clockwise"></i>
                </button>
                <button x-show="activeTab === 'traffic'" @click="refreshTraffic()" class="btn btn-ghost btn-xs btn-square" title="Re-read the meters" aria-label="Re-read">
                  <i class="ph ph-arrows-clockwise"></i>
                </button>
                <button @click="hardRefresh()" class="btn btn-ghost btn-xs btn-square" title="Hard refresh: reload bypassing the browser cache" aria-label="Hard refresh">
                  <i class="ph ph-arrow-clockwise"></i>
                </button>
              </div>
            </header>


            <!-- ?use= asked for, boot block ignored it. Says so plainly: the
                 silent version of this sends you hunting for branch behavior
                 in default-branch code. -->
            <div x-show="ignoredUse" class="shrink-0 flex items-start gap-2 px-2.5 py-1.5 bg-error/10 border-b border-error/30 text-[13px]">
              <i class="ph ph-warning-octagon text-error shrink-0 mt-0.5"></i>
              <span class="min-w-0">
                <span class="font-semibold">?use=<span class="font-mono" x-text="ignoredUse"></span> ignored.</span>
                This page's boot block pins the ref itself, so you are running
                <span class="font-mono font-semibold" x-text="loaderRef"></span>.
              </span>
            </div>

            <!-- THE READOUT. What this page cost and what it has spent since,
                 on every tab, because a number you have to go looking for is a
                 number nobody looks at. It is also how the Traffic tab is
                 discovered: the strip is the button. Kept to one line and to
                 the three facts in the order they go wrong (load weight, calls
                 made, quota left), with the rest a tap away. -->
            <!-- Text is the one tab the readout sits out: the other three
                 describe the page LOAD, so the strip is context for all of
                 them, while Text is about the document's own content, where a
                 byte count is noise. Notes sat it out too until that tab moved
                 into the annotate card (kits/annotate.js). -->
            <button x-show="trafficLine && activeTab !== 'text'" @click="activeTab = 'traffic'; refreshTraffic()"
                    class="shrink-0 w-full flex items-center gap-1.5 px-2.5 py-1 border-b text-left transition-colors"
                    :class="trafficHot ? 'bg-warning/10 border-warning/30 hover:bg-warning/20' : 'bg-base-200/40 border-base-300 hover:bg-base-200'"
                    :title="'This load: ' + trafficLoadTitle">
              <i class="ph ph-arrows-down-up text-[13px] shrink-0"
                 :class="trafficHot ? 'text-warning' : 'text-base-content/40'"></i>
              <span class="font-mono text-[12px] tabular-nums truncate"
                    :class="trafficHot ? 'text-warning' : 'text-base-content/60'"
                    x-text="trafficLine"></span>
            </button>

            <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
              <!-- WHAT you are looking at: the repo, the path, and the ref,
                   in that order. Identity first, then the facet of it that can
                   be switched, which is why the ref bar sits under this block
                   rather than above it: a picker for a thing reads as a picker
                   only once the thing has been named.
                   The version chip that used to close this block is gone. It
                   read "@sha #332 2h ago", and that PR number is the one the
                   CODE came from, sitting two lines above a guide headed by the
                   PR the BRANCH is for: two different numbers, both labelled
                   with a hash, neither saying which question it answered. What
                   it knew is not lost, it moved to where it is the answer: the
                   guide pane shows it when the branch has no PR of its own,
                   which is exactly the case the default branch is always in. -->
              <div x-show="activeTab === 'render'" class="shrink-0">
                <div class="relative p-2" @click.outside="ghMenu = false">
                  <!-- REPO AND PATH ARE ONE CONTROL, and one picker behind it.
                       They were two: a repo link to GitHub above a path that
                       opened a tree rooted in that repo. But the thing being
                       chosen is a FILE SOMEWHERE, and splitting it left the
                       repo half inert and the path half unable to leave the
                       repo it was rooted in. Tapping either line now opens the
                       same tree, whose roots are every repo the token can see
                       with this one first, so crossing repositories is a scroll
                       rather than a different control.
                       The github mark stays beside it, because it answers a
                       different question: not "show me another file" but "show
                       me this one on GitHub", plus the repo surface (its
                       commits above all) that a bare blob link never reached.
                       Its rows come from lib/kits/github-links.js, the same list
                       show-repo\'s sidebar uses. -->
                  <div class="px-1 flex items-start gap-1.5">
                    <!-- .stop is load-bearing: path-picker closes itself on any
                         click outside its own root, and this trigger IS outside
                         it, so without stopping the click the panel opened and
                         shut inside one tap. That is exactly how it shipped and
                         read as a dead control. -->
                    <button @click.stop="subjectLocal || togglePicker()"
                            :title="subjectLocal ? 'This came off the clipboard, so there is no repo to browse'
                                    : repo ? 'Choose another file to render, from any repo' : 'No source detected'"
                            class="group/id flex min-w-0 flex-1 items-start gap-1.5 text-left"
                            :class="subjectLocal && 'cursor-default'">
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-mono text-sm font-bold group-hover/id:text-primary transition-colors"
                              x-text="repo || subjectLabel || 'Source unknown'"></span>
                        <!-- A local subject has no path to miss, so the line
                             that would say one is absent says what it is
                             instead: the thing has no repo home at all. -->
                        <span class="block truncate font-mono text-[12px] text-base-content/60"
                              x-text="path || (subjectLocal ? 'not in a repo' : 'no path on this URL')"></span>
                        <!-- A routed subject is a file no browser renders on its
                             own, shown through an app. The file is the subject
                             and reads as the identity above; this one line is
                             what keeps the app from vanishing entirely, since it
                             is what the take actions reach into and what a
                             console message would name. -->
                        <span x-show="subjectVia" class="block truncate text-[11px] text-base-content/40 italic">
                          shown through <span class="font-mono not-italic"
                            x-text="subjectVia && subjectVia.path.split('/').pop()"></span>
                        </span>
                      </span>
                      <i x-show="!subjectLocal" class="ph mt-0.5 shrink-0 text-xs opacity-40"
                         :class="pickerOpen ? 'ph-caret-up' : 'ph-caret-down'"></i>
                    </button>
                    <button x-show="repo" @click="toggleGhMenu()"
                            :title="'GitHub links for ' + repo + ' at ' + viewingRef"
                            aria-label="GitHub links"
                            class="mt-0.5 shrink-0 flex items-center gap-0.5 opacity-40 hover:opacity-90 transition-opacity">
                      <i class="ph ph-github-logo text-base"></i>
                      <i class="ph text-[10px]" :class="ghMenu ? 'ph-caret-up' : 'ph-caret-down'"></i>
                    </button>
                  </div>

                  <!-- The picker mounts as a bare panel (trigger:false) anchored
                       here, so its tree drops under the path row it belongs to.
                       It gets its GH from this fab rather than from Alpine's
                       browser store, which only show-repo has. -->
                  <!-- The x-ref sits on a WRAPPER, not on the picker's own
                       element: x-ref registers against the closest component
                       root, so an element carrying both x-ref and x-data
                       registers the ref with itself and the host never finds
                       it. The event bubbles to the wrapper either way. -->
                  <div class="px-1" x-ref="picker" @path-pick="renderPicked($event.detail)">
                    <!-- A real reference to this component, not a bare call.
                         These arrows are built in an x-data EXPRESSION, which
                         Alpine evaluates under with(scope) where scope is a
                         proxy carrying every registered component name. A bare
                         pickerRoots() therefore runs with "this" bound to that
                         proxy, and the method's own this.repo resolves to the
                         registered repo DATA PROVIDER (a function) instead of
                         this fab's string: the picker died on "repo.split is
                         not a function" with an empty Repos list behind it.
                         $data does not fix it, being the same proxy.

                         Same collision cardOpts documents in
                         alpineComponents/branch-brief.js and the mount note in
                         kits/file-deck.js; third sighting, and the first where
                         it landed on "this" rather than on a bare identifier.

                         And no backticks in this comment: the template is a JS
                         template literal, so one would end the string. That is
                         how the first attempt at this fix broke the page. -->
                    <!-- BEHIND AN x-if, because x-data is evaluated the moment
                         the element initialises and an unregistered component
                         throws there. gh-boot declares fab and path-picker as
                         one pair in FAB_BOOT; every page that hand-loads the fab
                         instead restates that list, and eleven of them do. Ten
                         dropped the picker, so opening the drawer threw
                         "pathPicker is not defined" as an Alpine expression
                         error AND an uncaught page error, and on a phone the
                         drawer read as a control that does nothing (reported
                         2026-09-04, reproduced headlessly in the toss shell at
                         390x844). x-show would not have helped: it hides a
                         rendered element rather than deferring the expression.

                         ensurePicker flips the flag once the load lands, so a
                         host that already has the component pays a deduped
                         no-op and a host that cannot reach it renders no picker
                         rather than throwing. That is the degradation this file
                         already promises for its kits. -->
                    <template x-if="pickerReady">
                      <div x-data="pathPicker({ trigger: false, dense: true, gh: () => self.pickerGh(), roots: () => self.pickerRoots() })"></div>
                    </template>
                  </div>

                  <div x-show="ghMenu" x-cloak
                       class="absolute right-2 top-full z-30 mt-0.5 w-60 max-h-[60vh] overflow-y-auto overscroll-contain rounded-box border border-base-300 bg-base-100 shadow-xl py-1">
                    <div class="px-3 pb-1 text-[11px] font-mono uppercase tracking-wider text-base-content/40 truncate"
                         x-text="'at ' + viewingRef"></div>
                    <template x-for="r in ghRows" :key="r.key">
                      <a :href="r.url" target="_blank" rel="noopener" @click="ghMenu = false"
                         class="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-base-200 transition-colors">
                        <i class="ph shrink-0 opacity-60" :class="r.icon"></i>
                        <span class="truncate" x-text="r.label"></span>
                      </a>
                    </template>
                  </div>
                </div>

              <!-- THE REF BAR: which ref this view is rendered at, and the way to
                   another one. It replaces two things that used to be separate and
                   were both worse for it.
                   It replaces the escape BANNER, which was warning-tinted, said
                   "Previewing <ref>", and did nothing when tapped. A bar naming
                   the current selection is exactly the shape of a picker, so not
                   being one read as a dead control; it is one now, and it is
                   present at the default branch too, where the banner was hidden
                   and the question "what am I looking at" went unanswered.
                   It replaces the branch LIST that filled the tab below, whose
                   rows selected a ref and then waited for a ✓ on the row to
                   confirm. Two taps is the shape of a dangerous operation, and
                   this one navigates a preview: the cost of a wrong tap is the
                   back button. One tap goes. What the list was occupying, the
                   whole body of the tab, is now the branch's guide (below).
                   The house button stays beside it, off the default branch only,
                   since at the default branch it offers a trip to where you are. -->
              <!-- Hidden for a local subject: a ref names a version of a file in
                   a repo, and a paste is in neither. The width bar under it is
                   about the FRAME, so it stays. -->
              <div x-show="!subjectLocal" class="relative shrink-0 border-b text-[13px] z-20"
                   :class="offRef ? 'bg-warning/10 border-warning/30' : 'bg-base-200/50 border-base-300'">
                <div class="flex items-center gap-1.5 px-2.5 py-1.5">
                  <button @click="toggleRefMenu()"
                          class="flex items-center gap-1.5 min-w-0 flex-1 text-left rounded transition-colors hover:bg-base-content/10 -mx-1 px-1 py-0.5"
                          :title="offRef ? 'Rendered at ' + viewingRef + ', not ' + (defaultBranch || 'main') + '. Tap to switch.'
                                         : 'Rendered at ' + viewingRef + '. Tap to switch.'">
                    <i class="ph shrink-0" :class="offRef ? 'ph-disc text-warning' : 'ph-house-line opacity-50'"></i>
                    <span class="min-w-0 truncate font-mono font-semibold" x-text="viewingRef"></span>
                    <i class="ph shrink-0 opacity-50 text-xs" :class="refMenu ? 'ph-caret-up' : 'ph-caret-down'"></i>
                  </button>
                  <button x-show="offRef" @click="returnToLive()" class="shrink-0 btn btn-warning btn-xs gap-1"
                          :title="liveTwin ? 'Return to the live page (the ' + (defaultBranch || 'main') + ' version)'
                                           : 'Render at ' + (defaultBranch || 'main') + '. This repo serves no Pages, so its default branch is read through the renderer too.'">
                    <i class="ph ph-house-line"></i><span class="font-mono normal-case" x-text="defaultBranch || 'main'"></span>
                  </button>
                </div>

                <!-- The dropdown: the old list, one tap per row, no confirm. Same
                     two-line row (identity and verdict over standing against the
                     default branch), so nothing was lost in the move; only the
                     second tap went.
                     It OVERLAYS rather than pushing. In flow it would shove the
                     guide down by its own height on open and yank it back on
                     close, which reads as the pane having been replaced; a picker
                     should cover what is behind it and give it back untouched. -->
                <div x-show="refMenu" x-cloak
                     class="absolute inset-x-0 top-full max-h-[55vh] overflow-y-auto overscroll-contain px-1.5 py-1 flex flex-col gap-0.5
                            bg-base-100 border-b border-base-300 shadow-xl">
                  <div class="flex items-center justify-between px-0.5 pb-1 shrink-0">
                    <div class="text-[12px] uppercase tracking-wider opacity-50 font-semibold flex items-center gap-1">
                      Branches
                      <i x-show="branchNote" class="ph ph-key text-warning/80" data-note-bare :data-note="branchNote"></i>
                    </div>
                    <button @click="loadPageBranches(true)" class="text-[12px] link link-hover"
                            :class="pageBranchesLoading ? 'opacity-50 pointer-events-none' : ''">refresh</button>
                  </div>
                  <template x-for="b in visibleBranches" :key="b.name">
                    <!-- The name is the whole target: tapping it renders there.
                         The standing row keeps its anchors (PR, session), which is
                         why the two are siblings rather than one button. -->
                    <div class="flex flex-col gap-0.5 px-1.5 py-1 rounded transition-colors"
                         :class="[b.name === viewingRef ? 'bg-warning/10' : 'hover:bg-base-300/50',
                                  (b.status === 'same' || b.status === 'missing') ? 'opacity-50' : '']">
                      <button @click="goToRef(b.name)"
                              :disabled="b.name === viewingRef"
                              :title="b.name === viewingRef ? 'This is what you are looking at.'
                                      : (!viaToss && !tossUrl) ? 'Toss renders through toss-render, which serves owner repos only.'
                                      : 'Render this page at ' + b.name"
                              class="flex items-center gap-1.5 text-[13px] font-mono w-full min-w-0 text-left"
                              :class="b.name === viewingRef ? 'cursor-default' : 'cursor-pointer'">
                        <i class="ph text-sm shrink-0"
                           :class="b.status === 'baseline' ? 'ph-house-line opacity-50' : 'ph-git-branch opacity-50'"></i>
                        <span class="truncate" :class="b.name === viewingRef && 'font-bold'" x-text="b.name"></span>
                        <span x-show="b.name === viewingRef" class="shrink-0 text-[10px] font-sans font-bold uppercase tracking-wide px-1 rounded bg-warning/20 text-warning" title="the ref this view is currently rendered at">current</span>
                        <span class="shrink-0 text-[11px] font-sans font-semibold uppercase tracking-wide ml-auto"
                              :class="b.status === 'differs' ? 'text-primary' : 'text-base-content/40'"
                              x-text="b.status === 'differs' ? 'differs' :
                                      b.status === 'baseline' ? 'baseline' :
                                      b.status === 'same' ? 'same' :
                                      b.status === 'missing' ? 'no file' : ''"></span>
                      </button>
                      <div class="flex items-center gap-1.5 text-[12px] pl-[18px] w-full opacity-70">
                        <!-- Divergence against the default branch, fetched
                             only for the rows worth spending a call on. -->
                        <span x-show="b.div" class="shrink-0 font-mono flex items-center gap-1">
                          <span x-show="b.div && b.div.ahead" class="text-success" x-text="'↑' + (b.div && b.div.ahead)" data-note="commits on this branch not on the default branch"></span>
                          <span x-show="b.div && b.div.behind" class="text-warning" x-text="'↓' + (b.div && b.div.behind)" data-note="commits on the default branch not on this one"></span>
                          <span x-show="b.div && !b.div.ahead && !b.div.behind" class="opacity-50">even</span>
                          <span x-show="b.div && b.div.merged" class="text-[11px] font-sans uppercase tracking-wide opacity-60" data-note="every commit here is already on the default branch">merged</span>
                        </span>
                        <span x-show="b.divBusy" class="loading loading-dots loading-xs opacity-40"></span>
                        <!-- The open PR, and the Claude Code session that
                             authored the branch (lifted from the guide PR
                             footer by gh.pulls). Same pair the estate's
                             Open view carries, same brand logomark. -->
                        <a x-show="b.pr" :href="prUrl(b.pr && b.pr.number)" target="_blank"
                           class="shrink-0 font-mono hover:text-primary transition-colors"
                           :title="'Open PR #' + (b.pr && b.pr.number) + (b.pr && b.pr.draft ? ' (draft)' : '')"
                           x-text="'#' + (b.pr && b.pr.number)"></a>
                        <a x-show="b.session" :href="b.session" target="_blank"
                           title="Open the Claude session that authored this branch"
                           class="shrink-0 flex items-center hover:opacity-75 transition-opacity"
                           x-html="window.claudeMark.svg({ cls: 'w-3.5 h-3.5' })"></a>
                        <span class="truncate opacity-70" x-text="b.subject || ''" :title="b.subject || ''"></span>
                        <span x-show="b.ago" class="ml-auto shrink-0 opacity-60 whitespace-nowrap"
                              x-text="b.ago" :data-note="b.date"></span>
                      </div>
                    </div>
                  </template>
                  <button x-show="hiddenBranchCount || showAllBranches" @click="expandBranches()"
                          class="text-[12px] opacity-50 hover:opacity-90 py-1 px-1 text-left">
                    <span x-show="!showAllBranches" x-text="'+ ' + hiddenBranchCount + ' more (same or no copy of this page)'"></span>
                    <span x-show="showAllBranches">collapse the unchanged</span>
                  </button>
                  <div x-show="!pageBranches.length && !pageBranchesLoading" class="text-[12px] opacity-50 py-1 px-1">No branches loaded.</div>
                </div>
              </div>

              <!-- THE COMPARE BAR: the second ref, under the first.

                   The ref bar answers "which version am I looking at". This
                   answers "against what", which is the same kind of question
                   about the same file, so it is the same kind of row rather
                   than a control somewhere else. Together they are the whole
                   of the sidebar's claim on versions: it owns which one, and
                   it owns the comparison, and a surface showing the file owns
                   neither.

                   It appears only for a subject that ANNOUNCED a base (today,
                   a file deck slide). A page rendered at a ref has no second
                   version in play and would get a control with nothing to act
                   on; a changeset slide arrives already being compared against
                   its merge base, and this is the control for that fact.

                   Off is a real state and it is not the same as "the default".
                   Turning comparison off leaves the reader with the file and
                   nothing else, which is what reading a doc wants; returning
                   to the announced base is one tap from there. -->
              <div x-show="!subjectLocal && subjectBase" x-cloak
                   class="relative shrink-0 border-b border-base-300 bg-base-200/30 text-[13px] z-10">
                <div class="flex items-center gap-1.5 px-2.5 py-1.5">
                  <i class="ph ph-git-diff shrink-0 opacity-50"></i>
                  <button @click="toggleCompareMenu()"
                          class="flex items-center gap-1.5 min-w-0 flex-1 text-left rounded transition-colors hover:bg-base-content/10 -mx-1 px-1 py-0.5"
                          :title="compareOff ? 'Not comparing. Tap to pick a version to compare against.'
                                             : 'Comparing against ' + compareName + '. Tap to change.'">
                    <span class="shrink-0 opacity-50">vs</span>
                    <span class="min-w-0 truncate font-mono" :class="compareOff ? 'opacity-40 italic' : 'font-semibold'"
                          x-text="compareOff ? 'nothing' : compareName"></span>
                    <span x-show="!compareOff && !compareRef" class="shrink-0 text-[10px] font-sans uppercase tracking-wide opacity-40"
                          title="the merge base this changeset was computed against">merge base</span>
                    <i class="ph shrink-0 opacity-50 text-xs" :class="compareMenu ? 'ph-caret-up' : 'ph-caret-down'"></i>
                  </button>
                  <button x-show="!compareOff" @click="compareStop()" class="shrink-0 btn btn-ghost btn-xs px-1"
                          title="Stop comparing and just read the file">
                    <i class="ph ph-x"></i></button>
                </div>

                <div x-show="compareMenu" x-cloak
                     class="absolute inset-x-0 top-full max-h-[55vh] overflow-y-auto overscroll-contain px-1.5 py-1 flex flex-col gap-0.5
                            bg-base-100 border-b border-base-300 shadow-xl">
                  <div class="px-0.5 pb-1 text-[12px] uppercase tracking-wider opacity-50 font-semibold shrink-0">
                    Compare against
                  </div>
                  <!-- The announced base first, because it is the one answer
                       that is not a guess: the changeset was computed against
                       it, so its patch is the only patch that is true. -->
                  <button @click="compareWith('')" :disabled="!compareOff && !compareRef"
                          class="flex items-center gap-1.5 px-1.5 py-1 rounded text-[13px] font-mono text-left transition-colors"
                          :class="(!compareOff && !compareRef) ? 'bg-warning/10 cursor-default' : 'hover:bg-base-300/50 cursor-pointer'">
                    <i class="ph ph-git-merge text-sm shrink-0 opacity-50"></i>
                    <span class="truncate" x-text="subjectBaseName || subjectBase"></span>
                    <span class="shrink-0 text-[10px] font-sans uppercase tracking-wide opacity-40 ml-auto">merge base</span>
                  </button>
                  <template x-for="b in compareTargets" :key="'cmp-' + b.name">
                    <button @click="compareWith(b.name)" :disabled="b.name === compareRef"
                            class="flex items-center gap-1.5 px-1.5 py-1 rounded text-[13px] font-mono text-left transition-colors"
                            :class="[b.name === compareRef ? 'bg-warning/10 cursor-default' : 'hover:bg-base-300/50 cursor-pointer',
                                     (b.status === 'same' || b.status === 'missing') ? 'opacity-50' : '']">
                      <i class="ph text-sm shrink-0"
                         :class="b.status === 'baseline' ? 'ph-house-line opacity-50' : 'ph-git-branch opacity-50'"></i>
                      <span class="truncate" x-text="b.name"></span>
                      <span class="shrink-0 text-[11px] font-sans font-semibold uppercase tracking-wide ml-auto"
                            :class="b.status === 'differs' ? 'text-primary' : 'text-base-content/40'"
                            x-text="b.status === 'differs' ? 'differs' :
                                    b.status === 'baseline' ? 'baseline' :
                                    b.status === 'same' ? 'same' :
                                    b.status === 'missing' ? 'no file' : ''"></span>
                    </button>
                  </template>
                  <div x-show="pageBranchesLoading" class="px-1.5 py-1"><span class="loading loading-dots loading-xs opacity-40"></span></div>
                  <!-- Two empty states, because they mean different things: the
                       scan has not answered, or it answered and the merge
                       base is the only other version there is. -->
                  <div x-show="!pageBranches.length && !pageBranchesLoading"
                       class="text-[12px] opacity-50 py-1 px-1">No branches loaded.</div>
                  <div x-show="pageBranches.length && !compareTargets.length"
                       class="text-[12px] opacity-50 py-1 px-1">No other branch to compare against.</div>
                  <button x-show="!compareOff" @click="compareStop()"
                          class="text-[12px] opacity-50 hover:opacity-90 py-1 px-1 text-left">stop comparing</button>
                </div>
              </div>

              <!-- THE WIDTH BAR: which SHAPE this view is rendered at, under the
                   bar naming which ref it is rendered at. Two facets of one
                   question, so they stack rather than sitting in different tabs.
                   Every preset resolves to the same mechanism, a frame of that
                   width, because a frame is the only thing in a browser that
                   honestly IS a viewport; the shell owns the lever and this only
                   calls it. Inside a toss that costs nothing, since the frame is
                   already there. Outside one it means going to the renderer, the
                   same trip goToRef already makes, which is also what makes the
                   answer trustworthy: the page boots fresh at the target width,
                   so a component that read innerWidth once at mount read the
                   right number.
                   The one thing it cannot fake is the pointer and hover media
                   queries, so the caveat is printed rather than left for the
                   reader to discover through a hover state that never appears.
                   Deliberately NOT wired to the launcher's off-ref tint. That
                   indicator exists because rendering off the default branch is
                   invisible; a page rendered at another width announces itself
                   on sight, so a second meaning on one mark would cost the first
                   its precision. The bar tints itself and carries its own way
                   back, which is where the ref bar puts the same offer. -->
              <!-- One row, two kinds of control: the width presets, then past a
                   hairline the page's own toggles. Both answer how this view is
                   being presented, so they share a line rather than stacking.

                   IT HAS TO FIT ON ONE LINE, at a drawer's width on a phone,
                   which is what decides the labelling. Four labelled presets
                   plus one labelled toggle wrapped, measured on a 390pt device,
                   so THE PRESETS GO ICON-ONLY under a single "Width" label,
                   spending one word on the group instead of four on its members.
                   The icons carry it: a phone, a tablet, and a monitor are the
                   three things being named, and the arrows are the device you
                   are holding. The toggle keeps its word, since an icon alone
                   cannot say which part of a page it means, and it is the odd
                   one out in a row otherwise about size.

                   Nothing here explains itself in prose. A contributed toggle
                   used to render a hint line under the row, and it cost two
                   lines to say what the tooltip and the address already said.
                   The one line that remains is the width caveat, which appears
                   only off Actual and reports something no icon can. -->
              <div x-show="widthReachable || pageToggles.length" class="shrink-0 border-b"
                   :class="frameWidth ? 'bg-warning/10 border-warning/30' : 'bg-base-200/50 border-base-300'">
                <div class="flex items-center gap-0.5 px-1.5 py-1">
                  <span x-show="widthReachable"
                        class="shrink-0 pl-1 pr-0.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/40">Width</span>
                  <template x-for="p in WIDTHS" :key="p.w">
                    <button x-show="widthReachable" @click="setWidth(p.w)" :aria-label="p.label"
                            :title="p.w ? p.label + ': render this page in a ' + p.w + 'px viewport' : 'Actual: render at the width this device has'"
                            class="shrink-0 px-1.5 py-0.5 rounded transition-colors"
                            :class="p.w === frameWidth
                              ? (p.w ? 'bg-warning/20 text-warning' : 'bg-primary/10 text-primary')
                              : 'text-base-content/60 hover:bg-base-200'">
                      <i class="ph text-base leading-none" :class="p.icon"></i>
                    </button>
                  </template>
                  <div x-show="widthReachable && pageToggles.length" class="mx-1 h-4 w-px bg-base-300 shrink-0"></div>
                  <!-- The page's own on/off controls. Lit reads ON, which is
                       also the default state of everything contributed so far,
                       so an unlit control is the one saying something. -->
                  <template x-for="t in pageToggles" :key="t.from + ':' + t.key">
                    <button @click="setPageToggle(t, !t.on)" :title="t.title || t.label"
                            :aria-pressed="t.on ? 'true' : 'false'"
                            class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] font-semibold transition-colors min-w-0"
                            :class="t.on ? 'bg-primary/10 text-primary' : 'text-base-content/60 hover:bg-base-200'">
                      <i class="ph text-sm shrink-0" :class="t.icon || 'ph-toggle-left'"></i>
                      <span class="truncate" x-text="t.label"></span>
                    </button>
                  </template>
                </div>
                <div x-show="frameWidth" class="px-2.5 pb-1 text-[11px] leading-snug text-base-content/50">
                  <span class="font-mono" x-text="frameWidth + 'px'"></span> viewport.
                  Layout only: touch and hover still answer as this device.
                </div>
              </div>
              </div>

              <!-- Inspect: the page's loaded scripts (top) and Alpine components
                   (below), merged into one scroll. Skips the repo/version/links
                   context block the Render tab carries. In a #gh= toss the
                   subject's same-origin frame is scanned too (subjectInspect),
                   with the subject listed first and this shell's rows badged
                   "shell"; when the frame isn't readable (a #gz= payload toss),
                   the caveat line says the lists cover only the shell. -->
              <div x-show="activeTab === 'inspect'" class="min-h-0 flex-1 flex flex-col">
                <div x-show="viaToss && !subjectInspect" class="px-2.5 pt-2 flex items-center gap-1 text-[12px] text-base-content/50 shrink-0">
                  <i class="ph ph-disc shrink-0"></i>
                  <span>These describe the toss-render shell, not the tossed page.</span>
                </div>

                <div class="px-2.5 pt-2 pb-0.5 text-[12px] uppercase tracking-wider text-base-content/50 font-semibold shrink-0">Scripts</div>
                <div x-show="inspectScripts.length === 0" class="text-sm text-base-content/50 italic px-3 py-3 text-center shrink-0">
                  No scripts tracked. gh-boot.js installs the registry; older cached gh-api.js won't populate it.
                </div>
                <div x-show="inspectScripts.length > 0" class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pt-1 space-y-1">
                  <template x-for="(s, idx) in inspectScripts" :key="idx">
                    <div class="rounded bg-base-200/40 border border-base-300/60 overflow-hidden">
                      <div class="flex items-center gap-2 px-2 py-1.5">
                        <i class="ph shrink-0 text-base"
                           :class="s.status === 'ok' ? 'ph-check-circle text-success' :
                                   s.status === 'error' ? 'ph-x-circle text-error' :
                                   'ph-circle-notch animate-spin text-warning'"></i>
                        <a :href="scriptUrl(s)" target="_blank" :title="s.path"
                           class="flex-1 min-w-[7rem] font-mono text-[13px] truncate link link-hover" x-text="s.path"></a>
                        <span x-show="s.side === 'shell'" class="text-[11px] font-sans font-semibold uppercase tracking-wide text-base-content/40 shrink-0">shell</span>
                        <!-- "auto" means the requester was gh-boot.js, which is
                             exactly what the by: line then says again. Showing
                             both cost the row the width its PATH needed, and the
                             path is the one column nobody can read the row
                             without: it was truncating to "alpin…". -->
                        <span x-show="s.auto && !(s.by && s.by.size > 0)" class="text-[12px] text-base-content/50 shrink-0">auto</span>
                        <span x-show="s.by && s.by.size > 0" class="text-[12px] text-base-content/60 shrink truncate max-w-[6.5rem]"
                              :data-note="Array.from(s.by || []).join(', ')">
                          <span class="opacity-50">by:</span> <span x-text="Array.from(s.by || []).join(', ')"></span>
                        </span>
                        <!-- What the row cost, and the word this list could not
                             say before: under the pre-build almost every module
                             is served from an inlined cache and spends no
                             network at all. Reporting those identically to a
                             real fetch is what made a size column on this list
                             wrong; borrowing the byte only where a byte was
                             spent is what makes it right. -->
                        <span x-show="scriptSizeText(s)" class="font-mono text-[12px] shrink-0"
                              :class="scriptInlined(s) ? 'text-base-content/30 italic' : 'text-base-content/60'"
                              :data-note="scriptSizeTitle(s)" x-text="scriptSizeText(s)"></span>
                        <span class="font-mono text-[12px] text-base-content/40 shrink-0" x-text="fmtElapsed(s)"></span>
                      </div>
                      <div x-show="s.error" class="px-2 pb-1.5 font-mono text-[12px] text-error break-all" x-text="s.error"></div>
                    </div>
                  </template>
                </div>

                <div class="flex items-center justify-between px-2.5 pt-2 pb-0.5 border-t border-base-300/60 shrink-0">
                  <div class="text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">Components</div>
                  <button @click="clearHighlight()" x-show="highlighted" class="text-[12px] font-normal link link-hover">clear</button>
                </div>
                <div x-show="groups.length > 0" class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pt-1 space-y-2">
                  <template x-for="g in groups" :key="g.key">
                    <div class="bg-base-200/40 rounded-lg overflow-hidden border border-base-300/60">
                      <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-base-200/80">
                        <div class="flex items-baseline gap-1.5 min-w-0">
                          <span class="font-mono text-base font-semibold truncate" x-text="g.name"></span>
                          <span class="text-[12px] font-mono text-base-content/50 shrink-0">&times;<span x-text="g.instances.length"></span></span>
                          <span x-show="subjectInspect && g.shell" class="text-[11px] font-sans font-semibold uppercase tracking-wide text-base-content/40 shrink-0">shell</span>
                        </div>
                        <div class="flex gap-0.5 shrink-0">
                          <template x-for="link in componentLinks(g)" :key="link.l">
                            <a :href="link.u" target="_blank" :title="link.l"
                               class="size-6 flex items-center justify-center bg-base-100 hover:bg-base-300 rounded">
                              <i class="ph text-sm" :class="link.i"></i>
                            </a>
                          </template>
                        </div>
                      </div>
                      <div x-show="g.description" class="text-[13px] text-base-content/70 px-2.5 py-1 border-t border-base-300/40" x-text="g.description"></div>
                      <div class="flex flex-col">
                        <template x-for="(inst, idx) in g.instances" :key="inst.id">
                          <button @click="highlight(inst.id)"
                                  class="text-left px-2.5 py-1.5 text-sm flex items-center gap-2 border-t border-base-300/40 transition-colors"
                                  :class="highlighted === inst.id ? 'bg-primary/10 text-primary' : 'hover:bg-base-300/40'">
                            <i class="ph shrink-0" :class="highlighted === inst.id ? 'ph-crosshair-simple text-sm' : 'ph-crosshair text-sm opacity-50'"></i>
                            <span class="font-mono opacity-60 shrink-0" x-text="'#' + (idx + 1)"></span>
                            <span class="truncate" x-text="inst.label"></span>
                          </button>
                        </template>
                      </div>
                    </div>
                  </template>
                </div>
                <div x-show="groups.length === 0" class="text-sm text-base-content/50 italic px-3 py-3 text-center shrink-0">
                  No Alpine components detected on this page.
                </div>
              </div>

              <!-- TRAFFIC. Three bands, three different questions that all get
                   called "size", kept apart because they do not share a unit:
                   BOOT is what one page load cost (fixed, cacheable, Resource
                   Timing), API is what browsing has spent since (grows, and a
                   rate limit bounds it), STORAGE is what the origin keeps (not
                   traffic at all, so it rides as one line rather than a band).
                   The arithmetic and every honesty rule live in lib/kits/traffic.js;
                   this is only its rendering. -->
              <div x-show="activeTab === 'traffic'" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div x-show="trafficError" class="text-sm text-base-content/50 italic px-3 py-6 text-center" x-text="trafficError"></div>

                <!-- WHOSE traffic, in a toss. Inspect has carried this caveat
                     since it learned to scan the subject frame, and a tab whose
                     selling point is honest numbers cannot carry less: the
                     shell's weight is not the tossed page's, and reporting one
                     as the other is the exact failure the undisclosed/cached
                     split exists to prevent. Where the subject frame is
                     readable the bands describe the SUBJECT and the shell's
                     cost is named beside it; where it is not (#gz= renders
                     under an opaque origin), the numbers stay the shell's and
                     say so. -->
                <div x-show="viaToss" class="px-2.5 pt-2 flex items-start gap-1.5 text-[12px] text-base-content/50">
                  <i class="ph ph-disc shrink-0 mt-0.5"></i>
                  <span x-show="trafSubject" class="min-w-0">
                    The tossed page, measured inside its frame. The toss-render shell
                    around it cost <span class="font-mono" x-text="fmtB(trafShellWire)"></span> more.
                  </span>
                  <span x-show="!trafSubject" class="min-w-0">
                    These describe the toss-render shell, not the tossed page: its frame
                    could not be read from here.
                  </span>
                </div>

                <template x-if="trafBoot">
                  <div>
                    <div class="px-2.5 pt-2 pb-0.5 flex items-baseline justify-between gap-2">
                      <div class="text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">Boot</div>
                      <div class="text-[11px] text-base-content/40">this page load</div>
                    </div>
                    <div class="px-2.5 pb-1.5">
                      <!-- When every row withheld its size, the headline says so
                           rather than totalling to a bold 0 B. Same rule as the
                           group rows, applied one level up: it fires for real
                           whenever a page's resources are all cross-origin
                           without Timing-Allow-Origin, and "0 B wire" there is
                           the most confident wrong number the tab could print. -->
                      <div class="font-mono text-[13px] tabular-nums" x-show="trafBoot.undisclosed === trafBoot.count && trafBoot.count">
                        <span class="font-semibold">No sizes disclosed</span><span class="text-base-content/50">, by any of the origins involved</span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtT(trafBoot.ms)"></span>
                      </div>
                      <div class="font-mono text-[13px] tabular-nums" x-show="!(trafBoot.undisclosed === trafBoot.count && trafBoot.count)">
                        <span class="font-semibold" x-text="fmtB(trafBoot.wire)"></span><span class="text-base-content/50"> wire</span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtB(trafBoot.decoded)"></span><span class="text-base-content/50"> decoded</span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtT(trafBoot.ms)"></span>
                      </div>
                      <!-- The qualifier, never dropped: a total that silently
                           excluded cached and undisclosed rows would read as
                           complete when it is not. -->
                      <div class="text-[11px] text-base-content/50 mt-0.5" x-show="trafBoot.cached || trafBoot.undisclosed">
                        <span x-text="trafBoot.count"></span> resources<span x-show="trafBoot.cached">, <span x-text="trafBoot.cached"></span> from cache</span><span x-show="trafBoot.undisclosed">, <span x-text="trafBoot.undisclosed"></span> not disclosing size</span>
                      </div>
                    </div>

                    <!-- Weight by role. The bar is the answer most of the time:
                         you see which band owns the load without reading a
                         digit. -->
                    <div class="px-2.5 pb-2 space-y-1">
                      <template x-for="g in trafBootGroups" :key="g.group">
                        <div>
                          <!-- A group whose rows all withheld their size reads
                               "not disclosed", never "0 B": the whole band is
                               worthless if an unmeasurable row can pass for a
                               free one. A partial group shows what it knows and
                               says how many rows it could not count. -->
                          <div class="flex items-baseline gap-2 text-[12px]">
                            <span class="flex-1 truncate" x-text="g.label"></span>
                            <span x-show="g.undisclosed && g.undisclosed < g.count"
                                  class="text-[11px] text-base-content/40" x-text="'+' + g.undisclosed + ' n/d'"></span>
                            <span class="font-mono text-[11px] text-base-content/40 tabular-nums" x-text="g.count"></span>
                            <span class="font-mono tabular-nums shrink-0"
                                  :class="g.undisclosed === g.count ? 'text-base-content/40 text-[11px]' : ''"
                                  x-text="g.undisclosed === g.count ? 'not disclosed' : fmtB(g.wire)"></span>
                          </div>
                          <div class="h-1 rounded bg-base-300/60 overflow-hidden mt-0.5">
                            <div class="h-full rounded bg-primary/60" :style="'width:' + trafPct(g.wire) + '%'"></div>
                          </div>
                        </div>
                      </template>
                    </div>

                    <button @click="trafRowsOpen = !trafRowsOpen"
                            class="w-full px-2.5 py-1 flex items-center gap-1.5 text-[12px] text-base-content/50 hover:bg-base-200 transition-colors">
                      <i class="ph text-[13px]" :class="trafRowsOpen ? 'ph-caret-down' : 'ph-caret-right'"></i>
                      <span x-text="(trafRowsOpen ? 'Hide' : 'Show') + ' all ' + trafBoot.count + ' resources'"></span>
                    </button>
                    <div x-show="trafRowsOpen" class="px-2 pb-2 space-y-0.5">
                      <template x-for="(r, i) in trafBoot.rows" :key="i">
                        <div class="flex items-center gap-2 px-1.5 py-1 rounded bg-base-200/40 text-[12px]">
                          <span class="size-1.5 rounded-full shrink-0"
                                :class="r.state === 'network' ? 'bg-primary/70' : r.state === 'cached' ? 'bg-success/60' : 'bg-base-content/20'"
                                :data-note="r.state"></span>
                          <span class="flex-1 font-mono truncate" :data-note="r.name" x-text="r.short"></span>
                          <span class="font-mono text-[11px] tabular-nums shrink-0"
                                :class="r.state === 'network' ? '' : 'text-base-content/40'"
                                x-text="r.state === 'network' ? fmtB(r.wire) : (r.state === 'cached' ? 'cached' : 'n/d')"></span>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>

                <div class="px-2.5 pt-2 pb-0.5 flex items-baseline justify-between gap-2 border-t border-base-300/60">
                  <div class="text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">API</div>
                  <div class="text-[11px] text-base-content/40">since this page opened</div>
                </div>
                <!-- One list, two cuts, because they answer different halves of
                     the question and neither is a superset of the other. WHAT
                     was called (endpoint shape) and WHERE it landed (the repo in
                     the URL). The repo cut is what separates an estate crawl,
                     which touches many repos, from browsing, which touches one,
                     and no amount of endpoint grouping can show that. A toggle
                     rather than two lists: the band is already the tallest thing
                     in the drawer. -->
                <div class="px-2.5 pb-1 flex items-center gap-1" x-show="trafTotals && trafTotals.calls">
                  <template x-for="cut in [['endpoint','by endpoint'],['repo','by repo']]" :key="cut[0]">
                    <button @click="trafCut = cut[0]"
                            class="px-1.5 py-0.5 rounded text-[11px] transition-colors"
                            :class="trafCut === cut[0] ? 'bg-primary/10 text-primary font-semibold' : 'text-base-content/50 hover:bg-base-200'"
                            x-text="cut[1]"></button>
                  </template>
                </div>
                <div x-show="!trafTotals || !trafTotals.calls" class="text-[13px] text-base-content/50 italic px-3 py-3 text-center">
                  No calls yet.
                </div>
                <template x-if="trafTotals && trafTotals.calls">
                  <div>
                    <div class="px-2.5 pb-1.5">
                      <div class="font-mono text-[13px] tabular-nums">
                        <span class="font-semibold" x-text="trafTotals.calls"></span><span class="text-base-content/50" x-text="trafTotals.calls === 1 ? ' call' : ' calls'"></span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtB(trafTotals.wire)"></span>
                        <span class="text-base-content/30"> · </span><span x-text="fmtT(trafTotals.ms)"></span><span class="text-base-content/50"> waiting</span>
                      </div>
                      <!-- Writes get their own line, above the caveats rather
                           than among them. A PUT to contents/ is the most
                           consequential thing this library does over a network
                           and it shares an endpoint shape with every file read,
                           so nothing else on this tab would distinguish it. -->
                      <div class="text-[12px] mt-0.5 flex items-center gap-1 text-warning font-semibold" x-show="trafTotals.writes">
                        <i class="ph ph-pencil-simple text-[13px]"></i>
                        <span x-text="trafTotals.writes + (trafTotals.writes === 1 ? ' write' : ' writes')"></span>
                        <span class="font-normal text-base-content/50">to the repository</span>
                      </div>
                      <div class="text-[11px] text-base-content/50 mt-0.5" x-show="trafTotals.unknown || trafTotals.errors || trafTrimmed">
                        <span x-show="trafTotals.unknown"><span x-text="trafTotals.unknown"></span> without a declared length</span><span x-show="trafTotals.unknown && trafTotals.errors">, </span><span x-show="trafTotals.errors" class="text-error"><span x-text="trafTotals.errors"></span> failed</span><span x-show="trafTrimmed">, <span x-text="trafTrimmed"></span> older calls dropped from the list</span>
                      </div>
                      <!-- The exact figure here, not the strip's rounded one:
                           the strip is a glance, this is where you come when
                           the glance worried you. -->
                      <div class="text-[11px] mt-0.5" x-show="trafRate !== null"
                           :class="trafRate !== null && trafRate < 500 ? 'text-warning font-semibold' : 'text-base-content/50'">
                        <span class="font-mono tabular-nums" x-text="trafRateExact"></span> of the hourly rate limit left<span x-show="trafReset" x-text="', resets in ' + trafReset"></span>
                      </div>
                    </div>
                    <!-- Grouped by endpoint shape, which says WHAT KIND of call
                         was made and deliberately does not claim who made it:
                         the endpoints are shared (contents/ by every load and
                         read, by gh-store's writes, and by the config crawl;
                         commits by the crawl, recentFiles and the sidebar), so
                         a count here does not name a subsystem. The write badge
                         is the axis that does separate something, and it
                         separates the consequential thing. Full account, and
                         what caller attribution would cost, in lib/kits/traffic.js. -->
                    <div class="px-2 pb-2 space-y-0.5" x-show="trafCut === 'repo'">
                      <template x-for="g in trafRepos" :key="g.repo">
                        <div class="flex items-center gap-2 px-1.5 py-1 rounded bg-base-200/40 text-[12px]">
                          <span class="flex-1 truncate font-mono" :class="g.named ? '' : 'text-base-content/40 font-sans italic'" x-text="g.repo"></span>
                          <span x-show="g.writes" class="text-warning text-[11px] font-semibold" x-text="g.writes + 'w'"></span>
                          <span x-show="g.errors" class="text-error text-[11px] font-semibold" x-text="g.errors + ' err'"></span>
                          <span class="font-mono text-[11px] text-base-content/50 tabular-nums shrink-0" x-text="g.calls + '×'"></span>
                          <span class="font-mono tabular-nums shrink-0 w-14 text-right"
                                :class="g.unknown === g.calls ? 'text-base-content/40 text-[11px]' : ''"
                                x-text="g.unknown === g.calls ? 'no length' : fmtB(g.wire)"></span>
                        </div>
                      </template>
                    </div>
                    <div class="px-2 pb-2 space-y-0.5" x-show="trafCut === 'endpoint'">
                      <template x-for="g in trafGroups" :key="g.group">
                        <div class="flex items-center gap-2 px-1.5 py-1 rounded bg-base-200/40 text-[12px]">
                          <span class="flex-1 truncate" x-text="g.label"></span>
                          <span x-show="g.writes" class="text-warning text-[11px] font-semibold" x-text="g.writes + 'w'"
                                :data-note="g.writes + ' of these changed something'"></span>
                          <span x-show="g.errors" class="text-error text-[11px] font-semibold" x-text="g.errors + ' err'"></span>
                          <span class="font-mono text-[11px] text-base-content/50 tabular-nums shrink-0" x-text="g.calls + '×'"></span>
                          <span class="font-mono tabular-nums shrink-0 w-14 text-right"
                                :class="g.unknown === g.calls ? 'text-base-content/40 text-[11px]' : ''"
                                x-text="g.unknown === g.calls ? 'no length' : fmtB(g.wire)"></span>
                        </div>
                      </template>
                    </div>
                  </div>
                </template>

                <!-- STORAGE, and the name is the platform's rather than one of
                     ours: the Storage Standard's word, DevTools' word (Application
                     → Storage), and exactly what is being measured (Web Storage
                     plus whatever navigator.storage.estimate reports, which is
                     quota-managed: IndexedDB, Cache API, and nothing else).
                     "Quota" was the other candidate and was rejected because the
                     API band one line up already says "of the hourly rate limit
                     left"; two quotas on one screen is worse than a plain word.
                     It carried a coined heading, Resident, borrowed from OS
                     memory management, and that word spanned two things the
                     platform keeps apart. Under it sat the sentence "what a
                     reload would not have to fetch again", which describes the
                     HTTP CACHE. estimate() cannot see the HTTP cache: measured
                     2026-08-05, 300 KB of cached response moved it 0 to 0, while
                     an IndexedDB write moved it at once. The question that
                     sentence asked is answered one band up, by Boot's cached
                     rows, where it belongs.
                     One line by default, because on show-repo the honest answer
                     is a few hundred bytes and a heading over that is a promise
                     the band cannot keep. It opens itself where there is mass,
                     which is the handful of pages holding blobs in IndexedDB
                     (pdf-inspect, compression-helper, the data shelf). -->
                <div class="border-t border-base-300/60">
                  <button @click="trafStoreOpen = !trafStoreOpen"
                          class="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-[12px] hover:bg-base-200 transition-colors text-left">
                    <i class="ph text-[13px] text-base-content/40" :class="trafStoreOpen ? 'ph-caret-down' : 'ph-caret-right'"></i>
                    <span class="text-base-content/50">storage</span>
                    <span class="flex-1 font-mono tabular-nums text-base-content/70 truncate" x-text="trafStoreLine"></span>
                  </button>
                  <div x-show="trafStoreOpen" class="px-2.5 pb-3 space-y-0.5 text-[12px]">
                    <template x-for="s in trafStores" :key="s.name">
                      <div class="flex items-baseline gap-2">
                        <span class="flex-1 truncate" x-text="s.name"></span>
                        <span class="font-mono text-[11px] text-base-content/50 tabular-nums" x-text="s.keys + (s.keys === 1 ? ' key' : ' keys')"></span>
                        <span class="font-mono tabular-nums shrink-0" x-text="fmtB(s.bytes)"></span>
                      </div>
                    </template>
                    <!-- Named databases beat one origin total: "12 MB somewhere"
                         is not actionable, "pdfInspect 12 MB" is. Not every
                         browser exposes the list, so the total stands alone
                         where it does not. -->
                    <template x-for="db in trafDbs" :key="db">
                      <div class="flex items-baseline gap-2">
                        <span class="flex-1 truncate font-mono" x-text="db"></span>
                        <span class="text-[11px] text-base-content/40">IndexedDB</span>
                      </div>
                    </template>
                    <div class="flex items-baseline gap-2" x-show="trafEstimate">
                      <span class="flex-1 truncate">origin storage, all stores</span>
                      <span class="font-mono tabular-nums shrink-0" x-text="fmtB(trafEstimate)"></span>
                    </div>
                    <div x-show="!trafStores.length && !trafEstimate" class="text-base-content/50 italic">
                      Nothing stored for this origin.
                    </div>
                    <div class="text-[11px] text-base-content/40 pt-1">
                      Read once when the tab opened. Quota-managed storage and Web Storage
                      only: the browser's HTTP cache is not counted here, and shows up as
                      the cached rows under Boot instead.
                    </div>
                  </div>
                </div>
              </div>

              <!-- TEXT. What the page SAYS, as against the four tabs about how
                   it was delivered. This is the Read operation of
                   docs/text-tools.md and only that: figures decidable from the
                   rendered document with no network and no model. The costlier
                   operations (Match against the registries, Flag undeclared
                   vocabulary, Ask a model) are absent rather than stubbed.
                   Rows, not stat cards, per the house style, and every
                   figure that needs a denominator carries one. -->
              <div x-show="activeTab === 'text'" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <!-- The one caveat that decides whether to read the rest. An
                     app's visible text is button labels, so a word count over
                     it is a number about a toolbar. Stated as a banner rather
                     than as a footnote because it qualifies every row below. -->
                <!-- x-if, not x-show: x-show hides the element and still
                     EVALUATES its children, so the readout inside this banner
                     ran against a null textStats before the first scan and
                     threw. Caught by the fab suite, which mounts the drawer
                     without opening this tab. Anything reading textStats
                     outside the x-if below needs the same treatment. -->
                <template x-if="textStats && textStats.perRun < 6">
                  <div class="flex items-start gap-2 px-2.5 py-1.5 bg-warning/10 border-b border-warning/30 text-[13px]">
                    <i class="ph ph-warning-octagon text-warning shrink-0 mt-0.5"></i>
                    <span class="min-w-0">This page reads as an <span class="font-semibold">app</span>, not a document:
                      its text arrives in runs of
                      <span class="font-mono" x-text="textStats.perRun.toFixed(1)"></span>
                      words, which is labels rather than sentences. Read the figures below as a description of a
                      user interface.</span>
                  </div>
                </template>
                <div x-show="viaToss && !subjectReached" class="px-2.5 pt-2 flex items-center gap-1 text-[12px] text-base-content/50">
                  <i class="ph ph-disc shrink-0"></i>
                  <span>Read from the toss-render shell; the tossed page is sandboxed.</span>
                </div>

                <!-- WHAT WAS READ. A selection is the reading this tab is for,
                     so it is stated at the top rather than inferred from a
                     smaller word count. The page case says so too: silence
                     would leave a reader who selected something wondering
                     whether it was honoured. -->
                <div x-show="textScanned" class="flex items-center gap-1.5 px-2.5 pt-2 text-[12px]">
                  <i class="ph shrink-0" :class="textScope === 'selection' ? 'ph-text-align-left text-primary' : 'ph-file-text text-base-content/40'"></i>
                  <span :class="textScope === 'selection' ? 'text-primary font-semibold' : 'text-base-content/50'"
                        x-text="textScope === 'selection' ? 'Your selection' : 'The whole page'"></span>
                  <span class="text-base-content/40">·</span>
                  <button @click="textScan()" class="link link-hover text-base-content/50"
                          title="Read again. Select a passage on the page first to scope the read to it.">rescan</button>
                  <!-- The way back out. Without it a snapshot taken at the
                       opening tap is a scope the reader cannot leave without
                       closing the drawer and tapping somewhere neutral. -->
                  <button x-show="textScope === 'selection'" @click="_selSnap = null; textScan()"
                          class="link link-hover text-base-content/50">whole page</button>
                </div>

                <div x-show="!textStats" class="text-sm text-base-content/50 italic px-3 py-6 text-center">
                  Nothing readable on this page.
                </div>

                <template x-if="textStats">
                  <div>
                    <div class="px-2.5 pt-2 pb-0.5 text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">Body</div>
                    <div class="px-2.5 pb-2 space-y-1">
                      <div class="flex items-baseline justify-between gap-2 text-sm">
                        <span class="text-base-content/70">Words</span>
                        <span class="font-mono tabular-nums" x-text="textStats.words.toLocaleString()
                          + ' of ' + (textStats.words + textStats.chrome).toLocaleString()"></span>
                      </div>
                      <div class="flex items-baseline justify-between gap-2 text-sm">
                        <span class="text-base-content/70">Sentences</span>
                        <span class="font-mono tabular-nums" x-text="textStats.sentences.toLocaleString() + ' · ' + textStats.avg + ' avg'"></span>
                      </div>
                      <div class="flex items-baseline justify-between gap-2 text-sm">
                        <span class="text-base-content/70">Reading time</span>
                        <span class="font-mono tabular-nums" x-text="'~' + textStats.minutes + ' min'"></span>
                      </div>
                    </div>

                    <!-- The two house rules that are decidable here and are
                         checked nowhere else. Zero is the expected reading, so
                         they render quiet and only take an accent when they
                         have something to report.
                         BOTH ARE PROSE RULES, so they are withheld on an app.
                         Measured, and this is not a precaution: the bare-path
                         check reads 186 on the pages gallery and 53 on
                         show-repo, because a file browser listing file names is
                         doing exactly what it should. Reporting those as
                         findings would be the pane's loudest number and its
                         least true one. -->
                    <div x-show="textStats.perRun >= 6">
                    <div class="px-2.5 pt-2 pb-0.5 text-[12px] uppercase tracking-wider text-base-content/50 font-semibold border-t border-base-300/60">House rules</div>
                    <div class="px-2.5 pb-2 space-y-1">
                      <div class="flex items-baseline justify-between gap-2 text-sm">
                        <span class="text-base-content/70">Em dashes</span>
                        <span class="font-mono tabular-nums"
                              :class="textStats.dashes ? 'text-warning font-semibold' : 'text-base-content/40'"
                              x-text="textStats.dashes"></span>
                      </div>
                      <div class="flex items-baseline justify-between gap-2 text-sm">
                        <span class="text-base-content/70" data-note="Path-shaped tokens outside any link">Bare paths</span>
                        <span class="font-mono tabular-nums"
                              :class="textStats.barePaths ? 'text-warning font-semibold' : 'text-base-content/40'"
                              x-text="textStats.barePaths"></span>
                      </div>
                    </div>
                    </div>
                    <div x-show="textStats.perRun < 6"
                         class="px-2.5 py-2 border-t border-base-300/60 text-[12px] text-base-content/50 leading-snug">
                      House rules withheld: em dashes and bare paths are prose checks, and a listing of file
                      names is not prose.
                    </div>

                    <div x-show="textStats.longest" class="border-t border-base-300/60">
                      <div class="px-2.5 pt-2 pb-0.5 text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">
                        Longest sentence <span class="font-mono normal-case tracking-normal text-base-content/40" x-text="textStats.longest + ' words'"></span>
                      </div>
                      <div class="px-2.5 pb-3 text-[13px] text-base-content/70 leading-snug" x-text="textStats.longestText"></div>
                    </div>

                    <!-- MATCH, in two lists that answer two questions.
                         REGISTERED is the primary: which curated, described
                         files this text names, looked up by exact string from
                         about 400 known paths. OTHER PATHS is the leftover
                         regex lane: path-shaped strings nothing has
                         registered, split by whether the repo actually holds
                         them. The order is the confidence order. -->
                    <div class="border-t border-base-300/60">
                      <div class="flex items-center justify-between gap-2 px-2.5 pt-2 pb-0.5">
                        <div class="text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">Registered files named</div>
                        <span x-show="textMatchState === 'loading'" class="loading loading-dots loading-xs text-primary"></span>
                        <!-- template x-if, not x-show. x-show and x-text on one
                             element BOTH evaluate; x-show only toggles display.
                             So a guard written as x-show does not protect the
                             readout beside it, which is the same mistake the
                             app banner made and the reason it is an x-if too. -->
                        <template x-if="textMatchState === 'done' && textMatch">
                          <span class="text-[12px] text-base-content/40"
                                x-text="textMatch.hits.length + ' of ' + textMatch.known"></span>
                        </template>
                      </div>

                      <div x-show="textMatchState === 'error'" class="px-2.5 pb-2 text-[13px] text-error break-words" x-text="textMatchError"></div>

                      <template x-if="textMatchState === 'done' && textMatch">
                        <div>
                          <div x-show="!textMatch.isHub" class="px-2.5 pb-2 text-[12px] text-base-content/50 leading-snug">
                            The registries live in the hub repo, so nothing is looked up for
                            <span class="font-mono" x-text="textMatch.repo"></span>.
                          </div>
                          <div x-show="textMatch.isHub && !textMatch.hits.length" class="px-2.5 pb-2 text-[13px] text-base-content/50 italic">
                            This text names no registered file.
                          </div>

                          <template x-for="h in textMatch.hits" :key="h.path">
                            <div class="border-t border-base-300/40">
                              <div class="flex items-baseline gap-1.5 px-2.5 pt-1.5 min-w-0">
                                <i class="ph ph-check text-success text-[13px] shrink-0"></i>
                                <a :href="h.blob" target="_blank"
                                   class="font-mono text-[13px] truncate min-w-0 link link-hover" x-text="h.path"></a>
                                <span x-show="h.tag" class="text-[11px] uppercase tracking-wide text-base-content/40 shrink-0" x-text="h.tag"></span>
                                <!-- A deployed page's own address is a better
                                     gloss than any sentence about it. -->
                                <a x-show="h.live" :href="h.live" target="_blank"
                                   class="shrink-0 text-[12px] link link-hover text-primary" title="Open the live page">open</a>
                              </div>
                              <div x-show="h.what" class="px-2.5 pb-1.5 pl-[1.9rem] text-[12px] text-base-content/60 leading-snug" x-text="h.what"></div>
                              <div x-show="!h.what" class="px-2.5 pb-1.5 pl-[1.9rem] text-[12px] text-base-content/30 italic leading-snug">
                                registered in <span class="font-mono" x-text="h.from"></span>, with no description
                              </div>
                            </div>
                          </template>

                          <!-- A registry that would not read costs descriptions,
                               not rows. Said out loud, because an absent gloss
                               and a failed fetch rendered identically before
                               and made a broken registry look like a file
                               nobody had bothered to describe. -->
                          <div x-show="textMatch.failed.length" class="px-2.5 py-1.5 border-t border-base-300/40 text-[12px] text-warning leading-snug">
                            Could not read <span class="font-mono" x-text="textMatch.failed.join(', ')"></span>,
                            so anything they describe is missing its description here.
                          </div>

                          <template x-if="textMatch.other.length">
                            <div class="border-t border-base-300/60">
                              <div class="px-2.5 pt-2 pb-0.5 text-[12px] uppercase tracking-wider text-base-content/50 font-semibold">
                                Other paths named
                                <span class="font-mono normal-case tracking-normal text-base-content/40" x-text="textMatch.other.length"></span>
                              </div>
                              <div class="px-2.5 pb-1.5 text-[12px] text-base-content/50 leading-snug">
                                Path-shaped and unregistered. A tick means the repo holds the file at
                                <span class="font-mono" x-text="textMatch.ref"></span>.
                              </div>
                              <!-- A path known NOT to exist is not a link. The
                                   row already says the repo does not hold it,
                                   so offering a tap that lands on a 404 says
                                   the opposite of what the row just said. -->
                              <template x-for="o in textMatch.other" :key="o.path">
                                <a :href="o.exists === false ? null : o.blob"
                                   :target="o.exists === false ? null : '_blank'"
                                   class="flex items-baseline gap-1.5 px-2.5 py-1 border-t border-base-300/40"
                                   :class="o.exists === false ? 'cursor-default' : 'hover:bg-base-200/60'">
                                  <i class="ph text-[13px] shrink-0"
                                     :class="o.exists === true ? 'ph-check text-base-content/40'
                                           : o.exists === false ? 'ph-x text-base-content/30' : 'ph-minus text-base-content/20'"></i>
                                  <span class="font-mono text-[13px] truncate min-w-0"
                                        :class="o.exists === false ? 'text-base-content/40 line-through' : 'text-base-content/70'"
                                        x-text="o.path"></span>
                                  <span x-show="o.exists === false" class="text-[11px] uppercase tracking-wide text-base-content/30 shrink-0">not in repo</span>
                                </a>
                              </template>
                              <div x-show="textMatch.truncated" class="px-2.5 py-1.5 text-[12px] text-warning">
                                The repo tree came back truncated, so a cross here may be the tree's fault.
                              </div>
                            </div>
                          </template>
                        </div>
                      </template>
                    </div>

                    <!-- What this pane deliberately does not do. Named in the
                         UI rather than only in the doc, because an analysis
                         surface that stays silent about its own boundary is
                         read as complete. -->
                    <div class="px-2.5 py-2 border-t border-base-300/60 text-[12px] text-base-content/50 leading-snug">
                      Files only, and no model. The estate keeps no committed vocabulary keyed by the
                      words prose actually uses, so terms of art are not looked up here.
                    </div>
                  </div>
                </template>
              </div>

              <div x-show="activeTab === 'render'" class="min-h-0 flex-1 flex flex-col">
                <div x-show="!path" class="text-sm text-base-content/50 italic px-3 py-6 text-center">
                  No page path detected on this URL.
                </div>
                <template x-if="path">
                  <div class="p-2 flex flex-col gap-2 min-h-0 flex-1">
                    <!-- THE GUIDE: the branch's own account of itself, which is
                         its guide PR body. The list that used to fill this space
                         answered "what other refs exist", a question worth one
                         bar and a dropdown, not a whole tab. This answers "what
                         is this branch, and what should I look at", which is the
                         question you actually have while standing in a preview.
                         The body is written to be that answer (see
                         docs/SURFACING.md), so the fab is reading a document
                         that already exists rather than inventing a report.
                         The links inside it are re-aimed on the way in: a blob
                         link to a page becomes a toss of that page at this ref,
                         a blob link to markdown or data becomes a data-view
                         read. So the guide stops being a list of addresses to
                         copy and becomes the thing it describes, one tap deep. -->
                    <div class="min-h-0 flex-1 flex flex-col">
                      <div class="flex items-center justify-between mb-1 shrink-0">
                        <div class="text-[12px] uppercase tracking-wider opacity-50 font-semibold flex items-center gap-1">
                          Guide
                          <i x-show="branchNote" class="ph ph-key text-warning/80" data-note-bare :data-note="branchNote"></i>
                        </div>
                        <!-- The PR walk. A branch outlives its PR here: a merge
                             ends the PR, the next push opens another, and the
                             merged one's body is often the better account of
                             what the branch did. So the arrows step through
                             every PR the branch has had, newest first, and the
                             pair only appears when there is more than one. -->
                        <div class="flex items-center gap-1 shrink-0">
                          <template x-if="guideCount > 1">
                            <div class="flex items-center gap-0.5">
                              <button @click="stepGuide(1)" :disabled="guideIdx >= guideCount - 1"
                                      class="px-0.5 opacity-50 hover:opacity-100 disabled:opacity-20 transition-opacity"
                                      title="Older PR for this branch" aria-label="Older PR">
                                <i class="ph ph-caret-left text-sm"></i>
                              </button>
                              <span class="text-[11px] font-mono opacity-50 tabular-nums"
                                    x-text="(guideIdx + 1) + '/' + guideCount"></span>
                              <button @click="stepGuide(-1)" :disabled="guideIdx <= 0"
                                      class="px-0.5 opacity-50 hover:opacity-100 disabled:opacity-20 transition-opacity"
                                      title="Newer PR for this branch" aria-label="Newer PR">
                                <i class="ph ph-caret-right text-sm"></i>
                              </button>
                            </div>
                          </template>
                          <a x-show="guidePr" :href="prUrl(guidePr && guidePr.number)" target="_blank"
                             class="text-[12px] link link-hover font-mono"
                             x-text="'#' + (guidePr && guidePr.number) +
                                     (guidePr && guidePr.draft ? ' draft' : '') +
                                     (guidePr && guidePr.state === 'merged' ? ' merged' :
                                      guidePr && guidePr.state === 'closed' ? ' closed' : '')"></a>
                        </div>
                      </div>

                      <div x-show="guideBusy" class="flex justify-center py-3 shrink-0">
                        <span class="loading loading-dots loading-md opacity-50"></span>
                      </div>

                      <div x-show="!guideBusy" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        <template x-if="guidePr">
                          <div class="flex flex-col gap-2">
                            <div class="text-[13px] font-semibold leading-snug" x-text="guidePr.title"></div>

                            <!-- What the body points at, lifted out of it. The
                                 prose still carries every link in place; this
                                 strip is the same set with the prose removed,
                                 for the reader who came to look rather than to
                                 read. Renderable targets only: a chip promising
                                 a render has to deliver one. -->
                            <div x-show="prTargets.length" class="flex flex-wrap gap-1">
                              <template x-for="t in prTargets" :key="t.url">
                                <a :href="t.url" @click.prevent="goTarget(t)" :title="t.title"
                                   class="inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded border border-base-300 bg-base-200/60 hover:border-primary hover:text-primary transition-colors text-[12px] font-mono">
                                  <i class="ph shrink-0 text-sm" :class="t.icon"></i>
                                  <span class="truncate" x-text="t.label"></span>
                                </a>
                              </template>
                            </div>

                            <!-- Styled from kits/guide-render.js at drawer
                                 size, not from a class list here. The rules
                                 that decide whether a body is legible (list
                                 markers, link color, code, pre) are the same
                                 ones the branch page needs, and two copies of
                                 them is how one surface quietly loses its
                                 bullets. The kit carries the reason the
                                 typography plugin is not used.
                                 (No backticks in this comment: the template is
                                 a template literal and one would close it.) -->
                            <div x-show="prBodyHtml" x-html="prBodyHtml"
                                 @click="onGuideClick($event)"
                                 :class="guideBodyClass"></div>
                            <div x-show="!prBodyHtml && guidePr.body" class="text-[12px] opacity-50">Rendering…</div>
                            <div x-show="!guidePr.body" class="text-[12px] opacity-50 italic">This PR has an empty body.</div>
                          </div>
                        </template>

                        <!-- No PR, and still not blank. Two different nothings,
                             and conflating them would misreport: the default
                             branch is not missing a guide, it is the thing
                             guides are written against. Either way the STANDING
                             INFO below is shown, which is where the version chip
                             went: what commit this ref is at, which PR that code
                             came from, and how long ago. On the default branch
                             that is the only version question anyone has, and it
                             is the branch this pane is emptiest for. -->
                        <div x-show="!guidePr" class="flex flex-col gap-2 text-[13px]">
                          <!-- No prose. A ref with no PR says so in one chip; the
                               default branch says nothing, since the standing card
                               below is its whole answer. -->
                          <div x-show="viewingRef !== (defaultBranch || 'main')" class="text-[12px] font-mono opacity-50">no pull request</div>

                          <div x-show="ver" class="flex flex-col gap-1 rounded border border-base-300/70 bg-base-200/40 px-2 py-1.5">
                            <div class="flex items-center gap-1.5 text-[12px] font-mono">
                              <i class="ph ph-git-commit opacity-50 shrink-0"></i>
                              <a :href="ver && ver.tipUrl" target="_blank" rel="noopener"
                                 class="link link-hover font-semibold" x-text="'@' + (ver && ver.sha)"></a>
                              <template x-if="ver && ver.pr">
                                <a :href="ver.prUrl" target="_blank" rel="noopener"
                                   class="link link-hover text-primary shrink-0"
                                   :title="ver.prTitle || ('pull request #' + ver.pr)"
                                   x-text="'from #' + ver.pr"></a>
                              </template>
                              <span x-show="ver && ver.ago" class="opacity-40 truncate ml-auto" x-text="ver && ver.ago"></span>
                            </div>
                            <div x-show="ver && ver.since > 0" class="text-[11px] opacity-50 pl-4"
                                 x-text="'+' + (ver && ver.since) + ' commits since that merge'"></div>
                          </div>
                          <!-- THE PAGE ITSELF: when this file last moved on this
                               ref, which the tip above cannot say. One commits read
                               filtered by path (loadPageLast). -->
                          <div x-show="pageLast" class="flex items-center gap-1.5 text-[12px] font-mono rounded border border-base-300/70 bg-base-200/40 px-2 py-1.5 min-w-0">
                            <i class="ph ph-file-text opacity-50 shrink-0"></i>
                            <a :href="pageLast && pageLast.url" target="_blank" rel="noopener"
                               class="link link-hover font-semibold shrink-0" x-text="'@' + (pageLast && pageLast.sha)"></a>
                            <span class="truncate opacity-70 font-sans min-w-0" :title="pageLast && pageLast.subject" x-text="pageLast && pageLast.subject"></span>
                            <span x-show="pageLast && pageLast.ago" class="opacity-40 shrink-0 ml-auto" x-text="pageLast && pageLast.ago"></span>
                          </div>
                          <!-- Other versions, once the dropdown's scan has run; the
                               caret in the ref bar is what runs it. -->
                          <button x-show="pageBranchesLoaded && otherVersions.length" @click="toggleRefMenu()"
                                  class="self-start inline-flex items-center gap-1.5 px-2 py-1 rounded border border-base-300 hover:border-primary hover:text-primary transition-colors text-[12px]">
                            <i class="ph ph-git-branch"></i>
                            <span x-text="otherVersions.length + (otherVersions.length === 1 ? ' branch carries' : ' branches carry') + ' another version'"></span>
                          </button>
                          <div x-show="verLoading" class="text-[12px] opacity-50">checking version…</div>
                          <div x-show="verError" class="text-[12px] text-error/70 break-all" x-text="verError"></div>

                          <div class="flex flex-wrap gap-1">
                            <a x-show="viewingRef !== (defaultBranch || 'main')"
                               :href="branchPageUrl" target="_blank" rel="noopener"
                               class="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-base-300 hover:border-primary hover:text-primary transition-colors text-[12px]">
                              <i class="ph ph-git-branch"></i><span>Branch page</span>
                            </a>
                            <button @click="loadVersion(true)"
                                    class="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-base-300 hover:border-primary hover:text-primary transition-colors text-[12px]">
                              <i class="ph ph-arrows-clockwise"></i><span>Recheck</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div x-show="frameError" class="text-[12px] text-error font-mono break-all shrink-0" x-text="frameError"></div>

                    <!-- The take grid. These were behind a dropdown, which put
                         the page's most-used outputs two taps away and hid them
                         from anyone who did not know to look. They are laid out
                         in the open now, two to a row, still grouped by what the
                         action DOES to you: one copies to the clipboard, one
                         navigates away, two land a file. The group heading is
                         what lets each label stay a bare noun, so it earns its
                         line. Page-contributed actions fold into the same grid
                         rather than keeping a row of their own. -->
                    <!-- pb clears the launcher, which floats over the drawer at
                         bottom-right and is the only way to close it, so it cannot
                         be hidden. It used to overlap the single "Take this page"
                         button harmlessly; over a grid it would cover a real
                         action. Sized for the launcher at its default corner: drag
                         it elsewhere and this is just padding. -->
                    <div class="border-t border-base-300/60 pt-2 pb-10 flex flex-col gap-1.5 shrink-0">
                      <div class="flex items-baseline gap-1.5 px-0.5">
                        <span class="text-[12px] uppercase tracking-wider opacity-40 font-semibold shrink-0">Take</span>
                        <span class="text-[12px] font-mono opacity-70 truncate" :data-note="takeDetail" x-text="takeSubject"></span>
                        <span x-show="outBusy" class="loading loading-spinner loading-xs ml-auto shrink-0"></span>
                      </div>
                      <!-- A row per destination: the gutter says what happens to
                           you, the buttons say what you get. That is the same
                           division the old headings made, laid sideways so it
                           costs a gutter instead of a line, and it lets each
                           label drop back to a bare noun (HTML, LLM, Link)
                           without going cryptic. -->
                      <template x-for="g in takeGrid" :key="g.kind">
                        <div class="flex items-center gap-1.5">
                          <span class="w-10 shrink-0 text-[10px] uppercase tracking-wide opacity-40 font-semibold"
                                x-text="g.kind"></span>
                          <div class="flex-1 min-w-0 flex gap-1">
                            <template x-for="a in g.items" :key="a.key">
                              <!-- The header above states the subject once,
                                   which is what lets a label stay a bare noun.
                                   In a toss that leaves one ambiguity: the
                                   drawer carries the subject's contributed
                                   actions AND this renderer's, and both may say
                                   "Link". The subject's are congruent with the
                                   stated subject and need no mark; the
                                   renderer's are the odd ones out, so they get
                                   the mark. A word ("shell") was tried and is
                                   too wide: a Copy row with four buttons in a
                                   fixed-width drawer truncated "Link" to "L" to
                                   make room for it. The stacked-windows glyph is
                                   the surrounding renderer, costs one icon, and
                                   only ever appears in a toss, where a second
                                   same-named row is there to compare it against.
                                   The desc says it in full for anything with a
                                   pointer. -->
                              <button @click="runGridItem(a)" :title="a.desc"
                                      :class="outBusy && 'pointer-events-none opacity-60'"
                                      class="btn btn-xs btn-ghost bg-base-200 hover:bg-base-300 flex-1 min-w-0 gap-1 font-normal px-1.5">
                                <i class="ph shrink-0 text-sm opacity-60" :class="a.icon"></i>
                                <span class="truncate" x-text="a.label"></span>
                                <i x-show="viaToss && a.side === 'shell'"
                                   class="ph ph-browsers shrink-0 text-xs opacity-40"></i>
                              </button>
                            </template>
                          </div>
                        </div>
                      </template>
                    </div>
                      <div x-show="outMsg" class="text-[12px] text-success font-mono break-all" x-text="outMsg"></div>
                      <div x-show="outError" class="text-[12px] text-error font-mono break-all" x-text="outError"></div>
                    </div>
                  </template>
                </div>
              </div>

            <div class="shrink-0 border-t border-base-300 flex flex-col">
              <div @click="toggleConsole()" role="button" tabindex="0"
                   class="flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer select-none hover:bg-base-200/60 transition-colors">
                <div class="flex items-center gap-1.5 text-sm font-semibold text-base-content/70">
                  <i class="ph ph-terminal text-base"></i>
                  <span>Console</span>
                  <span x-show="errorCount" x-text="errorCount"
                        class="inline-flex items-center justify-center text-[11px] font-bold leading-none rounded-full bg-error text-error-content px-1 min-w-[14px]"></span>
                  <span x-show="consoleLogs.length" class="font-mono text-[12px] opacity-50" x-text="consoleLogs.length"></span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button x-show="consoleOpen && consoleLogs.length" @click.stop="clearConsole()" class="btn btn-ghost btn-xs btn-square" title="Clear console" aria-label="Clear console">
                    <i class="ph ph-trash"></i>
                  </button>
                  <i class="ph text-base-content/40" :class="consoleOpen ? 'ph-caret-down' : 'ph-caret-up'"></i>
                </div>
              </div>
              <div x-show="consoleOpen" class="border-t border-base-300/60 flex flex-col" style="max-height: 40vh;">
                <div x-show="consolePanelReady" class="flex-1 min-h-0 flex flex-col">
                  <div x-ref="consoleHost" class="flex-1 min-h-0 flex flex-col"></div>
                </div>
                <div x-show="!consolePanelReady" id="__fab-console-panel" class="overflow-y-auto overscroll-contain p-1 flex flex-col gap-0.5" style="max-height: 40vh;">
                  <div x-show="consoleLogs.length === 0" class="text-sm text-base-content/50 italic px-3 py-6 text-center">No console output captured.</div>
                  <template x-for="(entry, idx) in consoleLogs" :key="idx">
                    <div class="flex gap-1.5 items-baseline px-1.5 py-0.5 rounded border-l-2 font-mono text-[13px] text-base-content"
                         :class="entry.level === 'error' ? 'border-error bg-error/10' :
                                 entry.level === 'warn'  ? 'border-warning bg-warning/10' :
                                                           'border-base-300 bg-base-100'">
                      <span class="text-base-content/30 shrink-0 text-[12px]" x-text="fmtTime(entry.time)"></span>
                      <span class="shrink-0 w-8 text-[12px] uppercase font-bold"
                            :class="entry.level === 'error' ? 'text-error' : entry.level === 'warn' ? 'text-warning' : 'text-base-content/40'"
                            x-text="entry.level"></span>
                      <span class="break-all whitespace-pre-wrap" x-text="entry.msg"></span>
                    </div>
                  </template>
                </div>
              </div>
            </div>
            </div>
          </template>

          </div>
        </div>`,

      x: 0, y: 0, sx: 0, sy: 0,
      down: false, dragged: false,

      open: false,
      // Whether alpineComponents/path-picker.js has registered. The Render
      // tab's path control is gated on it; see the mount for why the gate is an
      // x-if rather than an x-show.
      pickerReady: false,
      // Latched by the first open: the drawer's body (the 121 KB of template
      // under the launcher, ~330 bindings, a nested path picker) is not built
      // until then. Every page carries the launcher; few open the drawer.
      opened: false,
      // The launcher's long-press / right-click menu, which is a way INTO the
      // annotator rather than a second copy of the drawer, plus whatever the
      // page contributes to it (pageMenu, filled by readPageMenu on open).
      fabMenu: false,
      pageMenu: [],
      // The kind row for whatever the annotator would mark, or null. Read at
      // menu-open time beside pageMenu and for the same reason: the answer can
      // change under one page load (a deck slide renders and declares), so a
      // value settled at mount would be wrong by the first swipe.
      annKind: null,
      consoleOpen: false,
      consolePanelReady: false,
      activeTab: 'render',

      // The tab strip, as data. `on` is the tab's opening side effect, named
      // rather than inlined at the button, so the strip's markup stays one
      // template and adding a tab is one row here plus one pane below.
      // ORDER IS THE READING ORDER, and it is not arbitrary: the first three
      // describe how the page was DELIVERED (what it renders from, what it
      // loaded, what that cost), and the last operates on what it SAYS. Notes
      // was the fifth and the write half of that pair; it moved into the
      // annotate card on 2026-08-25, since the card grew somewhere to READ a
      // set and a second surface for one view is the copy that ages.
      TABS: [
        { key: 'render',  label: 'Render',  icon: 'ph-monitor-play',     on: 'loadGuide' },
        { key: 'inspect', label: 'Inspect', icon: 'ph-magnifying-glass', on: 'detect' },
        { key: 'traffic', label: 'Traffic', icon: 'ph-arrows-down-up',   on: 'refreshTraffic' },
        { key: 'text',    label: 'Text',    icon: 'ph-text-aa',          on: 'textScan' },
      ],

      setTab(key) {
        this.activeTab = key;
        const t = this.TABS.find(x => x.key === key);
        if (t && typeof this[t.on] === 'function') this[t.on]();
      },

      // The strip's one label. A getter rather than a second piece of state,
      // so it cannot fall out of step with activeTab, which is the failure a
      // stored copy invites and the reason the slot exists at all.
      get tabLabel() {
        return (this.TABS.find(t => t.key === this.activeTab) || {}).label || '';
      },

      // Text tab. The READ operation only: what is decidable from the rendered
      // document with no network and no model. Everything costlier (matching
      // terms against the registries, flagging undeclared vocabulary, handing
      // the text to a model) is deliberately absent rather than stubbed, so
      // this pane never shows a number it cannot stand behind. The design and
      // what the estate's own measurements rule out are in docs/text-tools.md.
      //
      // The subject is the RENDERED text, which is the one body nothing else in
      // the estate can reach: every other instrument takes a corpus or a paste.
      // On a page that is an app rather than a document the figures describe a
      // toolbar, so the pane says so instead of reporting a word count nobody
      // should trust. THE DISCRIMINATOR IS MEAN WORDS PER TEXT RUN, and it was
      // picked by measurement rather than by taste. The first attempt was the
      // share of words sitting in buttons, links and labels, which does not
      // work: measured across six fab-bearing pages it put annotate (the most
      // document-like) at 2% and data-view (an app) at 9%, inverting the thing
      // it was supposed to separate. Words per run separates cleanly, because
      // an app's text arrives as thousands of one-to-three-word labels while a
      // document's arrives as sentences:
      //
      //   links 1.1 · data-view 3.0 · show-repo 4.0 · index 5.0    (apps)
      //   annotate 8.3 · shorter 20.0                              (prose)
      //
      // So the gate is 6, in the gap. Chrome share is still counted, as the
      // denominator on the word row, where a share is honest; it is simply not
      // load-bearing. The sample is small and covers only pages that mount a
      // fab (word-select, transform and console-playground load no lib chain,
      // so they have none), which is the honest limit of the calibration.
      textStats: null, textScanned: false, textScope: 'page',

      // Reused across scans so a re-scan does not re-walk what has not changed
      // is NOT claimed here: the walk is a few milliseconds and the DOM moves
      // under a reactive page, so every scan is a fresh read. Said out loud
      // because a cache here would be the tempting wrong optimization.
      //
      // A LIVE SELECTION IS THE SUBJECT when there is one. That is the reading
      // this tab is for: "what about this passage", asked of the passage in
      // front of you rather than of the whole document, which is the question
      // every other instrument in the estate already answers badly by taking a
      // corpus. A selection made AFTER the tab is open needs a rescan, which is
      // what the header's refresh button on this tab is for; the scan cannot
      // watch selectionchange without arming a listener on someone's page for
      // a tab they may only be glancing at.
      textScan() {
        const { root, scope } = this.textRoot();
        this.textScope = scope;
        this.textStats = this._textRead(root);
        this.textScanned = true;
        // Match runs with the read, not behind a button. It was gated at first
        // because it costs calls, and a tap is the wrong way to charge for
        // that: it hides the answer behind a decision nobody has the
        // information to make, since you cannot tell whether a page names
        // anything registered until you have looked. The reads cache per repo
        // and ref, so the cost lands once a session and the readout counts it.
        // Not awaited: the local figures render immediately and the list fills
        // in under them.
        this.textMatchRun();
      },

      // Cloned rather than held as a Range: a live Range keeps the page's own
      // nodes alive and moves under a reactive re-render, and all this needs is
      // the text that was highlighted at the moment of the tap. Cleared when
      // there is nothing selected, so a later tap cannot resurrect an old
      // passage the reader has moved on from.
      _selSnap: null,

      _grabSelection() {
        this._selSnap = null;
        try {
          const doc = this.textDoc();
          const sel = (doc.defaultView || window).getSelection();
          if (sel && sel.rangeCount && !sel.isCollapsed) {
            const frag = sel.getRangeAt(0).cloneContents();
            if ((frag.textContent || '').trim()) this._selSnap = frag;
          }
        } catch { /* a cross-origin or detached view has no selection to read */ }
      },

      // The read's subject: the selection if there is one, the document body
      // otherwise. A LIVE selection wins, since a reader who selected something
      // with the drawer already open means that one; the snapshot taken at the
      // opening tap is the fallback and is the case that actually happens. A
      // collapsed selection is a caret rather than a subject, and an empty
      // fragment is nothing, so both fall through instead of reporting a
      // document of zero words.
      textRoot() {
        const doc = this.textDoc();
        try {
          const sel = (doc.defaultView || window).getSelection();
          if (sel && sel.rangeCount && !sel.isCollapsed) {
            const frag = sel.getRangeAt(0).cloneContents();
            if ((frag.textContent || '').trim()) return { root: frag, scope: 'selection' };
          }
        } catch { /* as above */ }
        if (this._selSnap) return { root: this._selSnap, scope: 'selection' };
        return { root: doc.body, scope: 'page' };
      },

      // The same aim openAnnotate() takes, for the same reason: in a readable
      // #gh= toss the document worth reading is the SUBJECT's, not this
      // shell's. A #gz= sandbox is opaque, so the shell is all there is, and
      // the pane says which one it read rather than leaving the reader to
      // guess why the numbers describe a renderer.
      textDoc() {
        if (this.viaToss && this.subjectReached && window.__tossFrame) {
          try { return window.__tossFrame.contentWindow.document; } catch { /* cross-origin */ }
        }
        return document;
      },

      // Pure enough to test: takes a root, returns the figures. Kept off the
      // annotate kit because that kit's index exists to anchor quotes and skips
      // nothing this needs to skip differently; if a third reader turns up, the
      // shared walk graduates to a kit rather than growing a flag.
      //
      // A DOCUMENT IS ACCEPTED AS A ROOT and resolved to its body, because the
      // two callers hand it different things: textScan() passes a body or a
      // cloned selection fragment, and the tests pass a whole document, which
      // is the shape a reader writing one would reach for.
      _textRead(input) {
        if (!input) return null;
        const root = input.nodeType === 9 ? input.body : input;
        if (!root || !root.nodeType) return null;
        // A fragment has no ownerDocument of its own worth trusting for the
        // walker on every engine, so fall back to this realm's.
        const doc = root.ownerDocument || input.ownerDocument || document;
        if (!doc.createTreeWalker) return null;
        const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
        // Interactive and label-bearing elements are the page's CHROME. Counted
        // separately rather than excluded, because their share is the signal
        // that decides whether the rest of the pane means anything.
        const CHROME = new Set(['BUTTON', 'A', 'LABEL', 'SUMMARY', 'OPTION', 'TH', 'NAV']);
        const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, {
          acceptNode: (n) => {
            for (let el = n.parentElement; el && el !== root; el = el.parentElement) {
              if (SKIP.has(el.tagName) || el.hasAttribute('data-annotate-ui')
                  || el.closest?.('[x-data^="fab"]') === el) return 2 /* REJECT */;
            }
            return 1 /* ACCEPT */;
          },
        });
        // Text runs join with a SPACE inside one block and a NEWLINE between
        // blocks, and the difference decides whether "longest sentence" means
        // anything. Joining every run with a newline splits a sentence that
        // merely contains an <a> or a <code>, which is most of this estate's
        // prose; joining every run with a space runs a table's cells together
        // into one paragraph-long pseudo-sentence, because a cell carries no
        // terminal punctuation for the splitter to find.
        //
        // Measured live on docs/text-tools.md rendered through the data route,
        // which is a document full of tables: the pane reported a "longest
        // sentence" of stitched-together cells, "EstateSearch.tree(repo, ref),
        // already cached per repo and ref this names a real file; here it is a
        // declared doc, 51 rows what that document is". Visibly wrong, and
        // wrong in the direction that flatters the number.
        let body = '', chrome = 0, runs = 0, n, prevBlock = null;
        while ((n = walker.nextNode())) {
          if (!n.data.trim()) continue;
          let isChrome = false;
          for (let el = n.parentElement; el && el !== root; el = el.parentElement) {
            if (CHROME.has(el.tagName)) { isChrome = true; break; }
          }
          if (isChrome) { chrome += this._words(n.data); continue; }
          // Whitespace inside a run collapses first, so the newline can mean
          // exactly one thing: a block boundary. Source formatting puts real
          // newlines inside a single text node ("of\n  them runs"), and
          // splitting on those cut sentences in half.
          const block = this._block(n, root);
          if (body) body += (block === prevBlock ? ' ' : '\n');
          body += n.data.replace(/\s+/g, ' ').trim();
          prevBlock = block;
          runs++;
        }
        const words = this._words(body);
        // A block boundary ends a sentence whether or not it is punctuated,
        // which is what a heading, a list item and a table cell all need.
        const sentences = body.split(/(?<=[.!?])\s+|\n/).map(s => s.trim()).filter(s => this._words(s) > 2);
        const longest = sentences.reduce((a, s) => (this._words(s) > this._words(a) ? s : a), '');
        // The two house-rule checks that are decidable from the text alone.
        // The em-dash rule is stated in docs/CONVENTIONS.md and enforced by
        // nothing in this repo; the bare-path check is the surfacing set's own
        // first primitive, Reference is a link, which nothing has ever checked
        // on a rendered page. A path inside an <a> is already a link, so only
        // the ones outside one count.
        const dashes = (body.match(/—/g) || []).length;
        const { bare: barePaths, named } = this._paths(doc, root);
        return {
          // The joined text itself, because Match searches it for known
          // strings rather than re-walking the DOM. One read, two consumers.
          body,
          words, chrome, runs, named,
          perRun: runs ? words / runs : 0,
          chromeShare: words + chrome ? chrome / (words + chrome) : 0,
          sentences: sentences.length,
          avg: sentences.length ? Math.round(words / sentences.length) : 0,
          longest: this._words(longest), longestText: longest.slice(0, 220),
          minutes: Math.max(1, Math.round(words / 220)),
          dashes, barePaths,
        };
      },

      _words(s) { return (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length; },

      // The nearest block-level ancestor of a text node, or the root. A tag
      // list rather than getComputedStyle, because the read also runs over a
      // cloned selection fragment, which is not in any document and therefore
      // has no computed style to ask for. The list only has to be right about
      // what ends a sentence, so it leans inclusive: a cell, a list item and a
      // heading each end one, and a <span> or an <em> never does.
      _block(node, root) {
        const BLOCK = new Set(['P', 'DIV', 'LI', 'TD', 'TH', 'TR', 'PRE', 'BLOCKQUOTE',
          'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN',
          'HEADER', 'FOOTER', 'FIGURE', 'FIGCAPTION', 'DT', 'DD', 'CAPTION']);
        for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
          if (BLOCK.has(el.tagName)) return el;
        }
        return root;
      },

      // Path-shaped tokens, in one walk, split two ways because the two answers
      // want opposite treatment of the same token:
      //
      //   bare   a path OUTSIDE any link and outside code. The house-rule count:
      //          "Reference is a link" is broken exactly here. A path in a code
      //          span is a citation rather than a reference, so it is not a
      //          violation and does not count.
      //   named  every path the text mentions, code spans INCLUDED, since a
      //          file named in a code span is still a file this page is about
      //          and is exactly what Match should resolve and link.
      //
      // The regex is deliberately narrow: two or more segments and a file
      // extension, so "and/or", a bare "docs", and a decimal never qualify.
      // Both are candidates, not verdicts. Resolving them is Match's job.
      _paths(doc, root) {
        const named = new Set();
        let bare = 0, n;
        const walker = doc.createTreeWalker(root, 4, null);
        while ((n = walker.nextNode())) {
          const el = n.parentElement;
          if (el?.closest('[x-data^="fab"], [data-annotate-ui]')) continue;
          const hits = this._pathTokens(n.data);
          if (!hits.length) continue;
          hits.forEach(h => named.add(h.path));
          if (!el?.closest('a, code, pre')) bare += hits.length;
        }
        return { bare, named: [...named].sort() };
      },

      // Path-shaped tokens in one string, with the noise dropped. ONE
      // implementation, because the house-rule count and the unregistered lane
      // were briefly using different rules and the count overstated: measured
      // on a page carrying one CDN import, Bare paths read 6 where the lane
      // listed 2, and the difference was entirely URL tails.
      //
      // Two exclusions, both from reading real output. A candidate preceded by
      // '//' is a URL's path. A candidate whose first segment is all digits is
      // a CDN version tail: 'daisyui@5/themes.css' yields '5/themes.css',
      // because '@' ends the preceding segment. Extensions may carry digits,
      // since the noise that admitted is handled by these two instead.
      PATH_RE: /\b[\w.-]+\/[\w./-]+\.[a-z][a-z0-9]{1,4}\b/g,

      _pathTokens(text) {
        const out = [];
        const re = new RegExp(this.PATH_RE.source, 'g');
        let m;
        while ((m = re.exec(text))) {
          if (text.slice(0, m.index).endsWith('//')) continue;
          if (/^\d+\//.test(m[0])) continue;
          out.push({ path: m[0], at: m.index });
        }
        return out;
      },

      // ── Match ─────────────────────────────────────────────────────────────
      // Which REGISTERED files this text names, and which other paths it names
      // that nothing has registered.
      //
      // THE OPERATION RUNS FROM THE REGISTRY, NOT FROM THE TEXT, and that is a
      // correction. The first build did the opposite: guess at path-shaped
      // strings with a regular expression, then ask the repo whether each
      // guess was real, then decorate the survivors from a registry. That
      // inverts the only part of the problem that is actually known. The
      // registered set is finite, curated and exact, so it is the input: about
      // 400 strings to look for, rather than a pattern to hope at.
      //
      // What the inversion buys, measured against the same page:
      //   no URL noise. `https://example.com/a/b.html` is path-shaped and was
      //     a candidate; it is not in the set, so it is never generated.
      //   root-level files become reachable. CLAUDE.md, README.md,
      //     package.json and package-lock.json are all registered and were all
      //     invisible, because the pattern needs a slash to fire at all.
      //   extensions with digits (.mp3, .py3) stop being invisible for the
      //     same reason: nothing is being pattern-matched.
      //   five registries instead of three, so pages/ and the portable set
      //     carry glosses too.
      //
      // THE REGEX LANE SURVIVES, demoted to its honest job: paths the text
      // names that the registry does NOT know. That is the second question,
      // and it is worth asking, since an unregistered file is either a gap in
      // the registries or a reference to something that does not exist. Only
      // that lane needs the repo tree, and only to tell those two apart.
      //
      // NO BUTTON. Both lanes run when the tab opens. The reads are cached per
      // repo and ref for the session, so the cost is paid once and the drawer's
      // readout counts it like every other call.
      textMatch: null, textMatchState: 'idle', textMatchError: '',
      _regCache: {},          // "repo@ref" -> { known: Map, failed: [paths] }

      // The registries keyed by path, and the field in each that says what a
      // row IS. Data rather than branches, so adding one is a row. `live` gives
      // a deployed URL, which is the one gloss better than a description.
      // data/design/content.csv is deliberately absent: its locators are often
      // directories rather than files, and its description classifies how
      // content was made rather than saying what the file is.
      MATCH_REGISTRIES: [
        { path: 'docs/docs.csv',     key: 'path', what: 'subject',  tag: 'status' },
        { path: 'docs/tests.csv',    key: 'path', what: 'protects', tag: 'kind' },
        { path: 'docs/harness.csv',  key: 'path', what: 'role',     tag: 'layer' },
        { path: 'docs/portable.csv', key: 'path', what: 'role',     tag: 'kind' },
        { path: 'pages/pages.csv',   key: 'href', what: 'note',     tag: '',
          prefix: 'pages/', alt: 'title',
          live: 'https://mehrlander.github.io/web-tools/pages/' },
      ],

      async textMatchRun() {
        if (this.textMatchState === 'loading') return;
        const body = (this.textStats && this.textStats.body) || '';
        if (!body) { this.textMatch = null; this.textMatchState = 'idle'; return; }

        this.textMatchState = 'loading';
        this.textMatchError = '';
        try {
          const repo = this.repo;
          if (!repo) throw new Error('No repo detected for this page, so there is nothing to look up.');
          const ref = this.takeRef || 'HEAD';
          const isHub = repo === 'mehrlander/web-tools';

          // Lane 1: the registered set, looked up by exact string.
          const { known, failed } = isHub ? await this._registered(repo, ref) : { known: new Map(), failed: [] };
          const { hits, spans } = this._findKnown(body, known);

          // Lane 2: path-shaped strings the registry does not know.
          const other = this._unregistered(body, spans, known);

          // Only that lane needs the tree, and only to tell a real-but-
          // unregistered file from a reference to nothing.
          let truncated = false;
          if (other.length) {
            try {
              if (!window.EstateSearch) {
                await window.gh.load('kits/estate-search.js', { by: 'alpineComponents/fab.js' });
              }
              if (!window.EstateSearch) throw new Error('kits/estate-search.js registered nothing');
              const tree = await window.EstateSearch.tree(repo, ref, window.TOKEN || '');
              const set = new Set(tree.paths);
              truncated = !!tree.truncated;
              for (const o of other) o.exists = set.has(o.path);
            } catch (e) {
              // The tree is the optional half now. Losing it costs the
              // exists/does-not-exist split, not the answer.
              for (const o of other) o.exists = null;
              this.textMatchError = `paths not checked against the tree: ${e.message || e}`;
            }
          }

          for (const h of hits) h.blob = this._blobUrl(repo, ref, h.path);
          for (const o of other) o.blob = this._blobUrl(repo, ref, o.path);
          this.textMatch = { hits, other, failed, truncated, isHub, ref, repo, known: known.size };
          this.textMatchState = 'done';
        } catch (e) {
          this.textMatchError = e.message || String(e);
          this.textMatchState = 'error';
        }
      },

      _blobUrl(repo, ref, path) {
        return `https://github.com/${repo}/blob/${encodeURIComponent(ref)}/${path}`;
      },

      // path -> { what, tag, from, live }, plus the registries that would not
      // read. `failed` is reported rather than swallowed: an absent gloss and a
      // failed fetch used to render identically, which made a broken registry
      // look like a file nobody had described.
      async _registered(repo, ref) {
        const ck = repo + '@' + ref;
        if (this._regCache[ck]) return this._regCache[ck];
        const known = new Map(), failed = [];
        const gh = new window.GH({ token: window.TOKEN || '', repo, ref });
        await Promise.all(this.MATCH_REGISTRIES.map(async (r) => {
          try {
            // Every carrier here is a CSV, so one reader covers all five and a
            // new one is a row rather than a shape. It was JSON.parse against
            // five nested shapes until 2026-08-18, and each carrier that became
            // a CSV silently joined `failed` instead of being read.
            const rows = window.Csv.rows((await gh.get(r.path)).text);
            for (const row of rows) {
              const k = row[r.key];
              if (!k) continue;
              const full = (r.prefix || '') + k;
              if (known.has(full)) continue;          // first registry to claim a path wins
              known.set(full, {
                what: row[r.what] || (r.alt ? row[r.alt] : '') || '',
                tag: r.tag ? (row[r.tag] || '') : '',
                from: r.path,
                live: r.live ? r.live + k : '',
              });
            }
          } catch { failed.push(r.path); }
        }));
        const out = { known, failed };
        this._regCache[ck] = out;
        return out;
      },

      // Exact-string search for each registered path, longest first so a
      // nested path claims its span before a shorter one inside it can.
      // Boundaries: the character before must not continue a name, and the
      // character after must not either, which is what keeps `docs/loader.md`
      // from firing inside `docs/loader.mdx`. A trailing '.' is allowed,
      // because a path at the end of a sentence is the common case.
      _findKnown(body, known) {
        const paths = [...known.keys()].sort((a, b) => b.length - a.length);
        const spans = [];
        const hits = [];
        const taken = (from, to) => spans.some(s => from < s[1] && to > s[0]);
        for (const p of paths) {
          let i = body.indexOf(p), found = false;
          while (i !== -1) {
            const before = i ? body[i - 1] : '';
            const after = body[i + p.length] || '';
            if (!/[\w.-]/.test(before) && !/[\w/-]/.test(after) && !taken(i, i + p.length)) {
              spans.push([i, i + p.length]);
              found = true;
            }
            i = body.indexOf(p, i + p.length);
          }
          if (found) hits.push({ path: p, ...known.get(p) });
        }
        hits.sort((a, b) => a.path.localeCompare(b.path));
        return { hits, spans };
      },

      // The regex lane, now scoped to what the registry does not know.
      // Two exclusions the first build lacked, both from reading its own
      // output: a candidate preceded by '//' is a URL's path, and a candidate
      // whose first segment is all digits is a CDN version tail
      // ('daisyui@5/themes.css' yielded '5/themes.css'). Extensions may carry
      // digits now, since the noise those admitted is handled here instead.
      _unregistered(body, spans, known) {
        const seen = new Set(), out = [];
        for (const { path: p, at } of this._pathTokens(body)) {
          if (spans.some(s => at < s[1] && at + p.length > s[0])) continue;   // already a registered hit
          if (known.has(p) || seen.has(p)) continue;
          seen.add(p);
          out.push({ path: p, exists: null });
        }
        return out.sort((a, b) => a.path.localeCompare(b.path));
      },

      groups: [],
      _modeTick: 0,   // forces pageToggles to repaint after a set (see pageToggles)
      consoleLogs: [],
      loadedScripts: [],
      highlighted: null,

      // Traffic. trafBoot/trafGroups are snapshots taken when the tab opens or
      // on the refresh button; the readout strip is the one live figure, driven
      // by the coalesced 'traffic' event so a crawl does not re-render the
      // drawer a hundred times a second.
      trafBoot: null, trafBootGroups: [], trafRowsOpen: false,
      trafGroups: [], trafTotals: null, trafTrimmed: 0,
      trafRate: null, trafReset: '', trafStores: [], trafEstimate: 0,
      trafDbs: [], trafStoreOpen: false,
      // Which cut of the API ledger the list is showing: what was called, or
      // where it landed.
      trafCut: 'endpoint', trafRepos: [],
      trafficError: '', trafLive: { calls: 0, wire: 0 },
      // In a toss: whether the bands describe the tossed subject (its frame was
      // readable) and what the shell around it cost, so the caveat line can say
      // which of the two the numbers belong to.
      trafSubject: false, trafShellWire: 0,
      // path -> { bytes, inlined } from gh-boot's get() wrapper, for the size
      // chip on the Scripts rows. Kept per side, like the registries.
      ghFiles: {}, subjectFiles: {},

      ver: null, verLoading: false, verError: '', verLoaded: false,

      frameRef: 'main',
      // The shape the view is rendered at, in CSS px, 0 being the device's own.
      // Four presets and no free field: the useful question is "does this hold
      // up as a phone / as a desktop", which three fixed widths answer, and a
      // number box would invite tuning a width until the layout passes.
      // The numbers are Tailwind's own breakpoints plus a common phone, so each
      // one lands in the middle of a band rather than on its edge, where a page
      // is ambiguous about which rules apply: 390 is under sm (640), 820 is
      // between md (768) and lg (1024), 1280 is xl exactly, the width the widest
      // rules are written for.
      frameWidth: 0,
      WIDTHS: [
        { w: 0,    label: 'Actual',  icon: 'ph-arrows-out-line-horizontal' },
        { w: 390,  label: 'Phone',   icon: 'ph-device-mobile' },
        { w: 820,  label: 'Tablet',  icon: 'ph-device-tablet' },
        { w: 1280, label: 'Desktop', icon: 'ph-monitor' },
      ],
      pageBranches: [], pageBranchesLoading: false, pageBranchesLoaded: false,
      showAllBranches: false, _branchGh: null,
      defaultBranch: 'main', branchNote: '',
      // Does the subject's repo serve GitHub Pages? null until asked, which
      // liveTwin reads as "assume yes": the behavior every Pages-served page had
      // before the question existed.
      subjectPages: null,
      // The frame stack this document sits at the top of, outermost first, and
      // which of its layers the drawer is describing. Derived, never
      // remembered: see readLayers.
      layers: [], layerIndex: 0, _layerPick: null,
      frameError: '',

      // The ref bar's dropdown, and the guide pane's rendered body. prBodyFor
      // records which PR the rendered html belongs to, so the render runs once
      // per PR rather than on every reactive read.
      refMenu: false, ghMenu: false, ghRowsTick: 0,
      prBodyHtml: '', prBodyFor: null, prTargets: [], prTargetsByAddr: {},
      // Every PR ever opened for the shown branch, and which one the arrows are
      // parked on. _prsFor records the branch the list belongs to, so a ref
      // switch invalidates it without a watcher.
      prHistory: [], _prsFor: '', _prsBusy: false, guideIdx: 0,
      pageLast: null,   // { sha, url, subject, ago }: the last commit touching this file on this ref

      // Toss adoption: when toss-render stamps window.__tossSubject, the fab
      // retargets repo/path/ref at the rendered subject; shell* keeps the
      // hosting page's own identity for the Components/Scripts link targets.
      // hosted: this copy declined to mount (a host shell owns the viewport).
      // subjectLocal: the rendered subject has no repo behind it at all (a
      // pasted clipboard payload shown through a renderer). The drawer keeps
      // its grip on the FRAME, which is what the take actions and Inspect
      // reach into, and drops every claim about a repo file.
      viaToss: false, hosted: false, subjectRoute: '', subjectVia: null,
      // Whether the subject lives in a FRAME (a toss) or in this document (a
      // file deck slide). Everything that reaches into the subject keys on
      // this rather than on `viaToss`, which conflated "I am describing
      // something other than my own page" with "that something is elsewhere"
      // for as long as tosses were the only announcer.
      subjectFramed: false,
      subjectLocal: false, subjectLabel: '',
      // The second ref. An announcer that is already showing a comparison says
      // what it is comparing against (a deck slide: the changeset's merge
      // base), and the drawer takes ownership of that choice from there.
      // compareRef is the reader's override, '' meaning the announced base;
      // compareOff is the reader having asked for no comparison at all.
      subjectBase: '', subjectBaseName: '',
      compareRef: '', compareOff: false, compareMenu: false,
      subjectReads: [], subjectReached: false, payloadHtml: '',
      shellRepo: '', shellPath: '', shellRef: 'main',
      // Subject-scoped Inspect: true when the toss subject's frame was
      // readable (same-origin #gh= renders), so Inspect lists the tossed
      // page's components/scripts, not only this shell's. _subjectGh carries
      // the subject window's lib coordinates for its script/component links.
      subjectInspect: false, subjectScripts: [], _subjectGh: null,

      reads: [],
      outBusy: false, outMsg: '', outError: '',
      briefReady: false, briefLoading: false,

      repo: '',
      path: '',
      ref: 'main',
      showRepoBase: 'https://mehrlander.github.io/web-tools/app/',

      init() {
        // Singleton guard: a hosting shell (toss-render, or this fab's own
        // ref overlay) stamps window.__fabHosted into the HTML it renders.
        // A fab booting under that stamp declines to mount, so exactly one
        // fab serves the viewport — the host's, which carries the context.
        if (window.__fabHosted) { this.hosted = true; return; }
        // THE DRAWER'S BODY IS BUILT WHEN `open` GOES TRUE, not when toggle()
        // runs, so the picker is asked for off the same signal. Keying it to
        // toggle() instead meant anything that opened the drawer another way
        // (a test setting the flag, a host calling in) built the body without
        // it. Not in init: loading it up front would put the picker back in
        // front of every page's own boot, which gh-boot moved it out of on
        // 2026-09-02.
        this.$watch('open', (v) => { if (v) this.ensurePicker(); });
        // Framed guard: a page rendered inside an iframe (a show-repo landing
        // / app-view / atlas embed, a gallery live-preview tile) doesn't get
        // its own fab either — the top window's fab owns the viewport, and the
        // host's "bust out" action opens the framed page directly when its
        // full experience is wanted. Cross-origin top access throws; treat
        // that as framed too. Opt back in with data-allow-framed on the mount.
        let framed = false;
        try { framed = window.self !== window.top; } catch (e) { framed = true; }
        if (framed && !('allowFramed' in (this.$root.dataset || {}))) { this.hosted = true; return; }
        // The drawer's hard refresh, reachable from outside the drawer. It stays
        // defined here because the fab is the page-level component and works on
        // pages that mount nothing else, so this is the one implementation and
        // show-repo's State view asks for it by announcement rather than
        // carrying a second copy of the cache-bust dance.
        // The note kit, for the legends in the drawer's panes. Placed after the
        // two guards above, so a fab that declines to mount asks for nothing.
        // Fire and forget: the kit is delegated and reaches panes drawn later.
        if (!window.Note && window.gh?.load) window.gh.load('kits/note.js');
        document.addEventListener('web-tools:hard-refresh', () => this.hardRefresh());
        // Ask for the drawer from anywhere, including from inside a toss frame
        // (same-origin under #gh=, so the frame calls up to this window). The
        // swipe deck's header uses it: on a phone the deck is the whole screen
        // and the launcher is right there, but on a desktop the deck is a
        // centred panel and the fab reads as belonging to the page behind it,
        // so the deck offers its own way in rather than leaving the connection
        // to be guessed. Same announcement idiom as the hard refresh above.
        window.addEventListener('web-tools:open-drawer', (e) => {
          this.open = true;
          const t = e && e.detail && e.detail.tab;
          if (t) this.tab = t;
        });
        // Clean up the one-shot cache-bust token hardRefresh() navigates with,
        // so it neither lingers in the address bar nor rides along when the URL
        // is copied. The fresh fetch already happened; this only rewrites the bar.
        try {
          const u = new URL(location.href);
          if (u.searchParams.has('_fresh')) {
            u.searchParams.delete('_fresh');
            history.replaceState(history.state, '', u.pathname + u.search + u.hash);
          }
        } catch (e) {}
        // A real handle on this component, for the x-data expressions inside
        // the template that would otherwise call back through Alpine's scope
        // proxy. See the pathPicker mount for what that costs.
        this.self = this;
        this.$el.innerHTML = this.template;
        this._elById = new Map();
        this._instanceCounter = 0;
        this._ensureHighlightStyle();
        this.$nextTick(() => { if (this.$el.isConnected) Alpine.initTree(this.$el); });
        this.infer();
        this.shellRepo = this.repo; this.shellPath = this.path; this.shellRef = this.ref;
        this.frameRef = this.ref || 'main';
        // A width the shell booted with (?w=) is already applied to the frame,
        // so the bar reads it rather than re-asserting it.
        this.frameWidth = window.__tossWidthNow || 0;
        this._restoreDrawer();
        // Adopt the rendered subject when hosted inside toss-render: the
        // shell stamps window.__tossSubject per render and fires the event.
        this._subjectListener = () => this.adoptSubject();
        window.addEventListener('toss-subject', this._subjectListener);
        this.adoptSubject();
        this.refreshLayers();
        // Console counts (header badges) + fallback list. Prefer the
        // retention kit (kits/console.js); fall back to gh-api's raw
        // __consoleLogs + 'consolelog' event. The rich panel, mounted
        // below, is the primary renderer once it's available.
        if (window.consoleKit) {
          this._offConsole = console.subscribe(e => {
            if (e.clear) { this.consoleLogs = []; return; }
            this.consoleLogs.push({ level: e.level, msg: e.msg, time: e.time });
            if (this.open && this.consoleOpen && !this.consolePanelReady) this.scrollConsole();
          });
        } else {
          this.consoleLogs = window.__consoleLogs ? [...window.__consoleLogs] : [];
          this._consoleListener = e => {
            this.consoleLogs.push(e.detail);
            if (this.open && this.consoleOpen && !this.consolePanelReady) this.scrollConsole();
          };
          window.addEventListener('consolelog', this._consoleListener);
        }
        // The drawer body exists from the first open on (template x-if on
        // `opened`); what needs its DOM (the console panel's host) mounts then.
        this.$watch('open', v => {
          if (!v || this.opened) return;
          this.opened = true;
          this.$nextTick(() => this._mountConsolePanel());
        });
        if (this.open) { this.opened = true; this.$nextTick(() => this._mountConsolePanel()); }

        this.loadedScripts = window.__loadedScripts ? window.__loadedScripts.map(s => ({ ...s })) : [];
        this._scriptsListener = () => {
          this.loadedScripts = window.__loadedScripts ? window.__loadedScripts.map(s => ({ ...s })) : [];
        };
        window.addEventListener('loadedscripts', this._scriptsListener);

        // Per-file bytes for those same rows (gh-boot wraps get() to fill
        // window.__ghFiles). A separate event because a cached load fires this
        // and not 'loadedscripts', and vice versa for a deduped one.
        this.ghFiles = window.__ghFiles ? { ...window.__ghFiles } : {};
        this._filesListener = () => { this.ghFiles = window.__ghFiles ? { ...window.__ghFiles } : {}; };
        window.addEventListener('ghfiles', this._filesListener);

        // read() registry (gh-boot wraps read() to populate window.__reads) —
        // drives the Bundle affordance's "page + N data files" count.
        this.reads = window.__reads ? [...window.__reads] : [];
        this._readsListener = () => { this.reads = window.__reads ? [...window.__reads] : []; };
        window.addEventListener('reads', this._readsListener);

        // Traffic: the readout strip tracks the ledger's running totals (kept
        // by gh-boot apart from the rows, so trimming an old call does not
        // deflate the figure). The boot read is taken once, lazily, since
        // Resource Timing does not change after load; a resource added later
        // (a lazy kit, an image) shows up on the next refresh.
        this._trafficTick();
        this._trafficListener = () => this._trafficTick();
        window.addEventListener('traffic', this._trafficListener);
      },

      destroy() {
        if (this._offConsole) this._offConsole();
        if (this._consoleListener) window.removeEventListener('consolelog', this._consoleListener);
        if (this._scriptsListener) window.removeEventListener('loadedscripts', this._scriptsListener);
        if (this._readsListener) window.removeEventListener('reads', this._readsListener);
        if (this._trafficListener) window.removeEventListener('traffic', this._trafficListener);
        if (this._filesListener) window.removeEventListener('ghfiles', this._filesListener);
        if (this._subjectListener) window.removeEventListener('toss-subject', this._subjectListener);
      },

      // Take on (or drop) the toss subject. The subject is what the viewer is
      // actually looking at, so repo/path/ref — and everything downstream:
      // header identity, version readout, page links, the render tab — follow
      // it. Cleared subject (an inline #gz= toss, or back to the input panel)
      // restores the shell's own identity.
      // toss-render's OWN delivery params. Everything else a fragment can carry
      // is a ROUTE key, whose value addresses the content. Mirrored from
      // docs/routes-modes.csv, which owns the table; tools/test/routes-manifest
      // fails if they drift. `u` is url's undocumented alias, read by the page.
      _TOSS_MODES: ['gh', 'gz', 'html', 'url', 'u'],

      // The same routed subject the shell now stamps, DERIVED FROM THE ADDRESS
      // when the shell did not stamp one.
      //
      // This is the deployed-shell problem in its sharpest form. toss-render is
      // served from main, so the re-stamp that makes a routed subject the file
      // rather than the app is invisible until it merges, and a viewer opening
      // a #data= toss today still gets a drawer titled pages/data-view.html. A
      // fab is lib, so ?use= reaches it, and a fab can always read the top-level
      // fragment: the address said which file was asked for before any of this
      // began. So derive it here, and let the shell's own stamp win the moment
      // it exists. This is a compatibility path, not a second implementation,
      // and it needs no route map: it only has to tell a route key from one of
      // toss-render's own, which is the short list above.
      _routedFromAddress(stamped) {
        let hash = '';
        try { hash = String(location.hash || ''); } catch (e) { return null; }
        // One key per fragment, read by slice, as toss-render reads it: a '&'
        // inside the value is part of the address, not a sibling param.
        const m = hash.replace(/^#/, '').match(/^([A-Za-z][\w-]*)=([\s\S]*)$/);
        if (!m || this._TOSS_MODES.includes(m[1])) return null;
        let raw = m[2];
        try { raw = decodeURIComponent(raw); } catch (e) {}
        // A trailing frag belongs to the renderer, and a ?query to the page.
        const a = raw.split('#')[0].trim()
          .match(/^([^/@:]+\/[^/@:]+)(?:@([^:]+))?:([^?#]+)/);
        if (!a) return null;
        // Nothing to correct if the shell already mounted the file itself,
        // which is what a route resolving to a plain page would look like.
        if (a[3] === stamped.path) return null;
        return { repo: a[1], ref: a[2] || '', path: a[3], route: m[1],
                 via: { repo: stamped.repo, ref: stamped.ref || 'main', path: stamped.path } };
      },

      adoptSubject() {
        // What the drawer was aimed at before this announcement, so the reset
        // below can be about what CHANGED rather than about everything.
        const was = { repo: this.repo, ref: this.ref, path: this.path };
        // The thing on screen changed, so a layer picked against the old stack
        // is not a preference to carry forward.
        this._layerPick = null;
        // Reactive copy: the take menu has to re-render when a toss re-addresses.
        this.payloadHtml = window.__tossPayload || '';
        const s0 = window.__tossSubject;
        // A shell too old to know about routes stamps only the renderer. Read
        // the route off the ADDRESS instead, which this fab can always see.
        const s = this._resolveSubject(s0);
        // `local` is the subject with no repo: a pasted payload the shell is
        // showing through a renderer. Without this branch the drawer took the
        // renderer's own address as the subject and reported that you were
        // looking at web-tools@main:pages/data-view.html, which is the document
        // mounted and not the thing being read. Same failure showRoute fixes
        // for a routed toss, and it cannot be fixed the same way, since a paste
        // has no address to re-stamp with.
        if (s && (s.repo || s.local)) {
          this.viaToss = true;
          this.subjectLocal = !!s.local;
          this.subjectLabel = s.label || '';
          this.repo = s.repo || '';
          this.path = s.path || '';
          this.ref = s.ref || 'main';
          // A ROUTED subject is a file the renderer could not show as a page,
          // so an app is showing it instead: `route` is the door it came
          // through and `via` is the app. Everything the drawer says about
          // WHAT you are looking at follows the file above; the take grid,
          // which reaches into the frame's dom for real, follows `via`.
          this.subjectRoute = s.route || '';
          // A routed subject may name the app showing it, and need not. A toss
          // does, because the renderer knows which page it routed through. An
          // IN-DOCUMENT subject (a file deck slide, route 'deck') does not, and
          // should not have to: this fab already recorded what page it is
          // mounted on, before any adoption, so it fills that in itself rather
          // than asking every announcer to work out what app it is inside.
          this.subjectVia = s.via
            || ((s.route && this.shellRepo && this.shellPath)
                ? { repo: this.shellRepo, ref: this.shellRef || 'main',
                    path: this.shellPath }
                : null);
          // What the announcer is already comparing against, which is what
          // makes the compare bar appear at all. A subject that offers none
          // (an ordinary page, a toss) has no second version in play.
          this.subjectBase = s.base || '';
          this.subjectBaseName = s.baseName || s.base || '';
        } else {
          if (!this.viaToss) return;
          this.viaToss = false;
          this.repo = this.shellRepo;
          this.path = this.shellPath;
          this.ref = this.shellRef;
          this.subjectRoute = ''; this.subjectVia = null;
          this.subjectLocal = false; this.subjectLabel = '';
          // The subject that owned the comparison has gone, so the choice goes
          // with it and the channel is left empty rather than holding a pair
          // that names a branch nothing on screen is showing.
          this.subjectBase = ''; this.subjectBaseName = '';
          this.compareRef = ''; this.compareOff = false;
          window.__compareRef = null;
        }
        this._afterIdentityChange(was);
        this.refreshLayers();
      },

      // Everything that has to happen once the drawer is pointed somewhere new,
      // whichever way it got there: an announcement adopted, or a layer picked.
      _afterIdentityChange(was) {
        this.subjectFramed = this.viaToss && !!window.__tossFrame;
        this.frameRef = this.ref || 'main';
        this.refMenu = false;
        this.compareMenu = false;

        // ── What actually has to be thrown away ────────────────────────────
        //
        // A toss re-addresses rarely and changes everything when it does, so
        // this used to drop the lot. A file deck announces on EVERY SWIPE and
        // changes only the path: same repo, same ref, one file along. Dropping
        // the lot there re-ran the whole branch scan per swipe
        // (branchesForPath, then one REST compare PER branch row through
        // loadDivergence, then the PR list) and re-parsed the guide body,
        // which is what made the drawer visibly reload while the reader was
        // just moving between files. Reported 2026-08-14.
        //
        // So the invalidation splits by what each thing is keyed on. The guide,
        // the version chip and the default branch belong to repo + REF. The
        // branch scan is the one genuinely per-file answer here ("which
        // branches carry a different version of THIS file"), so it alone
        // reloads on a swipe.
        const refChanged = this.repo !== was.repo || this.ref !== was.ref;
        const pathChanged = this.path !== was.path;
        if (this.repo !== was.repo) { this._div = {}; this._scan = {}; this.subjectPages = null; }
        if (refChanged) {
          // The comparison is a pair, so it survives a swipe (same branch, one
          // file along) and does not survive the branch changing under it.
          this.compareRef = ''; this.compareOff = false;
          this.ver = null; this.verLoaded = false; this.verError = '';
          // defaultBranch is a property of the repo just dropped, and
          // previewRef compares against it, so carrying a stale 'master' into a
          // main-defaulted repo would re-mislabel main as a preview. 'main' is
          // the guess until loadPageBranches says otherwise.
          this.defaultBranch = 'main';
          // prBodyFor back to null (not ''), which is the "nothing rendered
          // yet" state rather than "rendered a PR-less ref".
          this.prBodyHtml = ''; this.prBodyFor = null; this.prTargets = [];
          // The PR walk is the ref's, so it goes with the ref.
          this.prHistory = []; this._prsFor = ''; this.guideIdx = 0;
        }
        if (refChanged || pathChanged) {
          this.pageBranches = []; this.pageBranchesLoaded = false; this.branchNote = '';
          this.pageLast = null;
        }
        // Both scans fall back to the hub repo when `repo` is empty, which is
        // right for a page whose repo could not be inferred and wrong for a
        // subject that HAS no repo: it would list web-tools' branches beside a
        // pasted CSV and invite rendering it at one.
        if (this.open && !this.subjectLocal) {
          if (refChanged) this.loadVersion();
          // A ref change re-reads the guide; a swipe (same ref, one file along)
          // re-reads only the file's own last change. The branch scan re-runs
          // when the dropdown is next opened, not here.
          if (this.activeTab === 'render') {
            if (refChanged) this.loadGuide();
            else if (pathChanged) this.loadPageLast();
          }
        }
      },

      infer() {
        const ds = this.$root.dataset || {};
        if (ds.showRepoBase) this.showRepoBase = ds.showRepoBase;
        if (ds.ref) this.ref = ds.ref;

        if (ds.repo) {
          this.repo = ds.repo;
          this.path = ds.path || '';
          return;
        }

        const id = this._fromPagesUrl(location);
        if (!id) { if (ds.path) this.path = ds.path; return; }
        this.repo = id.repo;
        // THE ADDRESS WINS WHEREVER IT NAMES A FILE; a declaration fills in
        // only where it cannot. /web-tools/app/ infers the DIRECTORY, so the
        // drawer's identity read `app` and every pane under it described a
        // folder: the branch scan asked which branches carry a different
        // version of a directory, and the github menu linked a tree. The app
        // has declared data-path="app/index.html" all along and it was being
        // discarded.
        //
        // The declaration does NOT get to override a file address, and that
        // is not caution: a declaration goes stale where an address cannot,
        // and three pages under pages/scratch/ still name the path they had
        // before they moved. An address is the file being served.
        const namesAFile = /\.[^/]+$/.test(id.path || '');
        this.path = namesAFile ? id.path : (ds.path || id.path);
      },

      // The launcher is a drag handle, and `touch-none` is not enough to hold a
      // drag inside a sheet-presented in-app browser: the host dismisses on the
      // web view's SCROLL, and only a cancelled touch event stops one from
      // reaching it (measured on device; docs/ios-sheet-drags.md). Alpine binds
      // this non-passive, since it sets passive only for an explicit .passive
      // modifier, so preventDefault here actually cancels.
      //
      // The menu's rows are skipped: cancelling touchstart also suppresses the
      // compatibility CLICK, and those rows are activated by click. The disc
      // itself is a div driven by pointer events, so it loses nothing.
      holdTouch(e) {
        if (e.target && e.target.closest && e.target.closest('button')) return;
        e.preventDefault();
      },

      onDown(e) {
        // SNAPSHOT THE PAGE'S SELECTION BEFORE THIS TAP DESTROYS IT.
        // Pressing anywhere outside a selection collapses it, and the launcher
        // is outside every selection by construction, so by the time the drawer
        // is open the passage the reader had highlighted is gone. Measured: the
        // Text tab's selection scope never fired once, because the only way to
        // reach the tab is the tap that clears its subject.
        //
        // This is one line's worth of listener on the fab's OWN element, which
        // is the whole reason it is acceptable here. The alternative, watching
        // selectionchange on the host document, arms a listener on someone's
        // page for a tab they may never open, and this drawer already declines
        // to do that for the annotator.
        this._grabSelection();
        this.down = true;
        this.dragged = false;
        this.sx = e.clientX - this.x;
        this.sy = e.clientY - this.y;
        e.currentTarget.setPointerCapture(e.pointerId);
        // A press held in place is the menu; a press that moves is the drag
        // this launcher has always been. The timer is cancelled by either, so
        // the two gestures never both fire, and a fired long press eats the
        // pointerup so the drawer does not toggle behind the menu.
        this._lpFired = false;
        this._clearLongPress();
        this._lpTimer = setTimeout(() => {
          this._lpTimer = null;
          if (this.dragged) return;
          this._lpFired = true;
          this.openFabMenu();
        }, 450);
      },

      _clearLongPress() {
        if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }
      },

      // Right-click raises the SAME menu the long press does, and has to spend
      // the gesture the same way. A right-click still delivers pointerdown and
      // pointerup around the contextmenu event, so without this onUp read an
      // ordinary tap and ran `fabMenu = false; toggle()`: the menu was opened
      // and then closed within the one gesture, with the drawer left open
      // behind it. The pointer path already has the flag for exactly this;
      // it was only the long press that set it.
      onContextMenu() {
        this._clearLongPress();
        this._lpFired = true;
        this.openFabMenu();
      },

      // WHAT THE PAGE PUTS IN THE MENU. The third opt-in contract, beside
      // `actions` (verbs surfaced in the drawer's take grid) and `toggles`
      // (state on the Render tab's bar). A row is { label, icon, run } plus an
      // optional `title`, and there is deliberately no `desc`: see the note on
      // the menu markup for why a held-finger menu has no room for prose.
      //
      // Read here rather than off this.groups, because groups is detect()'s
      // output and detect() only runs when the DRAWER opens. A menu that waited
      // for it would open empty on the first long press of a page load, which
      // is the one that matters. This scan is the narrow half of detect's: the
      // x-data elements and one property off each, no highlighting, no script
      // registry, no instance ids. Cheap enough to redo on every open, which is
      // also what keeps it honest on a page whose components mount late.
      //
      // Same aim as detect: inside a readable #gh= toss the subject's rows lead,
      // since the subject is the page the reader is looking at. A #gz= sandbox
      // is opaque and contributes nothing, which is the ordinary silent case
      // rather than an error.
      readPageMenu() {
        const rows = [];
        const scan = (doc, A, side) => {
          doc.querySelectorAll('[x-data]').forEach(el => {
            if (side === 'shell' && this.$root.contains(el)) return;
            try {
              const data = el._x_dataStack?.[0] || A.$data(el);
              const list = Array.isArray(data?.menu) ? data.menu : [];
              for (const m of list) if (m && m.label) rows.push({ ...m, side });
            } catch (err) {}
          });
        };
        if (this.viaToss && window.__tossFrame) {
          try {
            const win = window.__tossFrame.contentWindow;
            const doc = window.__tossFrame.contentDocument;
            if (win && doc && win.Alpine) scan(doc, win.Alpine, 'subject');
          } catch (e) {}
        }
        scan(document, Alpine, 'shell');
        this.pageMenu = rows;
      },

      // Run a contributed row. The menu is already closed by the time this is
      // called (the click handler closes it first), so a row that opens
      // something of its own is not fighting a menu still painting over it.
      // A rejected promise is reported the way a failed action is, rather than
      // reaching the console as an unhandled rejection nobody sees on a phone.
      runMenuRow(m) {
        if (!m || typeof m.run !== 'function') return;
        try {
          const r = m.run();
          if (r && typeof r.catch === 'function') r.catch(e => { this.outError = (e && e.message) || String(e); });
        } catch (e) {
          this.outError = (e && e.message) || String(e);
        }
      },

      // ── The paste row ────────────────────────────────────────────────────
      //
      // Two endings, and which one runs is decided by the DOCUMENT rather than
      // by anything the page declares. A document that can SHOW the stage takes
      // its own paste and stays put; every other one parks the paste and leaves
      // for the app. The test for the first is a mounted component exposing
      // pasteAnywhere, which is the app's own method and is as good as a
      // declaration: a page that can take a paste to a Stage it is rendering
      // has one, and nothing else does. Read off each element's OWN scope for
      // the reason readPageMenu is (Alpine's $data answers the merged stack, so
      // every component nested inside the shell would claim the shell's method).
      _stageHost() {
        for (const el of document.querySelectorAll('[x-data]')) {
          if (this.$root.contains(el)) continue;
          try {
            const data = el._x_dataStack?.[0] || Alpine.$data(el);
            if (data && typeof data.pasteAnywhere === 'function') return data;
          } catch (err) {}
        }
        return null;
      },

      // Warmed during the PRESS, which is the whole reason the row can work on
      // a page that has never staged anything. Reading the clipboard has to
      // ride the tap's own user activation, so the row must not await a fetch
      // before it reads; the long press and the tap on the row are two separate
      // gestures, so the half-second of the hold is free to spend on loading.
      // Both files are small (io.js 8K, this kit under 4K) and neither is the
      // 233K stage component, which is exactly what carrying flavors rather
      // than staged items buys: the deciding half stays on the app.
      _warmPaste() {
        if (!window.gh || typeof window.gh.load !== 'function') return;
        if (!window.io?.pasteItems) this._selfLoad('kits/io.js', () => !!window.io?.pasteItems).catch(() => {});
        if (!window.StageHandoff) this._selfLoad('kits/stage-handoff.js', () => !!window.StageHandoff).catch(() => {});
      },

      // NOTHING IS AWAITED BEFORE THE CLIPBOARD READ. io.pasteItems() is the
      // first thing this touches, so the read rides the tap that asked for it;
      // the kit load happened on the press, and a tap fast enough to beat it
      // is told so rather than failing as a clipboard problem.
      //
      // The report is the other half of running off the app. A toast is
      // invisible here (only show-repo renders the toast container) and the
      // menu has closed by the time this runs, so a failure opens the drawer on
      // the Render tab, where outError is already the line every take reports
      // on. Success needs no report: the navigation is the feedback.
      pasteToStage() {
        // Nothing here rejects. The row is wired straight to the markup rather
        // than through runMenuRow (which is for contributed rows and carries
        // its own catch), so a rejection would reach nobody as an unhandled
        // one; every ending reports through the drawer instead.
        // The host's method is called SYNCHRONOUSLY, not through a promise
        // chain: it reads the clipboard on the far side and that read has to
        // ride this tap's user activation, so nothing may sit in front of it,
        // a microtask included.
        const host = this._stageHost();
        if (host) {
          try {
            return Promise.resolve(host.pasteAnywhere())
              .catch(e => this._reportInDrawer((e && e.message) || String(e)));
          } catch (e) {
            this._reportInDrawer((e && e.message) || String(e));
            return Promise.resolve();
          }
        }
        if (!window.io?.pasteItems) {
          this._reportInDrawer('the clipboard kit is still loading; hold the button again');
          return Promise.resolve();
        }
        return window.io.pasteItems().then(async (flavors) => {
          if (!flavors || !flavors.length) throw new Error('Nothing came off the clipboard');
          if (!window.StageHandoff) {
            const ok = await this._selfLoad('kits/stage-handoff.js', () => !!window.StageHandoff);
            if (!ok) throw new Error('the handoff kit is unavailable (kits/stage-handoff.js failed to load)');
          }
          await window.StageHandoff.put(flavors);
          this._go(this.showRepoBase + '?view=stage');
        }).catch((e) => {
          this._reportInDrawer((e && e.message) || String(e));
        });
      },

      // A message with nowhere else to go. The drawer is the fab's own surface
      // and the Render tab is where outError already renders, so opening it is
      // how a menu row reports on a page that has no chrome of its own.
      _reportInDrawer(msg) {
        this.outError = msg;
        this.activeTab = 'render';
        this.open = true;
      },

      // The menu's third built-in row. One fixed address, the deployed app at
      // the default branch, which is what "home" has to mean here: every other
      // way back out of a view is relative to the view (the ref bar re-renders
      // THIS page elsewhere, returnToLive drops a ?use= pin), and none of them
      // reaches the app from a page that was never part of it.
      //
      // Read off showRepoBase rather than written out again, so a page that
      // re-points the shell (data-show-repo-base) re-points its way home too.
      // No _handOffDrawer: the drawer describes the view being left, and there
      // is nothing on the far side for it to say.
      get homeUrl() { return this.showRepoBase; },
      goHome() { this._go(this.homeUrl); },

      openFabMenu() {
        this.readPageMenu();
        this.annKind = this._declaredKind();
        this._warmPaste();
        this.fabMenu = true;
        this._menuAt = Date.now();
        // A short buzz where the platform has one: a long press with no
        // feedback reads as a tap that failed until the menu paints.
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
      },

      // The finger that opened the menu has still to come up, and that release
      // fires a click on the launcher, which is OUTSIDE the menu: taken at face
      // value it closed the menu in the same gesture that opened it (measured
      // headless, the menu was up at 700ms and gone by the pointerup). So the
      // outside-click that lands inside the press itself is not a dismissal.
      closeFabMenu() {
        if (this._menuAt && Date.now() - this._menuAt < 400) return;
        this.fabMenu = false;
      },

      onMove(e) {
        if (!this.down) return;
        const nx = e.clientX - this.sx;
        const ny = e.clientY - this.sy;
        if (!this.dragged && Math.hypot(nx - this.x, ny - this.y) > 4) { this.dragged = true; this._clearLongPress(); }
        const size = 56, edge = 24;
        const w = window.innerWidth, h = window.innerHeight;
        this.x = Math.min(edge, Math.max(-(w - size - edge), nx));
        this.y = Math.min(edge, Math.max(-(h - size - edge), ny));
      },

      onUp(e) {
        const wasDragged = this.dragged;
        const wasLong = this._lpFired;
        this._clearLongPress();
        this._lpFired = false;
        this.down = false;
        this.dragged = false;
        if (!wasDragged && !wasLong) { this.fabMenu = false; this.toggle(); }
      },

      toggle() {
        if (this.open) { this.close(); return; }
        this.detect();
        this.refreshLayers();
        this.open = true;
        // The take grid states its own scope ("2 own modules · 5 vendor"), so the
        // brief kit has to be in hand when the drawer opens rather than on hover
        // of a menu that no longer exists. Still lazy: nothing loads until then.
        this.ensureBrief();
        this.loadVersion();
        // Render is the default tab, so read its guide on open the same way
        // clicking the tab would (a tab already open fires no click). The
        // branch scan is the dropdown's and waits for it; see loadGuide.
        if (this.activeTab === 'render') this.loadGuide();
      },

      // THE PICKER IS THE FAB'S OWN DEPENDENCY, so the fab loads it rather than
      // trusting each host to. gh-boot pairs them in FAB_BOOT and every page
      // that hand-loads the fab restates that pair from memory; ten of the
      // eleven that do dropped this half. Loading it here means the pairing is
      // stated where the need is, and a host that already has it pays a load()
      // the registry dedupes to nothing.
      //
      // Fire-and-forget from toggle(): the drawer must open on the tap that
      // asked for it, so the picker appears a moment later rather than the
      // drawer waiting on a network read. Tried once per mount, since a second
      // failure would be the same failure.
      ensurePicker() {
        if (this.pickerReady || this._pickerTried) return;
        this._pickerTried = true;
        const load = window.gh && window.gh.load;
        // NO LOADER MEANS NOTHING TO WAIT FOR. Every real host has one (the
        // pre-build supplies a gh of its own), so this is the harness's path:
        // a test that registers the component by hand should get the picker,
        // not a control gated forever on a fetch that cannot happen. Where the
        // component is genuinely absent this throws exactly as it did before,
        // which is no worse and is not a state any page reaches.
        if (!load) { this.pickerReady = true; return; }
        load.call(window.gh, 'alpineComponents/path-picker.js', { by: 'alpineComponents/fab.js' })
          .then(() => { this.pickerReady = true; })
          .catch(() => {});   // no picker beats a thrown drawer
      },

      // Hard refresh: emulate Cmd/Ctrl+Shift+R where the browser gives no
      // gesture for it (Safari on iOS). Two levers: clear the Cache Storage API
      // (service-worker / PWA caches) and reload through a one-shot cache-bust
      // token so the top-level HTML is re-fetched instead of served from the
      // browser's HTTP cache. location.replace keeps the token out of history;
      // init() strips it back out of the address bar on the fresh load.
      async hardRefresh() {
        this._handOffDrawer();
        try {
          if (window.caches && caches.keys) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
        } catch (e) {}
        try {
          const u = new URL(location.href);
          u.searchParams.set('_fresh', Date.now().toString(36));
          location.replace(u.toString());
        } catch (e) {
          location.reload();
        }
      },

      close() {
        this.open = false;
        this.clearHighlight();
      },

      // Run a page action. If its run() resolves to a string, flash it as
      // feedback (e.g. "Copied"); errors surface the same way.
      //
      // A subject-side action's closure belongs to the frame's window, and
      // calling it from a click in this drawer leaves that document unfocused.
      // Measured: that alone rejects a clipboard write with NotAllowedError,
      // "Document is not focused" — activation propagates to a same-origin
      // child frame, focus does not. So focus the frame before invoking. That
      // one line covers every action that copies, including the io.copy ones,
      // whose document.hasFocus() branch is the same fault seen from the other
      // side; no page has to know it is being run from outside.
      //
      // Navigation cannot be fixed that way, because `location.href = ...`
      // inside the frame moves the FRAME, which is the opposite of what an
      // action like show-repo's bust-out means. An action that navigates
      // returns { nav } instead of doing it, and the FAB performs it here,
      // where the address bar is.
      async runAction(a) {
        this.outError = ''; this.outMsg = '';
        const subject = a.side === 'subject';
        try {
          if (subject) { try { window.__tossFrame?.contentWindow?.focus(); } catch (err) {} }
          const m = await a.run();
          if (m && typeof m === 'object' && m.nav) { location.href = m.nav; return; }
          const msg = typeof m === 'string' ? m : (m && typeof m === 'object' ? m.msg : '');
          if (msg) {
            this.outMsg = msg;
            setTimeout(() => { if (this.outMsg === msg) this.outMsg = ''; }, 1400);
          }
        } catch (e) {
          // The throw crossed a window boundary, so it is the SUBJECT's failure,
          // not the drawer's, and the reader cannot see which window it came
          // from. Say so. (`e instanceof Error` is false across realms; reading
          // `.message` still works, which is why nothing here tests the type.)
          const msg = (e && e.message) || String(e);
          this.outError = subject ? 'In ' + (a.from || 'the subject') + ': ' + msg : msg;
          setTimeout(() => { this.outError = ''; }, 2500);
        } finally {
          // Hand focus back, so the drawer the reader is still looking at keeps
          // the keyboard.
          if (subject) { try { window.focus(); } catch (err) {} }
        }
      },

      detect() {
        this.clearHighlight();
        this._elById = new Map();
        this._instanceCounter = 0;

        // One scan per document. `shell` marks this hosting page's own
        // components (vs the toss subject's). Actions are collected from BOTH
        // sides: a subject's closures do belong to its window, but that governs
        // how they are INVOKED (see runAction), not whether they can be reached.
        // Collecting shell-side only meant the drawer named the subject in its
        // header and then offered the renderer's buttons underneath it, unmarked.
        // `shell` rides out on each group so pageActions can attribute them.
        const scan = (doc, A, shell) => {
          const groups = {};
          doc.querySelectorAll('[x-data]').forEach(el => {
            if (shell && this.$root.contains(el)) return;

            const attr = el.getAttribute('x-data') || '';
            const m = attr.trim().match(/^([a-zA-Z_$][\w$]*)/);
            if (!m) return;
            const name = m[1];
            const key = (shell ? 'shell:' : 'page:') + name;

            if (!groups[key]) groups[key] = { key, name, shell, description: '', actions: [], modeSrc: null, instances: [] };

            const id = '__fab_' + (this._instanceCounter++);
            const label = this._labelFor(el);
            groups[key].instances.push({ id, name, label });
            this._elById.set(id, el);

            // Read the page's opt-in contract off the live component data: a
            // one-line `description` (shown under the name), an `actions`
            // array ({ label, icon, run }) the FAB surfaces as page buttons,
            // and a `toggles` array of on/off controls for the Render tab.
            //
            // `actions` is copied out, `toggles` is not: an action is a verb, so
            // a snapshot of closures is the whole of it, while a toggle is STATE
            // and its `value` has to be read at paint time or the bar would
            // show whichever segment was lit when the drawer was last opened.
            // So the component's own data object is held (modeSrc) and its
            // getter re-read through pageToggles.
            //
            // READ FROM THE ELEMENT'S OWN SCOPE, not $data(el). Alpine's $data
            // returns the merged data STACK, so every component nested inside
            // another one answers for its host's properties too: on show-repo
            // that meant fourteen components each reporting the shell's
            // contract as their own. It showed up the day `toggles` arrived (one
            // bar per nested component, all wired to the same state) and was
            // already there, quietly, for `description` and `actions`, which
            // only escaped notice because the values were empty in the cases
            // anyone looked at. `_x_dataStack[0]` is the scope this element's
            // own x-data created; $data stays as the fallback, so a build that
            // stops exposing the stack degrades to the old behavior rather
            // than to nothing.
            if (!groups[key].description || !groups[key].actions.length || !groups[key].modeSrc) {
              try {
                const data = el._x_dataStack?.[0] || A.$data(el);
                if (data && typeof data.description === 'string' && !groups[key].description) groups[key].description = data.description;
                if (data && Array.isArray(data.actions) && data.actions.length) groups[key].actions = data.actions;
                if (data && !groups[key].modeSrc && Array.isArray(data.toggles) && data.toggles.length) groups[key].modeSrc = data;
              } catch (err) {}
            }
          });
          return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
        };

        const shellGroups = scan(document, Alpine, true);

        // Subject-scoped Inspect: the Render tab's adoption pattern extended.
        // A #gh= toss renders its subject in a same-origin srcdoc frame
        // (toss-render stamps window.__tossFrame), so the subject's components
        // and script registry are readable; scan them so Inspect describes the
        // page the viewer is looking at, listed above this shell's own. A
        // payload toss (#gz=) renders under an opaque origin — contentDocument
        // access fails, and the caveat line stands in.
        this.subjectInspect = false;
        this.subjectScripts = [];
        this.subjectFiles = {};
        this.subjectReads = [];
        this.subjectReached = false;
        this._subjectGh = null;
        let subjectGroups = [];
        if (this.viaToss && window.__tossFrame) {
          try {
            const win = window.__tossFrame.contentWindow;
            const doc = window.__tossFrame.contentDocument;
            if (win && doc) {
              // Reaching the frame and finding Alpine in it are two questions.
              // A page can boot lib without Alpine, or carry no chain at all, and
              // its registries are still worth reading: the take menu needs them
              // even when there is no component tree to scan.
              this.subjectReached = true;
              this.subjectScripts = win.__loadedScripts ? win.__loadedScripts.map(s => ({ ...s })) : [];
              this.subjectFiles = win.__ghFiles ? { ...win.__ghFiles } : {};
              this.subjectReads = win.__reads ? win.__reads.map(r => ({ path: r.path, value: r.value })) : [];
              this._subjectGh = { repo: win.gh?.repo || 'mehrlander/web-tools',
                                  ref: win.gh?.ref || 'main',
                                  base: win.gh?.loadBase || '' };
              if (win.Alpine) {
                this._ensureHighlightStyle(doc);
                subjectGroups = scan(doc, win.Alpine, false);
                this.subjectInspect = true;
              }
            }
          } catch (e) {}
        }

        this.groups = subjectGroups.concat(shellGroups);
      },

      _labelFor(el) {
        if (el.id) return '#' + el.id;
        const marker = el.getAttribute('data-marker');
        if (marker) return '[' + marker + ']';
        const tag = el.tagName.toLowerCase();
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
        return cls ? tag + '.' + cls : tag;
      },

      highlight(id) {
        if (this.highlighted === id) { this.clearHighlight(); return; }
        this.clearHighlight();
        const el = this._elById.get(id);
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const tagged = [];
        if (rect.width > 0 && rect.height > 0) {
          el.classList.add('__fab-highlight');
          tagged.push({ el, cls: '__fab-highlight' });
        } else {
          const kids = Array.from(el.children);
          if (kids.length === 1) {
            kids[0].classList.add('__fab-highlight');
            tagged.push({ el: kids[0], cls: '__fab-highlight' });
          } else {
            kids.forEach(k => {
              k.classList.add('__fab-highlight-multi');
              tagged.push({ el: k, cls: '__fab-highlight-multi' });
            });
          }
        }

        this.highlighted = id;
        this._highlightEls = tagged;
        if (tagged.length) tagged[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },

      clearHighlight() {
        if (!this.highlighted) return;
        if (this._highlightEls) {
          this._highlightEls.forEach(({ el, cls }) => el.classList.remove(cls));
          this._highlightEls = null;
        }
        this.highlighted = null;
      },

      _ensureHighlightStyle(doc) {
        doc = doc || document;
        if (doc.getElementById('__fab-highlight-style')) return;
        const style = doc.createElement('style');
        style.id = '__fab-highlight-style';
        style.textContent =
          '.__fab-highlight {' +
          '  outline: 3px dashed var(--color-primary, #f59e0b) !important;' +
          '  background-color: color-mix(in srgb, var(--color-primary, #f59e0b) 18%, transparent) !important;' +
          '  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--color-primary, #f59e0b) 65%, transparent) !important;' +
          '}' +
          '.__fab-highlight-multi {' +
          '  outline: 3px dashed var(--color-warning, #f59e0b) !important;' +
          '  background-color: color-mix(in srgb, var(--color-warning, #f59e0b) 18%, transparent) !important;' +
          '  box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--color-warning, #f59e0b) 65%, transparent) !important;' +
          '}';
        doc.head.appendChild(style);
      },

      linksFor(filePath, repo, ref) {
        const r = repo || this.repo;
        if (!r) return [];
        ref = ref || this.ref;
        const p = filePath;
        const params = new URLSearchParams({ repo: r, ref });
        if (p) params.set('file', p);
        return [
          { l: 'Source', i: 'ph-github-logo',
            u: 'https://github.com/' + r + '/blob/' + ref + (p ? '/' + p : '') },
          { l: 'show-repo', i: 'ph-tree-structure',
            u: this.showRepoBase + '?' + params.toString() },
          { l: 'github.dev', i: 'ph-pencil-simple',
            u: 'https://github.dev/' + r + '/blob/' + ref + (p ? '/' + p : '') },
          { l: 'jsDelivr', i: 'ph-cloud-arrow-down',
            u: 'https://cdn.jsdelivr.net/gh/' + r + '@' + ref + (p ? '/' + p : '/') }
        ];
      },

      get pageLinks() { return this.linksFor(this.path); },
      // Page-contributed buttons, flattened across every component that exposes
      // an `actions` array. An action may name the take group it belongs in
      // (`group: 'Copy'`), which is how toss-render files "Copy toss link" with
      // the other clipboard outputs instead of standing apart; anything that
      // does not declare one lands under "Page".
      // Carry the contributing component through, so a take row can say where an
      // action came from, and which SIDE it came from: inside a toss the drawer
      // carries the subject's actions and this renderer's at once, and the two
      // can offer the same bare label ("Link" from both). `from` names the
      // component, `side` names the window it lives in, which is also what
      // runAction needs to invoke it correctly.
      get pageActions() {
        return this.groups.flatMap(g => (g.actions || []).map(a =>
          ({ ...a, from: g.name, side: g.shell ? 'shell' : 'subject' })));
      },

      // Page-contributed STATE, the counterpart to pageActions and the same
      // question this tab's own controls ask: the ref bar is which code is
      // running, the width presets are what shape it is laid out at, and a
      // contributed toggle is whatever else the page is being presented at.
      // A row is { key, label, icon, on, title, set }. There is no `hint`: the
      // row has one line to spend and a control that needs a paragraph is the
      // wrong control.
      //
      // BINARY on purpose. The first cut took a general `modes` list, each a
      // segmented bar of its own, and show-repo's had three segments naming
      // the whole shell. Two of them were the sidebar, which already answers
      // to the header's hamburger and to the address, so the drawer was
      // carrying a duplicate control and a row of chrome to hold it. What is
      // left is the part with no other owner, and a binary needs no row.
      //
      // Re-read from the component on every paint (modeSrc), not copied at
      // scan time, so the lit state is the page's live answer. In this window
      // that is enough on its own, since the page's getter is reactive and this
      // getter reads through it. Across the toss boundary it is not: a subject
      // frame runs its own Alpine, whose reactivity this shell's effects do not
      // observe, so setPageToggle bumps _modeTick to force the repaint the
      // subject cannot ask for.
      get pageToggles() {
        this._modeTick;
        return this.groups.flatMap(g => {
          let list = [];
          try { list = Array.isArray(g.modeSrc?.toggles) ? g.modeSrc.toggles : []; } catch (err) {}
          return list.map(t => ({ ...t, from: g.name, side: g.shell ? 'shell' : 'subject' }));
        });
      },

      setPageToggle(t, on) {
        if (!t || typeof t.set !== 'function' || on === t.on) return;
        this.outError = '';
        try { t.set(on); }
        catch (e) { this.outError = (e && e.message) || String(e); }
        this._modeTick++;
      },

      // Where a contributed action came from, in the reader's terms. Outside a
      // toss there is one page and the plain wording holds. Inside one, "this
      // page" is the ambiguous phrase the old text used, so name which is which.
      actionOrigin(a) {
        const who = a.from || 'unknown';
        if (!this.viaToss) return 'Contributed by this page (' + who + '), not by the toolbar.';
        return a.side === 'subject'
          ? 'Contributed by the page you are viewing (' + who + '), not by the toolbar.'
          : 'Contributed by this renderer (' + who + '), not by the page you are viewing.';
      },
      get totalInstances() { return this.groups.reduce((s, g) => s + g.instances.length, 0); },
      get errorCount() { return this.consoleLogs.filter(e => e.level === 'error').length; },

      // ── Capture: the diagnostic bundle, serialized ─────────────────────────
      // Everything below is already collected for display (the script and
      // read() registries, the component scan, the console buffer, the subject
      // adoption); this only writes it down, so a session can read the page's
      // real state from a paste instead of inferring a DOM from a screenshot.
      // First cut of the capture task: clipboard out, no write path yet. It
      // rides the take grid as Copy · Capture, on the drawer's default tab.
      // Design points held from the task file: no pixels, and the bundle SAYS
      // which fidelity it got, since a #gz= subject renders under an opaque
      // origin on purpose and a capture there covers the shell alone.
      captureData() {
        this.detect();
        const mode = !this.viaToss ? 'top-level'
          : this.subjectReached ? 'toss #gh= (subject frame read)'
          : 'toss (subject frame unreadable: SHELL ONLY below)';
        const elide = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + `…(${s.length} chars)` : s; };
        const logs = this.consoleLogs.slice(-300);
        const sizeOf = r => { try { return JSON.stringify(r.value ?? '').length; } catch { return -1; } };
        return {
          capture: 'fab/1',
          at: new Date().toISOString(),
          address: elide((() => { try { return location.href; } catch { return ''; } })(), 400),
          mode,
          subject: { repo: this.repo, path: this.path, ref: this.ref,
                     ...(this.subjectRoute ? { route: this.subjectRoute, via: this.subjectVia } : {}) },
          ...(this.viaToss ? { shell: { repo: this.shellRepo, path: this.shellPath, ref: this.shellRef } } : {}),
          scripts: this.inspectScripts.map(s => ({
            path: s.path, status: s.status, side: s.side || (this.viaToss ? 'shell' : 'page'),
            ...(s.auto ? { auto: true } : {}),
            ...(s.by && s.by.size ? { by: Array.from(s.by) } : {}) })),
          // The scan's `shell` flag means "the hosting document", which outside
          // a toss IS the page; translate so a top-level capture never labels
          // the page's own components as someone else's.
          components: this.groups.map(g => ({
            name: g.name, side: g.shell && this.viaToss ? 'shell' : 'page', instances: g.instances.length,
            ...(g.actions.length ? { actions: g.actions.map(a => a.label) } : {}) })),
          // read() payloads can be whole datasets; a capture reports WHAT was
          // read and how much, never the bytes.
          reads: this.reads.map(r => ({ path: r.path, bytes: sizeOf(r) })),
          ...(this.subjectReads && this.subjectReads.length
            ? { subjectReads: this.subjectReads.map(r => ({ path: r.path, bytes: sizeOf(r) })) } : {}),
          console: logs.map(l => ({ level: l.level, msg: elide(l.msg, 500), time: l.time })),
          errors: logs.filter(l => l.level === 'error').length,
          ...(this.consoleLogs.length > 300 ? { consoleDropped: this.consoleLogs.length - 300 } : {}),
        };
      },
      // Runs through the take grid's dispatch (Copy · Capture), so success and
      // failure report on the same outMsg/outError line as the other outputs.
      async copyCapture() {
        const text = JSON.stringify(this.captureData(), null, 2);
        await navigator.clipboard.writeText(text);
        this.outMsg = 'Copied a ' + Math.max(1, Math.round(text.length / 1024)) + 'K capture';
      },

      // Per-group source links. Components are lib files, so a group resolves
      // against the lib chain of the window it lives in: the subject's gh
      // coordinates for subject groups, this shell's for its own. loadBase is
      // prepended so the blob link points at the real file under lib/.
      // (pageLinks passes the page's own root-relative path, left unprefixed.)
      componentLinks(g) {
        const p = 'alpineComponents/' + g.name + '.js';
        if (g.shell === false && this._subjectGh) {
          return this.linksFor(this._subjectGh.base + p, this._subjectGh.repo, this._subjectGh.ref);
        }
        const base = (window.gh && window.gh.loadBase) || '';
        return this.linksFor(base + p, this.shellRepo, this.shellRef);
      },

      // The Inspect scripts list: the subject window's registry first (side
      // 'page'), then this shell's (side 'shell'), one flat list so the panel
      // keeps a single scroll; outside a readable toss, just the shell's.
      get inspectScripts() {
        if (!this.subjectInspect) return this.loadedScripts;
        return this.subjectScripts.map(s => ({ ...s, side: 'page' }))
          .concat(this.loadedScripts.map(s => ({ ...s, side: 'shell' })));
      },

      scriptUrl(s) {
        const path = typeof s === 'string' ? s : (s && s.path);
        if (!path || /^https?:/.test(path)) return path || '#';
        // Registry paths are the loadBase-relative names gh.load() was called
        // with (e.g. 'kits/console.js'); prepend loadBase so the blob link
        // points at the real file under lib/. Subject-side rows key on the
        // subject window's lib coordinates, shell rows on this document's.
        if (typeof s === 'object' && s.side === 'page' && this._subjectGh) {
          return 'https://github.com/' + this._subjectGh.repo + '/blob/' + this._subjectGh.ref + '/' + this._subjectGh.base + path;
        }
        if (!this.shellRepo) return '#';
        const base = (window.gh && window.gh.loadBase) || '';
        return 'https://github.com/' + this.shellRepo + '/blob/' + this.shellRef + '/' + base + path;
      },

      fmtElapsed(s) {
        if (s.status === 'pending') return '…';
        if (typeof s.endT === 'number' && typeof s.t === 'number') return (s.endT - s.t) + 'ms';
        return '';
      },

      // Join a Scripts row to what gh-boot's get() wrapper recorded for it.
      // Registry paths are the loadBase-relative names gh.load() was called
      // with; __ghFiles keys are the full paths get() received, so the join
      // prepends the loadBase of whichever window the row belongs to.
      _scriptFile(s) {
        const path = typeof s === 'string' ? s : (s && s.path);
        if (!path) return null;
        const subject = typeof s === 'object' && s.side === 'page';
        const files = subject ? this.subjectFiles : this.ghFiles;
        const base = subject
          ? ((this._subjectGh && this._subjectGh.base) || '')
          : ((window.gh && window.gh.loadBase) || '');
        return (files && (files[base + path] || files[path])) || null;
      },
      scriptInlined(s) { const f = this._scriptFile(s); return !!(f && f.inlined); },
      scriptSizeText(s) {
        const f = this._scriptFile(s);
        if (!f) return '';
        return f.inlined ? 'inlined' : this.fmtB(f.bytes);
      },
      scriptSizeTitle(s) {
        const f = this._scriptFile(s);
        if (!f) return '';
        return f.inlined
          ? 'Served from the inlined cache in the pre-build: ' + this.fmtB(f.bytes) + ' of source, no network'
          : this.fmtB(f.bytes) + ' fetched from the repo';
      },

      fmtTime(ts) { return new Date(ts).toTimeString().slice(0, 8); },

      // ── Traffic ─────────────────────────────────────────────────────────
      // lib/kits/traffic.js carries the arithmetic and every honesty rule; these are
      // the thin delegates the template binds to. They degrade to a plain
      // number rather than throwing when the module is not present, which is
      // the case for a page that pulled fab.js alone without the boot chain.
      fmtB(n) { return window.Traffic ? window.Traffic.fmtBytes(n) : String(n == null ? '?' : n); },
      fmtT(n) { return window.Traffic ? window.Traffic.fmtMs(n) : String(Math.round(n || 0)) + 'ms'; },
      fmtN(n) { return window.Traffic ? window.Traffic.fmtCount(n) : String(n); },

      trafPct(v) {
        const max = this.trafBootGroups.reduce((m, g) => Math.max(m, g.wire || 0), 0);
        if (!max || !v) return 0;
        return Math.max(2, Math.round((v / max) * 100));
      },

      // The always-on strip. Deliberately three facts and no more: what this
      // load cost, how many calls browsing has added, and what quota is left.
      // Empty until the boot read lands, so the strip never shows a zero that
      // would read as "nothing loaded".
      get trafficLine() {
        const T = window.Traffic;
        if (!T || !this.trafBoot || !this.trafBoot.count) return '';
        return T.summary({ boot: this.trafBoot, api: { calls: this.trafLive.calls }, rate: this.trafRate });
      },

      // Tinted only for the two things worth interrupting a glance: the rate
      // limit running down, and calls that failed.
      get trafficHot() {
        return (this.trafRate !== null && this.trafRate < 500) || this.trafLive.errors > 0;
      },

      get trafRateExact() {
        return this.trafRate === null ? '' : String(this.trafRate).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      },

      get trafficLoadTitle() {
        if (!this.trafBoot) return '';
        return this.fmtB(this.trafBoot.wire) + ' over the wire, '
          + this.fmtB(this.trafBoot.decoded) + ' decoded, '
          + this.trafBoot.count + ' resources; '
          + this.trafLive.calls + ' calls since. Tap for the breakdown.';
      },

      // Pull traffic.js on demand. It rides the boot chain, so this only fires
      // for a page that mounted the fab without one; a failure downgrades the
      // tab rather than breaking the drawer.
      async _ensureTrafficLib() {
        if (window.Traffic) return true;
        if (this._trafficLibTried) return false;
        this._trafficLibTried = true;
        try { await window.gh.load('kits/traffic.js'); } catch (e) {}
        if (!window.Traffic) return false;
        this._trafficTick();
        return true;
      },

      // Cheap, coalesced, and called on every 'traffic' event: the running
      // totals plus a boot re-read only when the resource count actually moved.
      // Resource Timing is append-only, so the count is a sufficient dirty bit.
      _trafficTick() {
        const T = window.Traffic;
        if (!T) { this._ensureTrafficLib(); return; }
        const tot = window.__trafficTotals || { calls: 0, wire: 0, errors: 0 };
        this.trafLive = { calls: tot.calls || 0, wire: tot.wire || 0, errors: tot.errors || 0 };
        const rate = window.__trafficRate;
        this.trafRate = (rate === undefined || rate === null) ? null : rate;

        // In a readable toss the strip follows the bands onto the subject, or
        // the header would quote the shell's weight while the tab underneath it
        // described the tossed page. Outside a toss this branch never runs.
        if (this.viaToss) {
          const sub = this._readSubjectTraffic();
          if (sub) {
            this.trafSubject = true;
            this.trafShellWire = T.readBoot().wire;
            this.trafBoot = sub.boot;
            this.trafBootGroups = sub.groups;
            if (sub.live) this.trafLive = { calls: sub.live.calls || 0, wire: sub.live.wire || 0, errors: sub.live.errors || 0 };
            this.trafRate = sub.rate;
            return;
          }
          this.trafSubject = false;
        }

        let n = 0;
        try { n = performance.getEntriesByType('resource').length; } catch (e) {}
        if (this._bootCount !== n || !this.trafBoot) {
          this._bootCount = n;
          this.trafBoot = T.readBoot();
          this.trafBootGroups = T.bootGroups(this.trafBoot.rows);
        }
      },

      // In a toss the viewer is looking at the subject, not at this shell, so
      // the bands must describe the subject wherever its frame can be read.
      // Same reachability rule Inspect uses: a #gh= render is a same-origin
      // srcdoc frame and readable, a #gz= payload runs under an opaque origin
      // and throws. Returns null when there is nothing honest to report, which
      // is what puts the caveat line up instead.
      _readSubjectTraffic() {
        if (!this.viaToss || !window.__tossFrame) return null;
        try {
          const win = window.__tossFrame.contentWindow;
          if (!win || !win.performance) return null;
          const T = window.Traffic;
          // No navigation entry: a srcdoc frame did not fetch a document, and
          // folding its zero in would read as a free page load.
          const boot = T.boot(win.performance.getEntriesByType('resource'), null);
          const entries = win.__traffic || [];
          return {
            boot,
            groups: T.bootGroups(boot.rows),
            api: T.apiGroups(entries),
            repos: T.repoGroups(entries),
            totals: T.apiTotals(entries),
            live: win.__trafficTotals || null,
            rate: (win.__trafficRate === undefined) ? null : win.__trafficRate,
          };
        } catch (e) { return null; }
      },

      // The full read, on tab open and on the refresh button. Everything except
      // the storage estimate is synchronous over data already in memory.
      async refreshTraffic() {
        this.trafficError = '';
        if (!await this._ensureTrafficLib()) {
          this.trafficError = 'lib/kits/traffic.js could not be loaded, so there are no meters to read.';
          return;
        }
        const T = window.Traffic;
        const shellBoot = T.readBoot();
        const sub = this._readSubjectTraffic();
        this.trafSubject = !!sub;
        this.trafShellWire = shellBoot.wire;

        this.trafBoot = sub ? sub.boot : shellBoot;
        this.trafBootGroups = sub ? sub.groups : T.bootGroups(shellBoot.rows);
        this._bootCount = this.trafBoot.count - 1;

        if (sub) {
          this.trafGroups = sub.api;
          this.trafRepos = sub.repos;
          this.trafTotals = sub.live
            ? { ...sub.totals, calls: sub.live.calls, wire: sub.live.wire, unknown: sub.live.unknown, errors: sub.live.errors, ms: sub.live.ms }
            : sub.totals;
          this.trafTrimmed = (sub.live && sub.live.trimmed) || 0;
          this.trafRate = sub.rate;
          this._trafficResident();
          return;
        }

        const entries = window.__traffic || [];
        this.trafGroups = T.apiGroups(entries);
        this.trafRepos = T.repoGroups(entries);
        this.trafTotals = T.apiTotals(entries);
        const tot = window.__trafficTotals;
        // The ledger trims; its totals do not. Where they disagree, the totals
        // are the honest figure and the rows are a recent sample of it.
        if (tot) {
          this.trafTrimmed = tot.trimmed || 0;
          this.trafTotals = { ...this.trafTotals, calls: tot.calls, wire: tot.wire, unknown: tot.unknown, errors: tot.errors, ms: tot.ms };
        }
        this._trafficTick();
        await this._trafficResident();
      },

      // Storage is origin-scoped, so it is the same answer for the shell and
      // for a subject rendered inside it, and both paths end here. The rate
      // reset rides along because it is read from the same globals.
      async _trafficResident() {
        const T = window.Traffic;
        const reset = window.__trafficRateReset;
        if (reset && reset > Date.now()) {
          const mins = Math.round((reset - Date.now()) / 60000);
          this.trafReset = mins < 1 ? 'under a minute' : (mins < 60 ? mins + 'm' : Math.round(mins / 60) + 'h');
        } else this.trafReset = '';

        const stores = [];
        for (const [store, name] of [[window.localStorage, 'localStorage'], [window.sessionStorage, 'sessionStorage']]) {
          const row = T.storageRows(store, name);
          if (row && row.keys) stores.push(row);
        }
        this.trafStores = stores;
        try {
          const est = await navigator.storage.estimate();
          this.trafEstimate = est && est.usage ? est.usage : 0;
        } catch (e) { this.trafEstimate = 0; }
        // indexedDB.databases() is not universal, so its absence is a missing
        // detail rather than a failure: the origin total still stands.
        try {
          this.trafDbs = typeof indexedDB !== 'undefined' && indexedDB.databases
            ? (await indexedDB.databases()).map(d => d.name).filter(Boolean)
            : [];
        } catch (e) { this.trafDbs = []; }
        // Open on arrival only where there is something with mass to look at.
        // 100 KB is the line between "a token and some UI state" and "this page
        // is holding your data", which is the only case worth a scroll.
        this.trafStoreOpen = this.trafEstimate > 100 * 1024 || this.trafDbs.length > 0;
      },

      // The one-line summary the collapsed row carries. Web Storage and the
      // origin estimate are two different measurements, so they are named
      // separately rather than added into a single figure that is neither.
      get trafStoreLine() {
        const keys = this.trafStores.reduce((n, s) => n + s.keys, 0);
        const bytes = this.trafStores.reduce((n, s) => n + s.bytes, 0);
        const bits = [];
        if (keys) bits.push(this.fmtB(bytes) + ' in ' + keys + (keys === 1 ? ' key' : ' keys'));
        if (this.trafEstimate) bits.push(this.fmtB(this.trafEstimate) + ' in ' + (this.trafDbs.length ? this.trafDbs.length + ' database' + (this.trafDbs.length === 1 ? '' : 's') : 'quota storage'));
        return bits.length ? bits.join(' · ') : 'nothing stored';
      },

      toggleConsole() {
        this.consoleOpen = !this.consoleOpen;
        if (this.consoleOpen) this.scrollConsole();
      },

      // Load + mount the rich debugConsole panel into the footer. Self-loads
      // the kit and component via gh.load so pages that only pull fab.js
      // still get the upgrade; on failure we keep the inline fallback list.
      // gh.load executes its file synchronously, but the fetch underneath it
      // can hang (a stuck connection leaves the load promise unsettled). A bare
      // `await gh.load(...)` here would then dangle forever and the rich panel
      // would never mount — yet we'd never fall back either. So race each
      // self-load against a timeout and retry once: a fresh gh.load issues a
      // new fetch, which often clears a transient stall; a hard stall bails to
      // the inline fallback list instead of hanging. `isReady` short-circuits
      // once the file has registered, so a merely-slow load isn't retried.
      async _selfLoad(path, isReady, { tries = 2, timeoutMs = 8000 } = {}) {
        for (let i = 0; i < tries && !isReady(); i++) {
          try {
            // Pass `by` explicitly — an Alpine method can't reach the scoped
            // `gh` handed to fab.js at load time, so stamp the attribution here
            // (the load wrapper honors opts.by ahead of any other signal).
            await Promise.race([
              window.gh.load(path, { by: 'alpineComponents/fab.js' }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('self-load timeout')), timeoutMs))
            ]);
          } catch (e) {}
        }
        return isReady();
      },

      async _mountConsolePanel() {
        if (this.consolePanelReady) return;
        try {
          if (window.gh) {
            if (!window.consoleKit) await this._selfLoad('kits/console.js', () => !!window.consoleKit);
            if (!window.__debugConsoleRegistered) await this._selfLoad('alpineComponents/console.js', () => !!window.__debugConsoleRegistered);
          }
          if (!window.__debugConsoleRegistered || !window.Alpine) return;
          await this.$nextTick();
          const host = this.$refs.consoleHost;
          if (!host || host.getAttribute('x-data')) return;
          host.setAttribute('x-data', 'debugConsole');
          window.Alpine.initTree(host);
          this.consolePanelReady = true;
        } catch (e) {}
      },

      clearConsole() {
        if (window.consoleKit) console.clear();
        else this.consoleLogs = [];
      },

      _ago(dateStr) {
        const s = (Date.now() - new Date(dateStr)) / 1000;
        const u = { y: 31536000, mo: 2592000, d: 86400, h: 3600, m: 60 };
        for (const [k, v] of Object.entries(u)) if (s >= v) return Math.floor(s / v) + k + ' ago';
        return 'just now';
      },

      // "What am I looking at?" Reads recent commits for the booted ref and
      // tells the story up to that tip: the latest PR merge that precedes it
      // (the version), plus any commits sitting on top of that merge. On main
      // those extra commits are direct pushes; on a branch they're its own
      // unmerged commits. The PR number comes from the merge commit subject
      // (Merge pull request #N) and its title from the body, so nothing needs
      // hand-stamping. Lazy: fires on first drawer open, refreshable.
      async loadVersion(force) {
        if (force) this.verLoaded = false;
        if (this.verLoaded || this.verLoading) return;
        if (!window.GH) { this.verError = 'window.GH not available on this page'; return; }
        this.verError = '';
        this.verLoading = true;
        const repo = this.repo || 'mehrlander/web-tools';
        // Prefer the ref gh-api.js actually booted from (set on a ?use= page),
        // since that's the code running; fall back to the page's own ref. In a
        // toss, __bundleRef pins the SHELL's lib chain, not the subject — the
        // adopted ref is the one the viewer is looking at, so use it directly.
        const ref = this.viaToss ? (this.ref || 'main') : (window.__bundleRef || this.ref || 'main');
        let token = '';
        try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
        try {
          const gh = new window.GH({ repo, ref, token });
          // quiet: a background version check must never hijack the page with
          // the token-entry prompt on a 401/403 — we surface verError instead.
          const list = await gh.req('commits?sha=' + encodeURIComponent(ref) + '&per_page=30', { quiet: true });
          const tip = list[0];
          let mergeIdx = -1, pr = null;
          for (let i = 0; i < list.length; i++) {
            const m = list[i].commit.message.split('\n')[0].match(/^Merge pull request #(\d+)/);
            if (m) { mergeIdx = i; pr = m[1]; break; }
          }
          const merge = mergeIdx >= 0 ? list[mergeIdx] : null;
          let prTitle = '';
          if (merge) {
            const lines = merge.commit.message.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length > 1) prTitle = lines[lines.length - 1].slice(0, 80);
          }
          const dated = merge || tip;
          this.ver = {
            ref,
            sha: tip ? tip.sha.slice(0, 7) : '',
            tipUrl: tip ? tip.html_url : '',
            pr,
            prTitle,
            prUrl: pr ? 'https://github.com/' + repo + '/pull/' + pr : '',
            since: mergeIdx >= 0 ? mergeIdx : list.length,
            ago: dated ? this._ago(dated.commit.committer.date) : ''
          };
          this.verLoaded = true;
        } catch (e) {
          this.verError = 'Version: ' + ((e && e.message) || String(e));
        }
        this.verLoading = false;
      },

      // Mode detection. previewRef is the ref this view is running off of, if
      // any: the adopted subject ref inside a toss, else a ?use= lib pin (the
      // real query param, or __bundleRef set by a blob boot). offRef is the
      // boolean the launcher and escape handle key on. viewingRef is the ref
      // the page is actually rendered at (the branch list marks it "current",
      // distinct from frameRef, the pending selection awaiting a toss).

      // The default branch is not a preview. A toss (or ?use=) AT the default
      // branch renders exactly the code the live page serves, so it gets the
      // neutral launcher and no escape banner — the banner's only offer is
      // "return to main," which is nothing when main is what you're looking at.
      // The mechanism (toss vs direct) is not the question; the ref is. Mirrors
      // explorer.js's offRef, which already keys on ref !== defaultRef.
      _offDefault(ref) {
        if (!ref) return null;
        return ref === (this.defaultBranch || 'main') ? null : ref;
      },
      get previewRef() {
        // A toss adopts a subject ref; a ?use= page carries the ref in the real
        // query param. (window.__bundleRef is NOT a signal — a normal boot sets
        // it to the default branch, so it can't distinguish off-canonical.)
        if (this.viaToss) return this._offDefault(this.ref || 'main');
        // ...but only if the page HONORED it. Not every page's boot block
        // reads ?use=; several hardcode the default branch, and on those the
        // param sits in the address bar doing nothing. Reporting a preview the
        // page is not running is worse than reporting none: you go looking for
        // branch behavior in default-branch code. window.gh.ref is what the
        // loader is actually pinned to, so it settles it.
        if (this.ignoredUse) return null;
        try { const u = new URLSearchParams(location.search).get('use'); if (u) return this._offDefault(u); } catch (e) {}
        return null;
      },

      // The ref the loader is actually pinned to, as opposed to the one the
      // address bar asks for. this.ref is the mount's declared ref (data-ref,
      // or a toss subject's), which is not the same question.
      get loaderRef() { return (window.gh && window.gh.ref) || this.ref || 'main'; },

      // ?use=<ref> is in the URL but the loader booted something else: this
      // page's boot block does not implement the preview mechanism.
      get ignoredUse() {
        if (this.viaToss) return '';
        let asked = '';
        try { asked = new URLSearchParams(location.search).get('use') || ''; } catch (e) { return ''; }
        if (!asked) return '';
        const actual = (window.gh && window.gh.ref) || '';
        return actual && actual !== asked ? asked : '';
      },
      get offRef() { return !!this.previewRef; },
      get viewingRef() { return this.previewRef || this.defaultBranch || 'main'; },

      // Is there a deployed page to leave a preview FOR? Three things have to be
      // true, and all three were assumed until 2026-08-20, which is how the
      // escape button came to offer a github.io URL that 404s for every private
      // repo in the estate.
      //
      // A ROUTED subject is read through a renderer at every ref, so it has no
      // page of its own; goToRef carried that one case as a special case from
      // the day the data route landed, and it is this predicate's first clause
      // now. A LOCAL subject is a paste, with no repo behind it. And a repo
      // serving no Pages has no deployed twin at ANY ref: for those the toss is
      // not a preview of the page, it IS the page, which is the whole of home
      // and every other private repo here.
      //
      // Unasked (null) reads as true, so nothing changes for a Pages-served
      // page before the flag lands.
      get liveTwin() {
        if (this.subjectRoute || this.subjectLocal) return false;
        return this.subjectPages !== false;
      },

      // A selection worth acting on: one that is not already what you are looking
      // at. The toss button keys on this, so it is present exactly when it would
      // change something.
      get refPending() { return (this.frameRef || 'main') !== this.viewingRef; },

      // The canonical deployed URL for the current subject, if it has one
      // (a github.io Pages page). Empty for a repo that isn't Pages-served.
      canonicalUrl() {
        if (!this.liveTwin) return '';
        if (!this.repo || !this.path) return '';
        const [owner, name] = this.repo.split('/');
        if (!owner || !name) return '';
        return 'https://' + owner + '.github.io/' + name + '/' + this.path;
      },

      // Leave the preview for the live page. From a toss, go to the subject's
      // canonical deployed URL; from a ?use= page, drop the use param and reload.
      returnToLive() {
        // With no deployed twin the canonical version is this same view at the
        // default branch, read through the renderer like every other ref. So
        // re-address in place rather than leaving for a URL that 404s, which is
        // what an empty canonicalUrl used to turn into: a button that did
        // nothing at all.
        if (!this.liveTwin) return this.renderAtRef(this.defaultBranch || 'main');
        this._handOffDrawer();
        if (this.viaToss) {
          const url = this.canonicalUrl();
          if (url) location.href = url;
          return;
        }
        try {
          const u = new URL(location.href);
          u.searchParams.delete('use');
          location.href = u.toString();
        } catch (e) { location.reload(); }
      },

      // The toss address for the picked ref — toss-render's #gh mode, which only
      // accepts allowlisted owners (so no toss for other repos). Inside a toss
      // the fab already IS the renderer, so re-addressing goes via __tossNavigate.
      get tossUrl() {
        if (this.viaToss) return '';
        if (!this.repo || !this.path || this.repo.split('/')[0] !== 'mehrlander') return '';
        return 'https://mehrlander.github.io/web-tools/pages/toss-render.html#gh=' +
          this.repo + '@' + (this.frameRef || 'main') + ':' + this.path;
      },


      // The interesting rows: the baseline, anything holding a different copy
      // of this page, and anything unjudged. The bulk (same bytes, or no copy
      // at all) is real but not worth the height until asked for.
      get visibleBranches() {
        if (this.showAllBranches) return this.pageBranches;
        return this.pageBranches.filter(b =>
          b.status !== 'same' && b.status !== 'missing' || b.name === this.frameRef);
      },
      get hiddenBranchCount() { return this.pageBranches.length - this.visibleBranches.length; },

      // Expanding reveals rows that were never worth a compare call; fill in
      // the newly visible ones (still capped, see loadDivergence).
      expandBranches() {
        this.showAllBranches = !this.showAllBranches;
        if (this.showAllBranches && this._branchGh) this.$nextTick(() => this.loadDivergence(this._branchGh));
      },

      // Pure classification for the branch scan: mark each branch by how its
      // copy of the page relates to the default branch's, and order the list
      // baseline → differs → unknown → same → missing, newest-first within a
      // group. "Differs" is the row the tab exists for: a branch carrying
      // another version of the page you are looking at.
      classifyRows(branches, defaultBranch, defaultOid) {
        const rows = branches.map(b => ({
          ...b,
          div: null, divBusy: false,   // filled lazily by loadDivergence()
          pr: null,                    // filled by loadBranchPulls()
          session: '',                 // authoring session, same loader
          status: b.name === defaultBranch ? 'baseline'
                : !('fileOid' in b) ? 'unknown'
                : !b.fileOid ? 'missing'
                : b.fileOid === defaultOid ? 'same' : 'differs'
        }));
        const rank = { baseline: 0, differs: 1, unknown: 2, same: 3, missing: 4 };
        return rows.sort((a, b) =>
          (rank[a.status] - rank[b.status]) || (b.date || '').localeCompare(a.date || ''));
      },

      // The render tab's scan: which branches hold a DIFFERENT version of
      // this page? One GraphQL round-trip (branchesForPath) compares the
      // page's blob id at every branch tip against the default branch; when
      // that path is unavailable (no token, old gh-fetch), degrade to a plain
      // dated list with status 'unknown' — still selectable, just unjudged.
      // The scan's reads, behind a sixty-second read-through cache.
      //
      // "Which branches carry a different copy of THIS path" is genuinely
      // per-file, so it reloads on every swipe of the file deck and should.
      // What it should not do is re-ask for a file the reader has already been
      // on: a deck is swiped back and forth, and without this, stepping four
      // files along and four back is eight scans for four answers. Same TTL
      // and the same reasoning as kits/branch-brief.js: a cache that describes
      // one reading pass is the only kind that keeps a live-read claim honest.
      // The PROMISE is stored, so a swipe that lands mid-flight joins the read
      // rather than starting a second one, and a rejection evicts itself so a
      // failure is not the answer for a minute.
      _scan: {},
      _scanRead(key, make) {
        const now = Date.now();
        const hit = this._scan[key];
        if (hit && now - hit.at < 60000) return hit.p;
        const p = make();
        this._scan[key] = { at: now, p };
        p.catch(() => { if (this._scan[key]?.p === p) delete this._scan[key]; });
        return p;
      },

      async loadPageBranches(force) {
        if (force) { this.pageBranchesLoaded = false; this._scan = {}; this._div = {}; }
        if (this.pageBranchesLoaded || this.pageBranchesLoading) return;
        if (!window.GH) { this.frameError = 'window.GH not available on this page'; return; }
        this.frameError = '';
        this.branchNote = '';
        this.pageBranchesLoading = true;
        let token = '';
        try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
        try {
          const tmp = new window.GH({ repo: this.repo || 'mehrlander/web-tools', token });
          if (typeof tmp.branches !== 'function') {
            this.frameError = 'gh-fetch.js not loaded (branches() unavailable)';
          } else {
            let rows = null;
            if (this.path && typeof tmp.branchesForPath === 'function') {
              try {
                const r = await this._scanRead('path|' + this.repo + '|' + this.path,
                                                 () => tmp.branchesForPath(this.path));
                this.defaultBranch = r.defaultBranch || 'main';
                rows = this.classifyRows(r.branches, this.defaultBranch, r.defaultOid);
              } catch (e) { /* degrade below */ }
            }
            if (!rows) {
              this.branchNote = 'File comparison unavailable (needs a token) — showing all branches.';
              // Keyed on the REPO alone, not the path: this is the whole
              // branch list, which is what makes it the degraded answer.
              let list;
              try {
                list = typeof tmp.branchesDated === 'function'
                  ? await this._scanRead('all|' + this.repo, () => tmp.branchesDated()) : null;
              } catch (e) { list = null; }
              if (!list) list = (await this._scanRead('bare|' + this.repo, () => tmp.branches()))
                .map(b => ({ name: b.name, date: '', ago: '' }));
              rows = this.classifyRows(list, this.defaultBranch, null);
            }
            this.pageBranches = rows;
            this.pageBranchesLoaded = true;
            this._branchGh = tmp;
            // The guide rendered before the scan knew the branch names; a
            // slashed ref in one of its blob links may split better now.
            this.renderPrBody(true);
            this.loadPagesFlag(tmp);
            this.loadDivergence(tmp);
            this.loadBranchPulls(tmp);
          }
        } catch (e) {
          this.frameError = 'Branches: ' + ((e && e.message) || String(e));
        }
        this.pageBranchesLoading = false;
      },

      // ── The layer stack ────────────────────────────────────────────────
      //
      // A page reaches the screen through a stack of frames: a toss puts the
      // renderer over the page, the app view puts the app over both. Every pane
      // in this drawer answers about exactly ONE of them, and until this it
      // picked one silently, which is how the app view came to report show-repo
      // while you were reading a page from another repo.
      //
      // DERIVED BY WALKING, not by remembering an announcement. The difference
      // is what happens when a frame goes away: an announced subject outlives
      // its frame and has to be cleared by whoever removed it, and nobody does,
      // so the drawer would describe a page no longer on screen. A walk has
      // nothing to clear.
      //
      // Each window contributes one layer, named two ways. A frame with an
      // address of its own names itself (the same github.io inference infer()
      // runs for this document). A frame with no usable address is the rendered
      // subject: toss-render mounts it from a blob: URL, so its parent's
      // __tossSubject announcement is the only name it has. Both cases descend,
      // which is what makes a toss of a toss come out as four rows rather than
      // stopping at the first one.

      _resolveSubject(s0) {
        return (s0 && s0.repo && !s0.route && this._routedFromAddress(s0)) || s0;
      },

      // owner/repo plus path from a github.io address, or null.
      _fromPagesUrl(loc) {
        let host = '', path = '';
        try { host = loc.hostname || ''; path = loc.pathname || ''; } catch (e) { return null; }
        const m = host.match(/^([^.]+)\.github\.io$/);
        if (!m) return null;
        const owner = m[1];
        const segs = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
        if (!segs.length) return { repo: owner + '/' + owner + '.github.io', path: '' };
        return { repo: owner + '/' + segs[0], path: segs.slice(1).join('/') };
      },

      // The child window holding content, or null. Cross-origin access throws,
      // which is the answer rather than an error: that layer is sealed and the
      // strip says so instead of implying a shorter stack.
      _contentChild(w) {
        let count = 0;
        try { count = w.frames.length; } catch (e) { return null; }
        for (let i = 0; i < count; i++) {
          try {
            const kid = w.frames[i];
            void kid.location.href;         // throws for cross-origin
            return { win: kid, sealed: false };
          } catch (e) { return { win: null, sealed: true }; }
        }
        return null;
      },

      // `root` is a seam for the tests, which cannot make jsdom serve a
      // github.io frame or a cross-origin one. Everything real passes nothing.
      readLayers(root) {
        const out = [{ repo: this.shellRepo || '', ref: this.shellRef || 'main',
                       path: this.shellPath || '', role: 'shell' }];
        let w = root || window;
        for (let depth = 0; depth < 6; depth++) {
          const kid = this._contentChild(w);
          if (!kid) break;
          if (kid.sealed) { out.push({ sealed: true, role: 'sealed' }); break; }
          // A frame with an http(s) address names itself. Off github.io the
          // repo cannot be inferred, and the row still carries the filename
          // rather than collapsing the stack: a preview served from loopback is
          // exactly where you want the strip to be honest about the nesting.
          const loc = kid.win.location;
          const named = this._fromPagesUrl(loc)
            || (/^https?:$/.test(String(loc.protocol || ''))
                ? { repo: '', path: String(loc.pathname || '').replace(/^\/+/, '') } : null);
          if (named) {
            let use = '';
            try { use = new URLSearchParams(loc.search).get('use') || ''; } catch (e) {}
            out.push({ repo: named.repo, path: named.path, ref: use || 'main' });
          } else {
            // No address of its own: the parent's announcement is its name.
            let s = null;
            try { s = this._resolveSubject(w.__tossSubject); } catch (e) {}
            if (!s || !(s.repo || s.local)) break;
            out.push({ repo: s.repo || '', path: s.path || '', ref: s.ref || 'main',
                       local: !!s.local, label: s.label || '', route: s.route || '',
                       via: s.via || null, named: false });
          }
          w = kid.win;
        }
        // A subject announced by THIS document with no frame of its own: a file
        // deck slide, or the stage's reader, which are in-document surfaces
        // rather than nested browsing contexts. The walk cannot find them, and
        // without this the refresh would point the drawer back at the shell and
        // undo the adoption. Deduped, since a toss's subject is already the last
        // row the loop pushed.
        let own = null;
        try { own = this._resolveSubject((root || window).__tossSubject); } catch (e) {}
        if (own && (own.repo || own.local)) {
          const last = out[out.length - 1];
          const same = last && !last.sealed && last.repo === (own.repo || '')
                       && (last.path || '') === (own.path || '');
          if (!same) {
            out.push({ repo: own.repo || '', path: own.path || '', ref: own.ref || 'main',
                       local: !!own.local, label: own.label || '', route: own.route || '',
                       via: own.via || null });
          }
        }

        // The caption each row carries. A renderer says so wherever it sits,
        // since that is what it is; the outermost row is the app only when
        // something is stacked under it, and a lone page is neither.
        out.forEach((L, i) => {
          if (L.sealed) { L.role = 'sealed'; return; }
          if (/toss-render\.html$/.test(L.path || '')) { L.role = 'renderer'; return; }
          // A lone layer is just the page. "Shell" only means anything against
          // something nested inside it, and with nothing nested the word is
          // jargon aimed at a reader who is simply looking at a page.
          if (i === out.length - 1) { L.role = 'page'; return; }
          L.role = i === 0 ? 'app' : 'frame';
        });
        return out;
      },

      // Re-derive, and keep the selection pointed at the same layer where one
      // still matches. The default is the innermost readable layer, which is
      // what the reader is actually looking at.
      refreshLayers() {
        const pick = this._layerPick;
        this.layers = this.readLayers();
        let want = this.layers.length - 1;
        while (want > 0 && this.layers[want].sealed) want--;
        if (pick) {
          const same = this.layers.findIndex(L => !L.sealed && L.repo === pick.repo
                                                  && (L.path || '') === pick.path);
          if (same >= 0) want = same;
        }
        this.layerIndex = want;
        // Choosing the row is only half of it. Without this the strip said PAGE
        // while every pane under it still described the app, which is the same
        // silent mismatch this whole control exists to end.
        const L = this.layers[want];
        if (!L || L.sealed) return;
        if (L.repo === this.repo && (L.path || '') === (this.path || '')) return;
        const was = { repo: this.repo, ref: this.ref, path: this.path };
        this._pointAt(want);
        this._afterIdentityChange(was);
      },

      // Selecting a layer re-points the whole drawer, not part of it: one pane
      // following the pick while another does not is worse than either fixed
      // choice would have been.
      selectLayer(i) {
        const L = this.layers[i];
        if (!L || L.sealed || i === this.layerIndex) return;
        const was = { repo: this.repo, ref: this.ref, path: this.path };
        this._pointAt(i);
        this._layerPick = { repo: L.repo || '', path: L.path || '' };
        this._afterIdentityChange(was);
      },

      // Aim the drawer at one layer. Assignment only: the caller owns the
      // invalidation, since the default selection and an explicit pick reach
      // here from different places.
      _pointAt(i) {
        const L = this.layers[i];
        if (!L || L.sealed) return;
        this.layerIndex = i;
        this.repo = L.repo || '';
        this.path = L.path || '';
        this.ref = L.ref || 'main';
        this.subjectLocal = !!L.local;
        this.subjectLabel = L.label || '';
        this.subjectRoute = L.route || '';
        this.subjectVia = L.via || null;
        // viaToss means "the drawer is describing something other than the
        // document it is mounted on", which is exactly a non-zero index.
        this.viaToss = i > 0;
      },

      // AN INDEX FILE IS NAMED BY ITS FOLDER, the way the web addresses it.
      // The strip has room for one word per row, and `index.html` is the one
      // filename in the tree that identifies nothing: the app, the page list
      // and every demo folder would all render it. `/web-tools/app/` is the
      // app, so the row says app. The full path is a tap away in layerTitle
      // and spelled out in the Render tab's identity block.
      layerName(L) {
        if (!L) return '';
        if (L.sealed) return 'sealed';
        if (L.label) return L.label;
        const segs = (L.path || '').split('/').filter(Boolean);
        const last = segs.pop() || '';
        if (/^index\.[a-z0-9]+$/i.test(last) && segs.length) return segs.pop();
        return last || L.repo || 'unknown';
      },
      layerTitle(L) {
        if (!L) return '';
        if (L.sealed) return 'This layer renders under an opaque origin, so it cannot be read from here.';
        return (L.repo || 'no repo') + '@' + (L.ref || 'main') + (L.path ? ':' + L.path : '');
      },
      // A per-row mark, so a layer sitting on branch code cannot hide behind a
      // neutral launcher. It compares against 'main' rather than each layer's
      // real default branch, which would cost one API call per layer; the
      // SELECTED layer's ref bar still uses the real answer.
      layerOffRef(L) {
        return !!L && !L.sealed && !!L.ref && L.ref !== 'main';
      },

      // ONE GLYPH SLOT, THREE THINGS IT CAN SAY, in falling order of urgency.
      // Sealed first, since a row that cannot be read is the only one whose
      // mark also explains why it will not respond. Then the off-ref disc,
      // which stays exactly as urgent as it was: a layer sitting on branch
      // code is the thing a viewer cannot see any other way, so it takes the
      // slot from anything below it.
      //
      // Last, and this is what the slot used to waste, the layer's own
      // identity. A row at its default ref spent the slot on a 25%-opacity
      // circle, which is a placeholder holding a column open and nothing else.
      // In the app view that left the strip reading `app`, `toss-render.html`,
      // `app.html`: two rows named for an app, from two different repos, and
      // no mark to say which one is the Web Tools app the reader is standing
      // in. Reported from a phone, and the ambiguity is the report.
      //
      // BY ROLE, NOT BY REPO, and the app row costs nothing for it. The estate
      // declares a mark per repo and the app caches them, so a row could wear
      // its repo's icon; that reads better only where the cache exists, and it
      // reaches for show-repo's internals from a component that mounts on any
      // page. The role is already derived here and is the same answer
      // everywhere, which is what a spatial control wants.
      //
      // The app row is where the two readings COINCIDE, so it takes the repo
      // mark without doing a repo lookup: the layer that frames a renderer is
      // the Web Tools app, and ph-toolbox is what web-tools declares for itself
      // in .web-tools.json, which is the mark on its card in the app's own
      // sidebar. A reader already knows that glyph as Web Tools. ph-frame-
      // corners is the estate's render mark, and the page row is the generic
      // file. Change one, change all three, so the strip keeps saying the same
      // words in every context.
      layerIcon(L) {
        if (!L) return 'ph-circle opacity-25';
        if (L.sealed) return 'ph-lock-simple opacity-60';
        if (this.layerOffRef(L)) return 'ph-disc text-warning';
        if (L.role === 'app') return 'ph-toolbox opacity-50';
        if (L.role === 'renderer') return 'ph-frame-corners opacity-50';
        return 'ph-file-html opacity-50';
      },

      // Whether the repo serves Pages. Only the REST repo object answers it,
      // GraphQL carrying no such field, so it is one extra read rather than a
      // field on the branch query; it is cached beside the branch scans and
      // blocks nothing, since an unanswered flag reads as "assume yes".
      async loadPagesFlag(gh) {
        if (!this.repo) return;
        try {
          const r = await this._scanRead('repo|' + this.repo, () => gh.req('/repos/' + this.repo));
          this.subjectPages = !!(r && r.has_pages);
        } catch (e) { /* unknown stays unknown */ }
      },

      // Ahead/behind the default branch, for the rows the list actually shows.
      // One REST compare per branch, so this is deliberately NOT run over all
      // ~290 branches: it is scoped to the handful holding a different copy of
      // this page, which is the set the tab exists to surface. The rest fill in
      // if you expand the list. Failures leave the row unannotated rather than
      // erroring: divergence is a nicety, the branch is still selectable.
      // Memoized across scans, because ahead/behind is a property of the
      // BRANCH PAIR and not of the file. The scan itself is genuinely
      // per-file (which branches carry a different copy of this path), so it
      // reloads on every swipe of the file deck and rebuilds its rows; without
      // this, twelve fresh row objects meant twelve fresh compares per swipe,
      // and reading ten files with five branches each was fifty REST compares
      // for an answer that had not changed. Not routed through
      // kits/branch-brief.js's cache on purpose: that one holds the WHOLE
      // compare, patches included, which is most of a megabyte here, and all
      // this needs is two integers.
      _div: {},

      async loadDivergence(gh, names) {
        const base = this.defaultBranch || 'main';
        if (typeof gh?.compare !== 'function') return;
        const want = (names
          ? this.pageBranches.filter(b => names.includes(b.name))
          : this.visibleBranches
        ).filter(b => b.status !== 'baseline' && !b.div && !b.divBusy).slice(0, 12);
        for (const row of want) {
          const key = (this.repo || '') + '|' + base + '...' + row.name;
          if (this._div[key] !== undefined) { row.div = this._div[key]; continue; }
          row.divBusy = true;
          try {
            const c = await gh.compare(base, row.name);
            row.div = {
              ahead: c.ahead_by || 0,
              behind: c.behind_by || 0,
              // "behind or identical" means every commit here is already on the
              // default branch. Squash merges defeat this, so it is a hint, not
              // the content-level verdict lib/kits/branch-status.js computes.
              merged: (c.ahead_by || 0) === 0,
            };
          } catch (e) { row.div = null; }
          this._div[key] = row.div;
          row.divBusy = false;
        }
      },

      // Attach each branch's open PR, and with it the Claude Code session that
      // authored the branch (gh.pulls lifts the session URL out of the guide
      // PR body's footer). One REST call for the whole list, the same source
      // the estate's Open view reads, so a branch row here offers the same
      // route back to the conversation that produced it.
      async loadBranchPulls(gh) {
        if (typeof gh?.pulls !== 'function') return;
        // Through the minute cache, keyed on the repo: this runs after every
        // branch scan, and a scan re-runs on every file-deck swipe while the
        // drawer is open, so without the memo each swipe re-fetched the open
        // PR list and re-walked five GraphQL pages of branch history.
        let pulls;
        try { pulls = await this._scanRead('pulls|' + this.repo, () => gh.pulls('open', 100)); } catch (e) { return; }
        const byHead = new Map((pulls || []).map(p => [p.head, p]));

        // The authoring session, from the branch's own commit trailer rather
        // than the PR body. The body only answers while a PR is open, which is
        // a rounding error against a branch estate (2 of 404 branches in
        // mehrlander/home), so gating the mark on a PR left it dark for nearly
        // every row. The estate's Open view moved off that source; this is the
        // same move for the render tab.
        //
        // The exact source is the crawl's compare (branch-status compareFields),
        // but this list comes from branchesDated() and has no compare to read,
        // so it takes the ancestor walk: approximate, and the reason
        // `sessionExact` is false here. The PR body stays the last fallback.
        let walk = {};
        if (typeof gh?.branchSessions === 'function') {
          try { walk = await this._scanRead('walk|' + this.repo, () => gh.branchSessions()); } catch { walk = {}; }
        }
        for (const row of this.pageBranches) {
          const p = byHead.get(row.name);
          if (p) row.pr = { number: p.number, session: p.session || '', draft: p.draft,
                            title: p.title || '', body: p.body || '' };
          row.session = walk[row.name] || p?.session || '';
          row.sessionExact = false;
        }
        // The guide pane has nothing to show until this call lands, so it is
        // driven from here rather than watched: the PR body arrives exactly
        // once per scan, with the rows.
        this.renderPrBody();
        this.loadBranchPrs();
      },

      prUrl(n) { return 'https://github.com/' + (this.repo || 'mehrlander/web-tools') + '/pull/' + n; },

      pickFrameRef(name) { this.frameRef = name; },

      // ── The ref bar, the dropdown, and the guide ────────────────────────

      toggleRefMenu() {
        this.refMenu = !this.refMenu;
        if (this.refMenu) this.loadPageBranches();
      },

      // One tap: select and render. The confirm step this replaces treated a
      // preview swap as if it were destructive; it costs a back button.
      goToRef(name) {
        if (!name || name === this.viewingRef) return;
        this.refMenu = false;
        this.frameRef = name;
        // The default branch means "leave the preview for the live deployed
        // page" only where one exists; returnToLive asks liveTwin and
        // re-addresses instead where it does not, so this hands it both cases
        // rather than carrying a second copy of the test.
        if (name === (this.defaultBranch || 'main')) return this.returnToLive();
        this.renderAtRef(name);
      },

      // ── The compare bar: the second ref ──────────────────────────────────
      //
      // The surface showing the file does not decide what it is compared
      // against; this does, and it says so on one channel the way the deck
      // says what it is showing on another. Two globals and two events, no
      // reference held in either direction.
      //
      // The announced base is a SHA (a changeset's merge base) with a display
      // name beside it, so the pair travels: `base` is what a client fetches,
      // `baseName` is what a reader is told. An override is a branch, where
      // the two are the same string.

      get compareName() {
        return this.compareRef || this.subjectBaseName || this.subjectBase || '';
      },
      // What the file surface is told, or null for "do not compare".
      get comparePair() {
        if (this.compareOff || !this.subjectBase) return null;
        if (this.compareRef) return { base: this.compareRef, baseName: this.compareRef };
        return { base: this.subjectBase, baseName: this.subjectBaseName || this.subjectBase };
      },
      // The rows worth offering, which is the ref bar's list minus the ref you
      // are already on: a file compared against itself is the one answer known
      // in advance.
      get compareTargets() {
        return this.visibleBranches.filter(b => b.name !== this.viewingRef);
      },

      toggleCompareMenu() {
        this.compareMenu = !this.compareMenu;
        if (this.compareMenu) { this.refMenu = false; this.loadPageBranches(); }
      },
      // '' means the announced base, which is also how the reader comes back
      // from an override without having to remember what it was.
      compareWith(name) {
        this.compareMenu = false;
        this.compareRef = name || '';
        this.compareOff = false;
        this.publishCompare();
      },
      compareStop() {
        this.compareMenu = false;
        this.compareOff = true;
        this.publishCompare();
      },
      // The global is for a surface that mounts later (the next deck slide);
      // the event is for the ones already mounted. Same pair, same reasoning,
      // as __tossSubject and toss-subject in the other direction.
      // `off` is a field rather than a null payload, because null already
      // means "nobody has published anything" to a card reading the global at
      // mount, and a deck that has just opened must not read the previous
      // deck's silence as an instruction.
      publishCompare() {
        const c = this.comparePair;
        const detail = { repo: this.repo, ref: this.viewingRef, off: !c,
                         base: c ? c.base : '', baseName: c ? c.baseName : '' };
        window.__compareRef = detail;
        window.dispatchEvent(new CustomEvent('web-tools:compare-ref', { detail }));
      },

      // ── The width half of the same question ──────────────────────────────
      // Reachable wherever there is a frame to size, or an address that can
      // make one. The second half is the same allowlist tossUrl already
      // enforces, so a page from a repo the renderer will not serve gets no
      // width bar at all rather than four buttons that do nothing.
      // The test is the LEVER, not viaToss: on the renderer's own empty panel
      // there is no subject yet and viaToss is false, but the frame and its
      // lever are both right there, and a width set before a render is simply
      // the width the next render arrives at.
      get widthReachable() {
        return typeof window.__tossWidth === 'function' || !!this.tossUrl;
      },

      setWidth(w) {
        if (w === this.frameWidth) return;
        // Inside a toss the frame is already the viewport: resize it and the
        // subject re-lays out in place, no navigation and nothing reloaded.
        if (typeof window.__tossWidth === 'function') {
          this.frameWidth = window.__tossWidth(w);
          return;
        }
        // Outside one, the only honest answer is a frame, so go get one.
        const url = this.widthUrl(w);
        if (!url) return;
        this._handOffDrawer();
        location.href = url;
      },

      // The toss address for this page at a given width. ?w= rides the
      // RENDERER's query, beside ?use= and outside the #gh= address: the
      // fragment says what to show, the query says how. Inside the address it
      // would be read as part of the PAGE's own query and handed to the page,
      // which is not what asked for it.
      widthUrl(w) {
        const base = this.tossUrl;
        if (!base) return '';
        const cut = base.indexOf('#');
        const head = cut < 0 ? base : base.slice(0, cut);
        const frag = cut < 0 ? '' : base.slice(cut);
        return head + (w ? '?w=' + w : '') + frag;
      },

      // ── The path picker: render any file, not just this one ─────────────
      // The drawer's whole subject is rendering a file at a ref. The ref half
      // has a picker; this is the other half. It reuses show-repo's tap-through
      // selector rather than growing a second tree walker, which is also why
      // path-picker gained an injectable GH: its one hidden dependency was
      // Alpine's browser store, and the fab mounts on pages that have none.

      _picker() {
        const host = this.$refs && this.$refs.picker;
        if (!host) return null;
        // NOT firstElementChild. The mount is behind an x-if now, and Alpine
        // leaves the <template> in the DOM and inserts the content AFTER it,
        // so the first child is the template and carries no instance. Read the
        // children for the one that published itself instead, which is what
        // path-picker's own contract offers (__pathPicker on its root).
        for (const el of host.children) if (el.__pathPicker) return el.__pathPicker;
        return null;
      },
      get pickerOpen() { const p = this._picker(); return !!(p && p.open); },
      togglePicker() {
        const p = this._picker();
        if (!p) return;
        this.ghMenu = false;
        p.toggle();
      },

      // The picker reads through a GH aimed at the repo on screen. A fresh
      // instance rather than window.gh, since the loader's own ref is the code
      // this page booted, not the ref the viewer is looking at.
      pickerGh() {
        let token = '';
        try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
        if (!window.GH) return null;
        return new window.GH({ repo: this.repo || 'mehrlander/web-tools', ref: this.viewingRef, token });
      },

      // The roots: this repo at the ref on display, then every other repo the
      // token can see. This one is first and carries its ref, because it is the
      // one the drawer is about and the only one where "at this ref" means
      // anything; the rest open at their default branch, which is what a
      // cross-repo look wants. Resolved once, lazily, at first open, which is
      // the shape path-picker is built for (it loads a repo's tree on entry,
      // not up front, so a long root list costs nothing to show).
      //
      // Without a token the list degrades to this repo alone rather than
      // erroring: the picker's job here is the current repo, and the others are
      // the bonus.
      async pickerRoots() {
        const repo = this.repo;
        if (!repo) return [];
        // The owner is dropped when it matches this page's, and only then. In a
        // one-account estate every row would otherwise spend a third of a narrow
        // panel restating the same prefix; where the owner differs it is the
        // most important part of the name and stays.
        const owner = repo.split('/')[0] + '/';
        const short = n => (n.startsWith(owner) ? n.slice(owner.length) : n);
        const here = { repo, ref: this.viewingRef, label: short(repo) + ' @ ' + this.viewingRef };
        const gh = this.pickerGh();
        if (!gh || typeof gh.repos !== 'function') return [here];
        try {
          const list = await gh.repos('', { quiet: true });
          const rest = (list || [])
            .map(r => r.full_name)
            .filter(n => n && n !== repo)
            .map(n => ({ repo: n, ref: '', label: short(n) }));
          return [here, ...rest];
        } catch (e) { return [here]; }
      },

      // A picked file is a request to render it, which is the same routing the
      // guide's links get, with one deliberate difference: here EVERY file
      // resolves somewhere. openTarget stays conservative because it is
      // re-aiming links somebody else wrote, and turning a source link into a
      // viewer would be presumptuous; a file the viewer just chose in a picker
      // labelled "render" carries no such doubt, so an unrecognized extension
      // opens in the data view (which reads anything, as code when it must).
      renderPicked(detail) {
        const p = this._picker();
        if (p) p.open = false;
        if (!detail || !detail.path) return;
        const repo = detail.repo || this.repo;
        // The ref falls back to the one on display ONLY within this repo. Across
        // repos it must not: the picker's other roots carry no ref, and stamping
        // this page's branch onto mehrlander/home addresses a branch that does
        // not exist there, which 404s at the renderer with nothing saying why.
        // An empty ref is a real answer, and the address grammar has a word for
        // it: no @ref means the repo's default branch.
        const ref = detail.ref || (repo === this.repo ? this.viewingRef : '');
        const t = this.renderTarget(repo, ref, detail.path, true);
        if (!t) return;
        if (repo === this.repo) this.frameRef = ref || this.viewingRef;
        this.goTarget(t);
      },

      // Open a render target the way the ref bar opens a branch: IN PLACE. A
      // pick used to spawn a tab for anything that was not a page at this repo,
      // which made "render this file" mean two different gestures depending on
      // the extension. It is one gesture; the drawer hands itself forward and
      // reopens on the far side, the same as a ref switch.
      //
      // Inside a toss there is no navigation at all, only a re-address, and the
      // route decides which handle: a page goes through __tossNavigate (#gh=),
      // anything else through __tossRoute, which owns the route map. An older
      // deployed shell has no __tossRoute, so a missing handle falls through to
      // the top-level navigation rather than doing nothing.
      // Leave for a URL. Kept as a named method rather than inlined so a test
      // can watch it, and because the top-document guard is not obvious: a fab
      // declines to mount inside an iframe, but a page that opted back in
      // (data-allow-framed) would otherwise navigate its own frame.
      _go(url) {
        if (!url) return;
        // Setting location.href to the address already showing is a no-op, and
        // silently: no navigation, no hashchange, no reload. Picking the file
        // you are already looking at is a reasonable thing to do (you came back
        // to it), so make it mean "render this again" rather than nothing.
        if (url === location.href) { location.reload(); return; }
        try {
          if (window.top && window.top !== window.self) { window.top.location.href = url; return; }
        } catch (e) { /* cross-origin top: fall through */ }
        location.href = url;
      },

      // Where a target goes when the renderer has to be reloaded rather than
      // re-addressed in place. `t.url` is the DURABLE address, hardcoded at
      // github.io so it is worth copying and worth bookmarking; it is the wrong
      // thing to navigate to from inside a running renderer, for two reasons.
      // It drops the current ?use= pin, so a shell previewing a branch silently
      // reverts to the deployed one on the first pick. And it jumps origins,
      // which is fine in a browser and is not fine in the in-app one, where a
      // cross-origin hop out of the current page is exactly what does not come
      // back. Already on toss-render, only the fragment has to change.
      tossHref(t) {
        if (!t) return '';
        if (!/\/toss-render\.html$/.test(location.pathname)) return t.url;
        return location.origin + location.pathname + location.search +
               '#' + (t.route || 'gh') + '=' + t.addr;
      },

      // owner/repo@ref:path, the address grammar every target carries. Split
      // rather than regex-matched at each call site, since three of them need
      // the same three pieces.
      _addrParts(addr) {
        const m = /^([^/@:\s]+\/[^/@:\s]+)(?:@([^:]+))?:(.+)$/.exec(String(addr || ''));
        return m ? { repo: m[1], ref: m[2] || '', path: m[3] } : null;
      },

      goTarget(t) {
        if (!t || !t.url) return;
        // An in-document slide is not a page to navigate TO. The reader is
        // somewhere in a set they assembled or a changeset they are walking,
        // and answering "show me this at main" by leaving for a single-file
        // renderer throws away the list, their place in it, and the way back.
        // A surface that can show the file where it stands says so by
        // installing the handle, so it is asked first and its answer is
        // authoritative: false means it cannot show that file, and then this
        // is a real navigation after all.
        //
        // THE HANDLE IS THE CLAIM, not the route name. This read
        // `subjectRoute === 'deck'`, which was the only announcer at the time
        // and made the test look like a whitelist; the second one (the stage,
        // route 'stage') would then have had to either lie about its route or
        // watch its reader be navigated out from under it. A route says which
        // door the file came through, and nothing about it can establish
        // whether the surface can re-address. What establishes that is the
        // surface having installed a handle, which is what is asked here. The
        // route is still required, since a page with no routed subject at all
        // is not showing a file in this document.
        if (this.subjectRoute && typeof window.__deckNavigate === 'function') {
          const a = this._addrParts(t.addr);
          try { if (a && window.__deckNavigate(a)) return; } catch (e) {}
        }
        // The drawer survives the trip, the same as a ref switch: you are
        // stepping through the files a guide names, and the list you are
        // stepping through should still be there on the far side.
        this._handOffDrawer();
        if (this.viaToss) {
          if (!t.route && typeof window.__tossNavigate === 'function') {
            window.__tossNavigate(t.addr); return;
          }
          if (t.route && typeof window.__tossRoute === 'function') {
            window.__tossRoute(t.route, t.addr); return;
          }
        }
        this._go(this.tossHref(t));
      },

      // ── The GitHub menu ─────────────────────────────────────────────────
      // The mark beside the path used to be one link to one blob, which is the
      // narrowest thing GitHub can be asked and left its commits, the branch,
      // and the PR list with no route at all. lib/kits/github-links.js already names
      // that set for show-repo's sidebar, so the rows come from there and this
      // adds only the two that need a file to mean anything.

      toggleGhMenu() {
        this.ghMenu = !this.ghMenu;
        if (this.ghMenu) this._needGithubLinks();
      },

      // github-links.js is not in the auto-boot set (it is not a component), so
      // a page that never asked for it does not have it. Load on open, once;
      // ghRows falls back to the two file rows it can build itself until then.
      _needGithubLinks() {
        if (window.GithubLinks || this._ghLinksP) return this._ghLinksP;
        const load = window.gh && typeof window.gh.load === 'function'
          ? window.gh.load('kits/github-links.js') : Promise.reject();
        return this._ghLinksP = Promise.resolve(load)
          .then(() => { this.ghRowsTick++; })
          .catch(() => { this.ghRowsTick++; });
      },

      get ghRows() {
        this.ghRowsTick;                       // re-read after a lazy load lands
        const repo = this.repo;
        if (!repo) return [];
        const ref = this.viewingRef;
        const enc = s => String(s || '').split('/').map(encodeURIComponent).join('/');
        const base = 'https://github.com/' + repo;
        const rows = window.GithubLinks
          ? window.GithubLinks.rows(repo, { ref, defaultRef: this.defaultBranch || 'main' })
          : [{ key: 'home', label: 'Repository', icon: 'ph-house', url: base },
             { key: 'commits', label: 'Commits', icon: 'ph-git-commit', url: base + '/commits/' + enc(ref) }];
        // The file rows. They belong here rather than in github-links.js because
        // that module speaks about a REPO; only this drawer knows which file the
        // viewer is standing in.
        const file = this.path ? [
          { key: 'file', label: 'This file', icon: 'ph-file-code',
            url: base + '/blob/' + enc(ref) + '/' + this.path },
          { key: 'fileCommits', label: 'Commits for this file', icon: 'ph-clock-counter-clockwise',
            url: base + '/commits/' + enc(ref) + '/' + this.path },
        ] : [];
        return [...file, ...rows];
      },

      // ── The guide, and the PRs it can walk ──────────────────────────────

      // The PR the scan found, which is the OPEN one for the ref on display.
      // It is the starting point rather than the whole story: a branch in this
      // estate routinely carries several PRs over its life, since a merge ends a
      // PR but not the branch, and the next push opens a new one.
      get currentPr() {
        const row = this.pageBranches.find(b => b.name === this.viewingRef);
        return (row && row.pr) || null;
      },

      // What the arrows walk: every PR ever opened for this branch, newest
      // first, with the open one first when the fuller list has not loaded yet.
      get branchPrs() {
        const all = this._prsFor === this.viewingRef ? this.prHistory : [];
        if (all.length) return all;
        return this.currentPr ? [this.currentPr] : [];
      },
      get guidePr() { return this.branchPrs[this.guideIdx] || this.branchPrs[0] || null; },
      get guideCount() { return this.branchPrs.length; },
      stepGuide(n) {
        const next = this.guideIdx + n;
        if (next < 0 || next >= this.guideCount) return;
        this.guideIdx = next;
        this.renderPrBody();
      },

      // ── The guide, on open ──────────────────────────────────────────────
      // Three cheap reads, at once, none waiting on the branch scan: the repo's
      // facts (default branch, whether it serves Pages), every PR this ref has
      // had, and the last commit that touched this file on this ref. The scan
      // behind the ref bar (branchesForPath over 500-odd heads, then a compare
      // per row and a session walk) is the dropdown's and runs when it opens.
      // Until 2026-09-02 the guide waited on all of that: two loading marks and
      // several seconds ahead of a body that needed one REST call.
      loadGuide() {
        if (this.subjectLocal || !window.GH) return;
        const gh = this._guideGh();
        this.loadRepoFacts(gh);
        this.loadBranchPrs();
        this.loadPageLast(gh);
      },
      _guideGh() {
        let token = '';
        try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
        return new window.GH({ repo: this.repo || 'mehrlander/web-tools', token });
      },
      async loadRepoFacts(gh) {
        if (!this.repo) return;
        try {
          const r = await this._scanRead('repo|' + this.repo, () => gh.req('/repos/' + this.repo, { quiet: true }));
          if (r && r.default_branch) this.defaultBranch = r.default_branch;
          this.subjectPages = !!(r && r.has_pages);
        } catch (e) { /* unknown stays unknown */ }
      },
      async loadPageLast(gh) {
        const repo = this.repo || 'mehrlander/web-tools', ref = this.viewingRef, path = this.path;
        if (!path || !window.GH) { this.pageLast = null; return; }
        gh = gh || this._guideGh();
        try {
          const list = await this._scanRead('last|' + repo + '|' + ref + '|' + path, () => gh.req(
            'commits?path=' + encodeURIComponent(path) + '&sha=' + encodeURIComponent(ref) + '&per_page=1', { quiet: true }));
          if (this.viewingRef !== ref || this.path !== path) return;   // moved on meanwhile
          const c = (list || [])[0];
          this.pageLast = c ? {
            sha: String(c.sha || '').slice(0, 7), url: c.html_url || '',
            subject: String(c.commit?.message || '').split('\n')[0].slice(0, 100),
            ago: this._ago(c.commit?.committer?.date || c.commit?.author?.date || ''),
          } : null;
        } catch (e) { this.pageLast = null; }
      },
      // The guide's own loading mark: only while the PR read is out and there
      // is nothing at all to show, never while the branch scan runs.
      get guideBusy() { return this._prsBusy && !this.branchPrs.length; },
      // The dropdown's rows that hold a different version of this file, for
      // the one line the standing card says about them once the scan has run.
      get otherVersions() {
        return this.visibleBranches.filter(b => b.name !== this.viewingRef
          && b.status !== 'same' && b.status !== 'missing' && b.status !== 'baseline');
      },

      // Every PR whose head is this branch, open or not. One REST call, made
      // when the guide pane is shown for a branch, because the scan's single
      // open-PR list cannot answer it: a merged PR is gone from that list while
      // its body is often the better account of what the branch did.
      async loadBranchPrs() {
        const ref = this.viewingRef;
        if (this._prsFor === ref || this._prsBusy) return;
        this._prsBusy = true;
        try {
          let token = '';
          try { token = localStorage.getItem('ghToken') || ''; } catch (e) {}
          const gh = new window.GH({ repo: this.repo, token });
          // Through kits/branch-brief.js where the page has it, because that is
          // the SAME CALL behind a sixty-second read-through cache, and on a
          // page running the branch deck the deck has already made it: the
          // drawer joins the cached read instead of issuing a second identical
          // one. Where the kit is absent (a plain page with only the fab) this
          // falls back to the bare call it always made. Not a saving in
          // latency alone; it is one fewer entry against the rate limit per
          // branch looked at.
          const list = window.BranchBrief?.readGuide
            ? (await window.BranchBrief.readGuide(gh, { repo: this.repo, branch: ref })).pulls
            : await gh.req('pulls?state=all&head='
                + encodeURIComponent((this.repo || '').split('/')[0] + ':' + ref)
                + '&per_page=20', { quiet: true });
          const rows = (list || []).map(p => ({
            number: p.number, title: p.title || '', body: p.body || '',
            draft: !!p.draft, state: p.merged_at ? 'merged' : p.state,
            updatedAt: p.updated_at || '',
          })).sort((a, b) => b.number - a.number);
          this.prHistory = rows;
          this._prsFor = ref;
          this.guideIdx = 0;
          if (rows.length) this.renderPrBody();
        } catch (e) { /* the scan's open PR is still the fallback */ }
        this._prsBusy = false;
      },

      get branchPageUrl() {
        return 'https://mehrlander.github.io/web-tools/pages/branch.html#gh=' +
          (this.repo || 'mehrlander/web-tools') + '@' + this.viewingRef;
      },

      // The guide renderer lives in kits/guide-render.js, not here. It was this
      // drawer's alone until 2026-08-06; pages/branch.html renders the same
      // body under the same rules, and the estate's branch takeover renders
      // that page full-viewport, so a second copy would have been three
      // surfaces disagreeing about what a guide link means. These four are the
      // drawer's bindings to it: the kit is pure, and everything that needs to
      // know where this FAB is standing (its branch list, its viewing ref) is
      // supplied here.
      // Pages that pull fab.js alone still get the kit, by the same self-load
      // the console panel uses; the pre-build already carries it.
      _needGuideKit() {
        return window.GuideRender ? Promise.resolve(true)
             : this._selfLoad('kits/guide-render.js', () => !!window.GuideRender);
      },
      _needMarked() { return window.GuideRender.needMarked(); },
      get guideBodyClass() { return window.GuideRender?.bodyClass('drawer') || 'text-[13px]'; },

      // The branch list is the disambiguator for a slashed ref, and it is
      // already loaded here.
      get knownRefs() {
        return [this.defaultBranch || 'main', ...this.pageBranches.map(b => b.name)].filter(Boolean);
      },
      // Null-safe rather than assumed: these three are called synchronously
      // from the path picker as well as from the guide, and a page whose
      // self-load has not landed yet should get "no opinion" rather than a
      // TypeError inside a click handler.
      splitBlobRef(rest) { return window.GuideRender?.splitBlobRef(rest, this.knownRefs) || null; },
      openTarget(href) { return window.GuideRender?.openTarget(href, this.knownRefs) || null; },
      renderTarget(repo, ref, path, any) {
        return window.GuideRender?.renderTarget(repo, ref, path, any) || null;
      },

      // The guide body, rendered once per PR through the shared kit. The
      // drawer supplies only what it alone knows: the branch list that
      // disambiguates a slashed ref, and the ref on display, which breaks the
      // chip strip's dedupe tie in favor of the version being looked at.
      // `quiet` re-renders the body already on screen (the branch scan landed
      // and knownRefs grew) and swaps it in only when the output differs, so a
      // reader mid-scroll is not reset for a render that changed nothing.
      async renderPrBody(quiet) {
        const pr = this.guidePr;
        const key = pr ? String(pr.number) : '';
        if (quiet) { if (this.prBodyFor !== key || !pr || !pr.body) return; }
        else {
          if (this.prBodyFor === key) return;
          this.prBodyFor = key;
          this.prBodyHtml = ''; this.prTargets = [];
          if (!pr || !pr.body) return;
        }
        try {
          if (!await this._needGuideKit()) return;
          await this._needMarked();
        } catch (e) { if (!quiet) this.prBodyHtml = ''; return; }
        if (this.prBodyFor !== key) return;     // a switch landed while loading
        const out = window.GuideRender.render(pr.body, {
          knownRefs: this.knownRefs, preferRef: this.viewingRef,
        });
        if (quiet && out.html === this.prBodyHtml) return;
        this.prTargets = out.targets;
        this.prTargetsByAddr = out.byAddr;
        this.prBodyHtml = out.html;
      },

      // The prose is x-html, so its links carry no Alpine bindings; one
      // delegated handler on the container does the interception instead. Only
      // a link renderPrBody recognized is claimed (it stamped the address);
      // everything else keeps the browser's own behavior.
      onGuideClick(e) {
        const a = e.target && e.target.closest && e.target.closest('a[data-render-addr]');
        if (!a) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;  // let a deliberate new tab through
        const t = this.prTargetsByAddr[a.getAttribute('data-render-addr')];
        if (!t) return;
        e.preventDefault();
        this.goTarget(t);
      },

      // Drawer continuity across a toss. Tossing is a real navigation, so the
      // fab on the far side boots closed and you lose your place: you were
      // comparing refs, and the list you were comparing them in is gone. Hand
      // the open state forward through sessionStorage (same tab, cleared with
      // it) and re-open on the next boot. The far side still has to load, so
      // the drawer reappears after the page does rather than with it.
      _DRAWER_KEY: '__fabDrawer',

      _handOffDrawer() {
        if (!this.open) return;
        try {
          sessionStorage.setItem(this._DRAWER_KEY, JSON.stringify({
            tab: this.activeTab, console: this.consoleOpen, t: Date.now(),
          }));
        } catch (e) {}
      },

      // Drop any pending handoff, so a stash from an earlier action cannot
      // reopen the drawer over a render that deliberately closed it.
      _clearDrawerHandoff() {
        try { sessionStorage.removeItem(this._DRAWER_KEY); } catch (e) {}
      },

      _restoreDrawer() {
        let raw = null;
        try {
          raw = sessionStorage.getItem(this._DRAWER_KEY);
          sessionStorage.removeItem(this._DRAWER_KEY);   // one-shot, not sticky
        } catch (e) {}
        if (!raw) return;
        let s; try { s = JSON.parse(raw); } catch (e) { return; }
        // Only honor a handoff from the navigation that just happened, so a
        // stale entry (a tab restored hours later) doesn't force the drawer open.
        if (!s || typeof s.t !== 'number' || Date.now() - s.t > 15000) return;
        this.open = true;
        if (s.tab) this.activeTab = s.tab;
        this.consoleOpen = !!s.console;
      },

      // The toss action. In a toss, re-address the shell at the picked ref in
      // place (toss-render re-fetches, re-stamps the subject, this fab re-adopts).
      // Outside one, go TO the toss: navigate to toss-render at the picked ref,
      // same tab, so the fab rides along and the escape handle brings you back.
      // No bespoke overlay renderer — toss-render is the one renderer now.
      renderAtRef(refArg) {
        const ref = refArg || this.frameRef || 'main';
        if (this.viaToss) {
          if (!this.repo || !this.path) return;
          // Through renderTarget rather than straight to __tossNavigate, which
          // speaks #gh= only: the subject may be a markdown file the shell is
          // showing through the data route, and switching ITS ref has to come
          // back through that same route or the shell would try to mount a
          // .md as a page. One routing table decides, here as everywhere.
          const t = this.renderTarget(this.repo, ref, this.path, true);
          if (t) this.goTarget(t);
          return;
        }
        if (this.tossUrl) { this._handOffDrawer(); location.href = this.tossUrl; }
      },

      // Everything the take menu operates on, resolved once: which page, whose
      // module registry, whose data, and a GH pointed at the right repo and ref.
      // Outside a toss that is simply this window. Inside one the page on screen
      // lives in the frame while the globals belong to the shell around it, so
      // every take action has to be aimed rather than left to read the globals.
      // Aiming it in one place is what lets the menu be shown in both.
      get takeTarget() {
        // A #gz= payload toss is not an adopted subject (opaque origin, nothing
        // to read), but the shell holds its HTML and that HTML is already the
        // finished artifact. Nothing to fetch, inline, or count.
        if (this.payloadHtml) {
          return { gh: window.gh, scripts: null, reads: null, path: this.path,
                   reachable: true, payload: this.payloadHtml };
        }
        if (!this.viaToss) {
          return { gh: window.gh, scripts: null, reads: null, path: this.path, reachable: true };
        }
        // A #gh= toss frame is same-origin, so its registries are readable. A
        // #gz= payload is not a toss by this fab's reckoning (no __tossSubject),
        // so it never lands here.
        // Aimed at the document in the frame, which under a route is the
        // renderer app rather than the addressed file: takePath and the repo
        // both follow `via` so the inlined modules resolve where they live.
        const repo = (this.subjectVia && this.subjectVia.repo) || this.repo;
        let gh = window.gh;
        if (window.GH && repo) {
          try { gh = new window.GH({ repo, ref: this.takeRef, loadBase: 'lib/' }); } catch (e) {}
        }
        // The subject's own byte ledger, so the brief can size itself before
        // fetching anything; the shell's would describe the wrong page.
        let files = null;
        try { files = window.__tossFrame?.contentWindow?.__ghFiles || null; } catch (e) {}
        return {
          gh,
          scripts: this.subjectScripts || [],
          reads: this.subjectReads || [],
          files,
          path: this.takePath,
          reachable: this.subjectReached,
        };
      },

      // The file a take operates on, and the ref it is read at: the frame's own
      // document. Only a routed subject makes these differ from the pair the
      // drawer is titled with, and when they differ EVERY take label has to use
      // them. A row reading "CLAUDE.md at claude/thing" over an action that
      // stages data-view.html at main is worse than either answer alone, since
      // it looks like it was thought about.
      get takePath() { return (this.subjectVia && this.subjectVia.path) || this.path; },
      get takeRef() { return (this.subjectVia ? this.subjectVia.ref : this.ref) || 'main'; },

      // What a take-away would contain, read off the runtime closure without
      // fetching anything: the menu can be honest about scope before you pick.
      // briefReady is the reactive gate: window.brief is not reactive, so the
      // menu would render its fallback copy forever without a tracked flag to
      // re-run these getters once the kit lands.
      get takePlan() {
        if (!this.briefReady || !window.brief) return null;
        const t = this.takeTarget;
        try { return window.brief.plan({ path: t.path, gh: t.gh, scripts: t.scripts, reads: t.reads, files: t.files }); }
        catch (e) { return null; }
      },

      // Pull the kit in when the menu is about to open, so it can say what a
      // brief would contain before you commit to one. ~10K, once per page.
      async ensureBrief() {
        if (this.briefReady || this.briefLoading) return;
        this.briefLoading = true;
        try {
          if (!window.brief) await this._selfLoad('kits/brief.js', () => !!window.brief);
          this.briefReady = !!window.brief;
        } catch (e) { /* menu falls back to generic copy */ }
        this.briefLoading = false;
      },

      // What every button below operates on, stated once so no label has to
      // repeat it. "Stage" had to be asked about because the labels named the
      // verb and the form but never the subject, and the subject is the same for
      // all six: this page and what it loaded.
      get takeSubject() {
        // Named for what a take would actually contain. Under a route that is
        // the RENDERER's document, not the file it is displaying: zipping a
        // markdown read gets you data-view.html and its modules, which is a
        // strange answer but the true one, and labelling it with the markdown
        // file would be the kind of small lie that costs an hour later.
        const base = (this.takePath || '').split('/').pop() || 'this page';
        const p = this.takePlan;
        if (!p) return base;
        const bits = [];
        if (p.own.length) bits.push(p.own.length + ' module' + (p.own.length === 1 ? '' : 's'));
        if (p.reads.length) bits.push(p.reads.length + ' data');
        return bits.length ? base + ' + ' + bits.join(' + ') : base;
      },

      // The full closure, for the header's tooltip: true but too long to read at
      // a glance, and the boot and vendor rings are loop detail.
      get takeDetail() {
        const p = this.takePlan;
        if (!p) return 'Page source, its modules, and the data it reads.';
        const bits = [(p.own.length || 0) + ' own module' + (p.own.length === 1 ? '' : 's')];
        if (p.floor.length) bits.push(p.floor.length + ' boot');
        if (p.reads.length) bits.push(p.reads.length + ' data');
        if (p.vendor.length) bits.push(p.vendor.length + ' vendor');
        return bits.join(' · ');
      },

      // The four outputs. Labels are bare nouns: the group heading above them
      // already says whether the action copies, navigates, or downloads, so
      // repeating the verb in every row is noise. The sentence each label used
      // to carry becomes the row's tooltip.
      get takeGroups() {
        const p = this.takePlan;
        const own = p ? p.own.length : 0;
        const mods = own + ' module' + (own === 1 ? '' : 's');
        const whole = p && p.wholeLib;
        const files = p ? 1 + p.own.length : 0;
        const base = (this.takePath || '').split('/').pop() || 'this page';
        const data = p && p.reads.length ? ' + ' + p.reads.length + ' data' : '';
        // Name the actual files while the list is short enough to read. A count
        // is what you fall back to, not what you lead with: "kits/url-params.js,
        // shorter-payload.js" answers the question that "2 modules" only labels.
        const names = p ? [base, ...p.own.map(m => m.path)] : [base];
        const list = names.length <= 4 ? names.join(', ')
                   : names.slice(0, 3).join(', ') + ' +' + (names.length - 3) + ' more';
        const t = this.takeTarget;
        const blind = this.viaToss && !t.reachable;
        const caveat = blind ? ' Subject frame unreadable: page source only, no modules.' : '';
        return [
          { kind: 'Copy', items: [
            { key: 'render', icon: 'ph-code', label: 'HTML',
              desc: t.payload
                ? 'The tossed payload as it is rendering here, already self-contained.'
                : (own || (p && p.reads.length)
                    ? list + data + ', all inlined into one file.' + caveat
                    : base + ' as it stands: nothing to inline.' + caveat) },
            { key: 'brief', icon: 'ph-clipboard-text', label: 'LLM',
              desc: whole ? 'Unavailable: ' + (p.tokens ? '~' + Math.round(p.tokens / 1000) + 'K tokens of own modules' : 'this page boots the whole library')
                            + ', over the cap. Pick a Region instead.'
                          : list + ' as readable source' + (p && p.tokens ? ' (~' + Math.round(p.tokens / 1000) + 'K tokens of modules)' : '')
                            + ', boot chain named but excluded.' + caveat },
            // Capture is the one output about the VIEW rather than the subject:
            // what actually loaded and ran, both sides of a toss, for handing a
            // session the page's real state instead of a screenshot.
            { key: 'capture', icon: 'ph-stethoscope', label: 'Capture',
              desc: 'This view’s state as JSON: scripts, components, console, and reads (sizes, not payloads).' },
          ] },
          { kind: 'Open', items: [
            { key: 'stage', icon: 'ph-stack', label: files ? 'Stage (' + files + ' file' + (files === 1 ? '' : 's') + ')' : 'Stage',
              desc: list + ' at ' + this.takeRef + ', on show-repo.' + caveat },
            // The one take scoped to a PART of the page. The brief and the
            // copy carry the whole file; a styling question is usually about
            // one region, and on the app the whole file is 2.7MB. Peek picks
            // it, its Render reading proves the wrapped fragment in a frame,
            // and Copy takes the same string.
            { key: 'region', icon: 'ph-selection-plus', label: 'Region',
              desc: 'Pick an element on the page and copy it as a page that renders alone: '
                  + 'the theme and vendor tags ride along, framework attributes do not, and a frame shows it first.'
                  + (this.annBlind ? ' Subject frame unreadable: the pick lands on this shell.' : '') },
            // Annotate and Peek, the two takes that operate ON the view
            // rather than carrying it away, moved to the launcher's long-press
            // menu: both are wanted BEFORE the drawer as often as inside it,
            // and the menu already carries Annotate's aims (Note the page /
            // an element / a section / a region) plus a Peek row. openAnnotate()
            // and openPeek() (kits/annotate.js, kits/peek.js) are still what
            // those rows call; only their grid entries here are gone.
          ] },
          { kind: 'Save', items: [
            { key: 'export', icon: 'ph-file-archive', label: 'Zip',
              desc: base + data + ' as files. Code still loads from the CDN.' },
            { key: 'offline', icon: 'ph-hard-drives', label: 'Zip + code',
              desc: list + data + ' as files, code inlined. Opens without this repo.' },
          ] },
        ];
      },

      // takeGroups plus the page's own actions, in one ordered set. Merging here
      // rather than in the template keeps the grid dumb and means a page action
      // that names a group is indistinguishable from a built-in one.
      get takeGrid() {
        const order = ['Copy', 'Open', 'Save', 'Page'];
        const bucket = new Map(this.takeGroups.map(g => [g.kind, g.items.map(i => ({ ...i, kind: 'take' }))]));
        this.pageActions.forEach((a, i) => {
          const k = a.group || 'Page';
          if (!bucket.has(k)) bucket.set(k, []);
          bucket.get(k).push({ key: 'page:' + i, icon: a.icon || 'ph-lightning', label: a.label,
                               desc: (a.desc || a.label) + ' ' + this.actionOrigin(a),
                               kind: 'page', side: a.side, from: a.from, run: a.run });
        });
        return order.filter(k => bucket.get(k)?.length)
          .concat([...bucket.keys()].filter(k => !order.includes(k) && bucket.get(k).length))
          .map(kind => ({ kind, items: bucket.get(kind) }));
      },

      runGridItem(a) { return a.kind === 'page' ? this.runAction(a) : this.runTake(a.key); },


      async runTake(key) {
        this.outError = ''; this.outMsg = ''; this.outBusy = true;
        try {
          if (key === 'render') await this.copyRenderCopy();
          else if (key === 'brief') await this.copyBrief();
          else if (key === 'capture') await this.copyCapture();
          else if (key === 'stage') await this.openStage();
          else if (key === 'region') await this.openPeek({ view: 'render' });
          else await this.exportPage(key === 'offline');
        } catch (e) {
          this.outError = (e && e.message) || String(e);
        } finally {
          this.outBusy = false;
        }
      },

      // Assemble the brief and put it on the clipboard. io.copy (inside the
      // kit) carries the iOS click-to-copy fallback, so this works on a phone.
      async copyBrief() {
        await this.ensureBrief();
        if (!window.brief) throw new Error('brief kit unavailable (kits/brief.js failed to load)');
        const t = this.takeTarget;
        const b = await window.brief.copy({ path: t.path, gh: t.gh, scripts: t.scripts, reads: t.reads });
        this.outMsg = 'Copied ' + b.tokens.toLocaleString() + ' tokens (' +
          (b.modules + 1) + ' files, ' + Math.round(b.bytes / 1024) + 'K)';
      },

      // Hand the computed closure to the stage. The FAB is the only thing that
      // knows which files a running page actually pulled in; the stage is the
      // tool that specializes in choosing among them. Open in a new tab so the
      // page you are reviewing stays put.
      async openStage() {
        await this.ensureBrief();
        if (!window.brief) throw new Error('brief kit unavailable (kits/brief.js failed to load)');
        const t = this.takeTarget;
        const u = window.brief.stageUrl({ path: t.path, gh: t.gh, scripts: t.scripts, reads: t.reads,
                                          prompts: BRIEF_PROMPTS });
        if (!u) throw new Error('No page path to stage');
        window.open(u, '_blank', 'noopener');
        this.outMsg = 'Opened on the stage';
      },

      // Turn the annotator on, aimed at what the drawer is looking at: the
      // subject frame's document when a #gh= toss is readable (same-origin, so
      // the kit running in this shell can paint highlights and mount its UI
      // there), this document otherwise. A #gz= sandbox is opaque and gets the
      // shell, which the take's caveat already says.
      // Peek aims where Annotate aims: at the subject frame's document inside a
      // readable toss, at this one otherwise. It carries its own panel, so
      // unlike the annotator there is nothing here to stage or hand it.
      async openPeek(o = {}) {
        if (!window.Peek) {
          try { await this._selfLoad('kits/peek.js', () => !!window.Peek); }
          catch (e) { this.outMsg = 'Peek unavailable (kits/peek.js failed to load)'; return; }
        }
        // The same aim openAnnotate() takes, and for the same reason: in a
        // readable toss the page a viewer is looking at lives in the subject
        // frame, and pointing at the shell would name the renderer's own DOM.
        let doc = document;
        if (this.viaToss && this.subjectReached && window.__tossFrame) {
          doc = window.__tossFrame.contentWindow.document;
        }
        if (window.Peek.enabled) window.Peek.disable();
        window.Peek.enable({ doc, view: o.view || 'facts' });
        this.open = false;
        this.outMsg = o.view === 'render'
          ? 'Region: tap an element, tap again for its parent; the Render reading proves the copy'
          : 'Peek on: tap anything, tap again for its parent';
      },

      async openAnnotate() {
        if (!window.Annotate) await this._loadAnnotate();
        const doc = this._annDoc();
        let subject = null;
        if (doc !== document) {
          subject = { title: this.takePath,
                      url: 'https://github.com/' + this.repo + '/blob/' + this.takeRef + '/' + this.takePath };
        }
        window.Annotate.enable({ doc, subject });
        this.open = false;
        this.outMsg = 'Annotator on: select text on the page';
      },

      // The launcher menu's one row, and the reason this component still knows
      // about the annotator at all. Turns it on if it is off and stages a page
      // draft: composer open, microphone OFF. That last part is the whole shape
      // of it. What arrives is an offer, not a recorder that started itself,
      // and it costs nothing to ignore: select a passage or tap a chip and the
      // page draft is replaced by the one you aimed at.
      //
      // Starting the annotator is all the FAB does for notes now. Reading a set
      // was the drawer's Notes tab until 2026-08-25, when the card grew an
      // expander of its own and the tab became a second implementation of one
      // view, on a page that might not have a drawer, kept in step by three
      // events.
      async annAim(aim) {
        const A = this._annKit();
        if (!(A && A.enabled)) await this.openAnnotate();
        const K = this._annKit();
        if (!K) return;
        if (aim === 'region') K.startRegion && K.startRegion();
        else if (aim === 'section') K.startPick && K.startPick({ aim: 'section' });
        else if (aim === 'pick') K.startPick && K.startPick();
        else K.notePage && K.notePage({ listen: false });
        this.open = false;
      },

      // THE DOCUMENT THE ANNOTATOR WOULD MARK, factored out of openAnnotate so
      // the menu asks about the same one it is about to arm an aim on. In a
      // toss that is the subject frame, and getting it wrong would offer a
      // markdown aim on the shell.
      //
      // IT PROBES RATHER THAN READING subjectReached, and the difference is a
      // bug openAnnotate carried. That flag is set inside detect(), which runs
      // when the DRAWER opens, so before a reader has ever opened the drawer it
      // is still its initial false: a long press over a readable toss annotated
      // the SHELL, which is the one document the reader is not looking at.
      // Measured 2026-08-31 driving toss-render over data-view, where the frame
      // held a declared markdown render and the fab reported no kind. The
      // honest question is whether the frame can be read right now, and the
      // probe is the answer to it; the cached flag is an answer to whether a
      // scan has happened. annBlind keeps reading the flag, since it describes
      // the drawer's own scan and runs after it.
      _annDoc() {
        if (this.viaToss && window.__tossFrame) {
          try {
            const d = window.__tossFrame.contentDocument;
            if (d && d.body) return d;
          } catch (e) { /* cross-origin: the shell is all there is */ }
        }
        return document;
      },

      // Same two-window search _annKit runs, for the same reason: in a toss the
      // page loads its own kits and this component is the shell's. The CARRIER
      // is what it asks for, not any one kind's kit: kits/src-doc.js answers
      // for every kind that declares, so this menu learns a new one without
      // learning its name.
      _srcDoc() {
        if (window.srcDoc) return window.srcDoc;
        try {
          const w = window.__tossFrame && window.__tossFrame.contentWindow;
          if (w && w.srcDoc) return w.srcDoc;
        } catch (e) {}
        return null;
      },

      // The kind declared on that document, read at menu-open time. An enabled
      // annotator answers for itself; otherwise the carrier is asked directly,
      // since the menu has to decide BEFORE anything is loaded on its account
      // and loading the annotator to find out would cost a long press a fetch.
      // No carrier anywhere means nothing has declared, the same answer.
      //
      // The carrier's own test is the one that matters here: a kind offering an
      // aim, on a render with units for it to hit. Source code declares and
      // offers no aim, so a code pane correctly grows no row.
      _declaredKind() {
        try {
          const A = this._annKit();
          if (A && A.enabled && A.declaredKind) return A.declaredKind();
          const sd = this._srcDoc();
          const d = sd && sd.declaredIn && sd.declaredIn(this._annDoc());
          return d ? d.kind || null : null;
        } catch (e) { return null; }
      },

      // ── Reaching the annotator ────────────────────────────────────────────
      // WHICH kit: in a toss the annotated page runs in the subject frame and
      // loads its own copy, while this component is the shell's. So the notes
      // being taken can live in a window it does not own, and reading
      // window.Annotate alone finds nothing (or, worse, a second empty
      // instance the take grid opened). An ENABLED kit wins wherever it lives;
      // the shell's is the fallback. Cross-origin frames and #gz= sandboxes
      // throw on access; the take grid's own caveat names that case.
      // The annotator's two entry points both go through here, because the kit
      // arrives as a TRIO: kits/annotate.js owns the notes, kits/dictate.js is
      // the voice buffer its composer reads at the point of use, and
      // kits/peek.js is what its DOM reading calls. Loading only the first
      // leaves a composer with no microphone and a card with no DOM chip,
      // silently, since the annotator treats either absence as a capability the
      // browser does not have.
      // Both before annotate, so its card never mounts in the window between
      // loads and decides there is nothing to dictate with or read structure
      // from. Both are best-effort: a failure costs one chip, not the notes.
      async _loadAnnotate() {
        if (!window.Dictate) {
          try { await this._selfLoad('kits/dictate.js', () => !!window.Dictate); } catch (e) {}
        }
        if (!window.Peek) {
          try { await this._selfLoad('kits/peek.js', () => !!window.Peek); } catch (e) {}
        }
        await this._selfLoad('kits/annotate.js', () => !!window.Annotate);
      },
      // A #gz= sandbox is opaque, so notes taken through the take grid would pin
      // to the renderer shell rather than the page inside it. Worth saying
      // before the fact, which the Annotate entry's caveat does.
      //
      // An IN-DOCUMENT subject is the opposite case and must not be caught by
      // this: a file deck slide is rendered in this very document, so notes
      // land on the thing being described and the annotator is not blind at
      // all. `subjectFramed` is the distinction the flag actually wanted;
      // `viaToss` only ever stood in for it because until 2026-08-14 every
      // subject arrived inside a frame. The take grid's own `blind` local is
      // still the viaToss reading, which is right for the module caveat beside
      // it and wrong for this one, so the two are kept apart.
      get annBlind() { return !!(this.subjectFramed && !this.subjectReached); },

      _annKit() {
        const mine = window.Annotate;
        let framed = null;
        try {
          const w = window.__tossFrame && window.__tossFrame.contentWindow;
          if (w && w.Annotate) framed = w.Annotate;
        } catch (e) {}
        // An ENABLED kit wins: it is the one marking a document right now.
        for (const k of [mine, framed]) if (k && k.enabled) return k;
        // Otherwise the one holding NOTES. Dismissing the card turns the
        // annotator off without discarding the set, and in a toss the set is
        // in the frame; preferring the shell's empty instance there would make
        // the tab report zero notes over a page that has several.
        for (const k of [framed, mine]) if (k && k.items && k.items.length) return k;
        return mine || framed || null;
      },
      // The kit keeps its last subject after disable(), so the off state has to
      // be checked first: naming a document nobody is annotating reads as a
      // claim that they are.

      // Export this page + the data it read()s as one zip, via the export kit
      // (self-loaded on first use, like the console panel). Default is local-DATA
      // (code still loads from the CDN); the "Fully offline" toggle also bakes the
      // gh.load chain in (build.js) so the zip opens with no network.
      async exportPage(offline) {
        await this._ensureExporter();
        const t = this.takeTarget;
        const r = await window.exporter.page({ path: t.path, gh: t.gh, scripts: t.scripts,
                                               reads: t.reads, offline: !!offline });
        this.outMsg = 'Saved ' + r.filename +
          (r.offline ? ' (+' + r.codeFiles + ' code' + (r.reads.length ? ', +' + r.reads.length + ' data)' : ')')
                     : (r.reads.length ? ' (+' + r.reads.length + ' data)' : ' (no data read yet)'));
      },

      async _ensureExporter() {
        if (!window.exporter) await this._selfLoad('kits/export.js', () => !!window.exporter);
        if (!window.exporter) throw new Error('export kit unavailable (kits/export.js failed to load)');
      },

      // The paste-and-render output: one HTML string on the clipboard, with the
      // page's own code and its read() data inlined and the third-party CDN tags
      // left as they are. io.copy carries the iOS click-to-copy fallback, so this
      // works from one tap on a phone.
      async copyRenderCopy() {
        await this._ensureExporter();
        if (!window.io?.copy) await this._selfLoad('kits/io.js', () => !!window.io?.copy);
        if (!window.io?.copy) throw new Error('io kit unavailable (kits/io.js failed to load)');
        const t = this.takeTarget;
        const r = t.payload
          ? { html: t.payload, codeFiles: 0, reads: [], dropped: [], chainless: true,
              bytes: t.payload.length, cdnRefs: window.exporter.cdnRefs(t.payload) }
          : await window.exporter.renderCopy({ path: t.path, gh: t.gh, scripts: t.scripts, reads: t.reads });
        await window.io.copy(r.html);
        const size = Math.max(1, Math.round(r.bytes / 1024)) + 'K';
        // Say which of the two shapes came back. A page with no chain is not a
        // failed bundle, so it gets its own wording rather than "0 code".
        const notes = [];
        if (r.dropped.length) notes.push(r.dropped.length + ' read not serializable');
        // Say it at copy time. This is the difference between a paste that works
        // and one that half-renders on a private repo, and it is invisible in the
        // string itself.
        if (r.cdnRefs) notes.push(r.cdnRefs + ' runtime CDN ref' + (r.cdnRefs === 1 ? '' : 's') + ' left');
        // "Nothing to inline" used to be the whole story for a page with no
        // gh.load chain, and on app/index.html it was a 428K file whose one
        // import is ../dist/app.js: it renders nowhere else. Say so.
        if (r.relRefs) notes.push(r.relRefs + ' relative script ref' + (r.relRefs === 1 ? '' : 's') + ': will not render outside this repo');
        this.outMsg = (r.chainless
          ? 'Copied ' + size + (t.payload ? ' (the tossed payload as-is)'
                                          : ' (self-contained page, nothing to inline)')
          : 'Copied ' + size + ' (+' + r.codeFiles + ' code' +
            (r.reads.length ? ', +' + r.reads.length + ' data)' : ')'))
          + (notes.length ? ', ' + notes.join(', ') : '');
      },

      scrollConsole() {
        this.$nextTick(() => {
          const p = document.getElementById('__fab-console-panel');
          if (p) p.scrollTop = p.scrollHeight;
        });
      }
    };
  });
};
if (window.Alpine && window.Alpine.data) registerFab();
else document.addEventListener('alpine:init', registerFab);
