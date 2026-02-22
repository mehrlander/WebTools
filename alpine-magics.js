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

        Alpine.magic('clip', (el) => (text) => {
            text = typeof text === 'object' ? JSON.stringify(text) : String(text)
            let ta = el.querySelector('textarea.clip-trap')
            if (!ta) {
                ta = Object.assign(document.createElement('textarea'), { readOnly: true })
                ta.className = 'clip-trap absolute w-0 h-0 opacity-0 pointer-events-none'
                el.classList.add('relative')
                el.appendChild(ta)
            }
            ta.value = text
            ta.select()
            document.execCommand('copy')
            toast('clipboard', `Copied ${text.split('\n').length} lines`, 'alert-success')
        })

        Alpine.magic('paste', (el) => (cb) => {
            let ta = el.querySelector('textarea.paste-trap')
            if (!ta) {
                ta = Object.assign(document.createElement('textarea'), {
                    className: 'paste-trap absolute w-0 h-0 opacity-0 pointer-events-none'
                })
                el.classList.add('relative')
                el.appendChild(ta)
                ta.addEventListener('paste', () => setTimeout(() => {
                    cb(ta.value)
                    ta.value = ''
                }, 0))
            }
            ta.focus()
            document.execCommand('paste')
        })
    }
    if (window.Alpine) registerMagics()
    else document.addEventListener('alpine:init', registerMagics)
})()
