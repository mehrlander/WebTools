function registerMagics(Alpine) {
    Alpine.magic('clip', (el) => (text) => {
        text = typeof text === 'object' ? JSON.stringify(text) : String(text);
        let ta = el.querySelector('textarea.clip-trap');
        if (!ta) {
            ta = Object.assign(document.createElement('textarea'), { readOnly: true });
            ta.className = 'clip-trap absolute w-0 h-0 opacity-0 pointer-events-none';
            el.appendChild(ta);
        }
        ta.value = text;
        ta.select();
        document.execCommand('copy');
        if (Alpine.store('toast')) {
            Alpine.store('toast').show(`Copied ${text.split('\n').length} lines`);
        }
    });

    Alpine.magic('paste', (el) => (cb) => {
        let ta = el.querySelector('textarea.paste-trap');
        if (!ta) {
            ta = Object.assign(document.createElement('textarea'), { 
                className: 'paste-trap absolute w-0 h-0 opacity-0 pointer-events-none fixed top-0 left-0' 
            });
            el.appendChild(ta);
            ta.addEventListener('paste', (e) => {
                const val = e.clipboardData.getData('text') || ta.value;
                cb(val);
            });
        }
        ta.focus();
        document.execCommand('paste');
    });
}
