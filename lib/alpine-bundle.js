(function() {
    const registerMagics = () => {
        Alpine.store('browser', {
            activeFile: null, repo: '', repoObj: null, gh: null, path: '', ref: '', defaultRef: '',
            // Parsed .web-tools.json manifest for the open repo@ref (landing,
            // pins, stage), or null when the repo has none. Set by the
            // show-repo shell's probe; data only, never executed.
            config: null,
            // Which filename config was loaded from ('.web-tools.json', or
            // null when unconfigured). One name since the 2026-08-15 sunset;
            // it stays a field rather than a boolean because the config
            // editors link the file they read.
            configName: null,
            // The staged fileset: [{ repo, ref, path }], ref '' meaning the
            // source repo's default branch. Cross-repo by design (items keep
            // their origin), so it survives repo switches. Fed by the explorer
            // ("+" on a row), a #stage= link, or a manifest's stage.files;
            // consumed by the stager component (view / send / save / mint).
            stage: [],
            // Where the staged set was loaded from, when it came from a saved
            // surface: { uid, file, manifest, context }, else null. It is what
            // makes a save write BACK to that file rather than mint a
            // near-duplicate beside it. Declared here, not sprung onto the
            // store at first use, because it is the one piece of stage state
            // two components both read: the stager saves through it and the
            // Stage view titles the bench from it. Cleared with the stage.
            stageOrigin: null,
            branches: [], branchesLoading: false, branchesLoaded: false,
            // The one ref mutator: every ref switcher (the Files-view picker,
            // repo.js's dropdown on other pages) routes through here so the gh
            // instance, persistence, and the toast stay in step.
            setRef(ref) {
                if (!ref || ref === this.ref) return
                this.ref = ref
                if (this.gh) this.gh.ref = ref
                const toast = Alpine.store('toast')
                if (toast) toast('git-branch', 'ref: ' + ref, 'alert-info', 2000)
                if (this.save) this.save({ repo: this.repo, ref, path: this.path || '', file: this.activeFile?.path || '' })
            },
            async ensureBranches() {
                if (this.branchesLoaded || this.branchesLoading || !this.gh) return
                this.branchesLoading = true
                try {
                    // gh.branches() is capped at 100 with no pagination; on repos with
                    // more branches the picker will silently truncate.
                    const list = await this.gh.branches()
                    this.branches = list.map(b => ({ name: b.name, sha: b.commit?.sha }))
                    this.branchesLoaded = true
                } catch (e) {
                    const toast = Alpine.store('toast')
                    if (toast) toast('warning', 'Could not load branches: ' + (e.message || e), 'alert-error', 4000)
                }
                this.branchesLoading = false
            },
            resetBranches() {
                this.branches = []
                this.branchesLoading = false
                this.branchesLoaded = false
            }
        })
        const toasts = Alpine.reactive([])
        Alpine.store('toasts', toasts)
        const toast = (icon, msg, cls = 'alert-info', ms = 3000) => {
            toasts.push({ icon, msg, cls, id: Date.now() })
            setTimeout(() => toasts.splice(0, 1), ms)
        }
        Alpine.store('toast', toast)
        Alpine.magic('toast', () => toast)

        // $attrs — reactive read of the host custom element's attributes,
        // for templates registered via <template x-define="...">. Walks up
        // to the nearest host whose connectedCallback stashed a reactive
        // attrs object; outside such a host, returns {}.
        Alpine.magic('attrs', (el) => {
            let host = el
            while (host && !host._defineAttrs) host = host.parentElement
            return host?._defineAttrs ?? {}
        })

        const ta = (el, fn, readOnly = true) => {
            const t = Object.assign(document.createElement('textarea'), { readOnly })
            t.className = 'absolute w-0 h-0 opacity-0'
            el.appendChild(t)
            fn(t)
        }

        Alpine.magic('clip', (el) => (text) => {
            if (window.copy) {
                window.copy(text)
                toast('clipboard', 'Copied', 'alert-success')
            } else {
                text = typeof text === 'object' ? JSON.stringify(text) : String(text)
                ta(el, t => { t.value = text; t.select(); document.execCommand('copy'); t.remove() })
                toast('clipboard', 'Copied ' + text.split('\n').length + ' lines', 'alert-success')
            }
        })

        // $paste tries the modern clipboard API first — on iOS Safari this
        // shows the system "Paste from X" pill. Falls back to the hidden
        // textarea + paste-event approach when readText is unavailable or
        // permission is denied (older browsers, data: URLs, etc.).
        Alpine.magic('paste', (el) => async (cb) => {
            if (navigator.clipboard?.readText) {
                try {
                    const text = await navigator.clipboard.readText()
                    cb(text)
                    return
                } catch { /* fall through to legacy textarea path */ }
            }
            ta(el, t => {
                t.addEventListener('paste', () => setTimeout(() => cb(t.value), 0))
                t.addEventListener('focusout', () => t.remove(), { once: true })
                t.focus()
            }, false)
        })

        // Outside click always closes any open <details class="dropdown">.
        // Inside-click closing is opt-in via `data-auto-close` on the <details>
        // — use it for picker/menu dropdowns; omit it for panel dropdowns that
        // contain inputs or other interactive content (those self-close on action).
        document.addEventListener('click', (e) => {
            document.querySelectorAll('details.dropdown[open]').forEach(d => {
                if (!d.contains(e.target)) { d.open = false; return }
                if (!d.hasAttribute('data-auto-close')) return
                const summary = d.querySelector(':scope > summary')
                if (!summary.contains(e.target)) d.open = false
            })
        })
    }

    // Small Alpine directives. Four tiers: class shortcuts (x-tip, x-lines,
    // x-btn, x-toolbar), reactive renderers (x-save-indicator, x-metric),
    // behavior wrappers (x-action), and registration (x-define — custom
    // element from a <template>). The class-shortcut tier mirrors the
    // html.* presets in vanilla-bundle.js; the others are new. Modifier convention for
    // decorating directives: known variant tokens get the directive-name
    // prefix (e.g. 'primary' → 'btn-primary'); unknown tokens pass through
    // as raw classes so callers can sprinkle in Tailwind utilities
    // (x-btn.xs.shadow-md).
    const registerDirectives = () => {

        const BTN_VARIANTS = new Set([
            'xs','sm','md','lg','xl',
            'primary','secondary','accent','info','success','warning','error',
            'ghost','outline','soft','wide','block','circle','square'
        ])

        // x-tip.<top|bottom|left|right>="'html body'"
        Alpine.directive('tip', (el, { expression, modifiers }, { evaluate }) => {
            const pos = ['top','bottom','left','right'].find(p => modifiers.includes(p)) || 'bottom'
            el.classList.add('tooltip', `tooltip-${pos}`)
            const body = document.createElement('div')
            body.className = 'tooltip-content bg-base-100 text-base-content border border-base-300 rounded-box shadow-lg p-3 text-xs text-left'
            body.innerHTML = expression ? evaluate(expression) : ''
            el.prepend(body)
        })

        // x-lines.<gap-N>  — flex column container; default gap-0.
        Alpine.directive('lines', (el, { modifiers }) => {
            el.classList.add('flex', 'flex-col')
            el.classList.add(modifiers.find(m => /^gap-\d$/.test(m)) || 'gap-0')
        })

        // x-btn.<size|variant|utility>="click expr"  — daisyUI button +
        // optional click handler. Known variant tokens get a 'btn-' prefix;
        // unknown tokens pass through as raw classes.
        Alpine.directive('btn', (el, { expression, modifiers }, { evaluateLater }) => {
            el.classList.add('btn')
            modifiers.forEach(m => el.classList.add(BTN_VARIANTS.has(m) ? `btn-${m}` : m))
            if (expression) {
                const exec = evaluateLater(expression)
                el.addEventListener('click', () => exec())
            }
        })

        // x-toolbar  — flex row with default toolbar layout.
        Alpine.directive('toolbar', (el) => {
            el.classList.add('flex', 'gap-2', 'items-center', 'justify-between', 'mb-2')
        })

        // x-save-indicator  — spinner; auto-shows when `saving` is truthy in scope.
        Alpine.directive('save-indicator', (el, _attrs, { effect, evaluateLater }) => {
            el.classList.add('loading', 'loading-spinner', 'loading-xs')
            const read = evaluateLater('saving')
            effect(() => read(v => { el.style.display = v ? '' : 'none' }))
        })

        // x-metric.<currency|percent>.trend[.invert]="{ label, val, prev }"
        // Renders a card with formatted value and optional trend indicator.
        // Re-renders reactively when the expression's deps change.
        Alpine.directive('metric', (el, { expression, modifiers }, { evaluateLater, effect }) => {
            el.classList.add('p-3','border','border-base-300','bg-base-200','flex','flex-col','min-w-[160px]','shadow-sm','rounded')
            const read = evaluateLater(expression)
            const fmtCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' })
            const fmtPercent  = new Intl.NumberFormat('en-US', { style: 'percent' })
            const fmtPct1     = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
            effect(() => read(data => {
                const { label, val, prev } = data || {}
                const disp = modifiers.includes('currency') ? fmtCurrency.format(val)
                          : modifiers.includes('percent')  ? fmtPercent.format(val)
                          : val
                let trend = ''
                if (modifiers.includes('trend') && prev !== undefined && prev !== 0) {
                    const diff = val - prev
                    const fav  = modifiers.includes('invert') ? diff <= 0 : diff >= 0
                    const pct  = fmtPct1.format(Math.abs(diff / prev))
                    trend = `<span class="text-xs ml-auto font-bold ${fav ? 'text-success' : 'text-error'}">${diff > 0 ? '▲' : '▼'} ${pct}</span>`
                }
                el.innerHTML = `
                    <div class="text-[10px] font-bold uppercase opacity-50 tracking-wider mb-1">${label ?? ''}</div>
                    <div class="flex items-baseline font-mono text-lg">${disp ?? ''}${trend}</div>`
            }))
        })

        // x-define="kebab-tag"  — on a <template>, registers a custom
        // element whose instances clone the template content and let Alpine
        // initialize them in place. Host attributes flow in reactively via
        // the $attrs magic. Data factories use the standard Alpine path
        // (Alpine.data('name', fn) referenced by x-data inside the template).
        // Warns if nested in an x-data subtree — custom-element registration
        // is global, so scope-implied positioning is misleading.
        //
        // Alpine only walks x-data subtrees, so top-level <template x-define>
        // outside any x-data ancestor never triggers the directive. The
        // post-init sweep below handles those; the directive itself covers
        // templates inserted into an x-data subtree after walk time.
        const defineFromTemplate = (el, expression) => {
            if (el.tagName !== 'TEMPLATE') {
                console.warn(`x-define on <${el.tagName.toLowerCase()}>: expected <template>`)
                return
            }
            const name = String(expression).toLowerCase()
            if (!name.includes('-')) {
                console.warn(`x-define="${name}": tag name needs a hyphen`)
                return
            }
            if (customElements.get(name)) return
            if (el.closest('[x-data]')) {
                console.warn(`x-define="${name}": <template x-define> nested inside x-data; the registration is global, so the apparent scope is misleading. Move to top level.`)
            }
            const html = el.innerHTML

            customElements.define(name, class extends HTMLElement {
                connectedCallback() {
                    if (this._defined) return
                    this._defined = true
                    const attrs = Alpine.reactive({})
                    for (const a of this.attributes) attrs[a.name] = a.value
                    this._defineAttrs = attrs
                    new MutationObserver(() => {
                        for (const a of this.attributes) attrs[a.name] = a.value
                    }).observe(this, { attributes: true })
                    this.innerHTML = html
                    Alpine.initTree(this)
                }
            })
        }

        Alpine.directive('define', (el, { expression }) => defineFromTemplate(el, expression))

        // Sweep the document for <template x-define> at init time. Alpine's
        // walk skips anything outside an x-data subtree, so without this
        // pass top-level definitions would silently no-op. The customElements
        // guard above makes overlap with the directive path harmless.
        document.querySelectorAll('template[x-define]').forEach(el => {
            defineFromTemplate(el, el.getAttribute('x-define'))
        })

        // x-action[.confirm]="expr"  — wired click. With .confirm, first tap
        // arms (red, "Are you sure?") and second tap within 3s executes;
        // otherwise reverts.
        Alpine.directive('action', (el, { expression, modifiers }, { evaluateLater }) => {
            const exec = evaluateLater(expression)
            if (!modifiers.includes('confirm')) {
                el.addEventListener('click', () => exec())
                return
            }
            let armed = false, timer, orig = el.innerHTML
            el.addEventListener('click', () => {
                if (armed) {
                    exec()
                    armed = false
                    el.innerHTML = orig
                    el.classList.remove('btn-error')
                    clearTimeout(timer)
                } else {
                    armed = true
                    el.innerHTML = 'Are you sure?'
                    el.classList.add('btn-error')
                    timer = setTimeout(() => {
                        armed = false
                        el.innerHTML = orig
                        el.classList.remove('btn-error')
                    }, 3000)
                }
            })
        })
    }

    const initBundle = () => {
        try { registerMagics() }
        catch (e) { console.warn('alpine-bundle: registerMagics failed:', e) }
        try { registerDirectives() }
        catch (e) { console.warn('alpine-bundle: registerDirectives failed:', e) }
    }

    // If Alpine already loaded (e.g. another script raced ahead and
    // alpine:init has already fired), register synchronously.
    // Otherwise wait for the event.
    if (window.Alpine?.directive) {
        initBundle()
    } else {
        document.addEventListener('alpine:init', initBundle)
    }

    const load = (src, cb) => {
        const s = document.createElement('script')
        s.src = src
        if (cb) s.onload = cb
        document.head.appendChild(s)
    }

    if (!window.Alpine) {
        load('https://unpkg.com/@alpinejs/collapse', () => {
            load('https://unpkg.com/alpinejs')
        })
    }
})()
