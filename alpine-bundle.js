(function() {
    const conf = window.AlpineBundle || {};
    const components = conf.components || [];
    const repo = conf.repo || 'mehrlander/web-tools';

    const loadComponents = components.map(function(name) {
        var url = 'https://cdn.jsdelivr.net/gh/' + repo + '/alpineComponents/' + name + '.js';
        return fetch(url).then(function(r) {
            if (!r.ok) throw new Error('Component ' + name + ' fetch failed: ' + r.status);
            return r.text();
        }).then(function(text) {
            new Function(text)();
            if (window.log) window.log('component loaded: ' + name);
        }).catch(function(e) {
            if (window.log) window.log('component ERROR: ' + e.message);
            console.error(e);
        });
    });

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
            toast('clipboard', 'Copied ' + text.split('\n').length + ' lines', 'alert-success')
        })

        Alpine.magic('paste', (el) => (cb) => {
            ta(el, t => {
                t.addEventListener('paste', () => setTimeout(() => cb(t.value), 0))
                t.addEventListener('focusout', () => t.remove(), { once: true })
                t.focus()
            })
        })
    }

    document.addEventListener('alpine:init', registerMagics)

    Promise.all(loadComponents).then(function() {
        var collapse = document.createElement('script');
        collapse.src = 'https://unpkg.com/@alpinejs/collapse';
        collapse.onload = function() {
            var alpine = document.createElement('script');
            alpine.src = 'https://unpkg.com/alpinejs';
            document.head.appendChild(alpine);
        };
        document.head.appendChild(collapse);
    });
})()
