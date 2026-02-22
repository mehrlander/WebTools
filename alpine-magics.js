(function() {
    const registerMagics = () => {
        const toasts = Alpine.reactive([])
        Alpine.store('toasts', toasts)
        const toast = (icon, msg, cls = 'alert-info', ms = 3000) => {
            toasts.push({ icon, msg, cls, id: Date.now() })
            setTimeout(() => toasts.splice(0, 1), ms)
        }
        Alpine.store('toast', toast)
        Alpine.magic('toast', () => toast)

        const ta = (el, fn) => {
            const t = Object.assign(document.createElement('textarea'), { readOnly: true })
            t.className = 'absolute w-0 h-0 opacity-0'
            el.appendChild(t)
            fn(t)
        }

        Alpine.magic('clip', (el) => (text) => {
            text = typeof text === 'object' ? JSON.stringify(text) : String(text)
            ta(el, t => { t.value = text; t.select(); document.execCommand('copy'); t.remove() })
            toast('clipboard', `Copied ${text.split('\n').length} lines`, 'alert-success')
        })

        Alpine.magic('paste', (el) => (cb) => {
            ta(el, t => {
                t.addEventListener('paste', () => setTimeout(() => cb(t.value), 0))
                t.addEventListener('focusout', () => t.remove(), { once: true })
                t.focus()
            })
        })
    }
    if (window.Alpine) registerMagics()
    else document.addEventListener('alpine:init', registerMagics)
})()
