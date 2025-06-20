
// Even simpler component example
class CopyBox {
  constructor(selector, options = {}) {
    this.el = document.querySelector(selector);
    if (!this.el) return;
    
    const { title = 'Code', content = '', lang = 'javascript' } = options;
    
    this.el.innerHTML = `
      <div class="mockup-code" x-data="{ copied: false }">
        ${title ? `<pre data-prefix=">" class="text-primary"><code>${title}</code></pre>` : ''}
        <pre x-ref="code"><code class="language-${lang}">${this.escape(content)}</code></pre>
        <button @click="navigator.clipboard.writeText($refs.code.textContent); copied = true; setTimeout(() => copied = false, 2000)"
                class="btn btn-sm btn-ghost absolute top-2 right-2">
          <i x-show="!copied" class="ph ph-clipboard"></i>
          <i x-show="copied" class="ph ph-check text-success"></i>
        </button>
      </div>
    `;
  }
  
  escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Usage with WebTools:
// await WT.use('FileDisplay', '#my-file', { fileName: 'test.js', content: '...' });
// await WT.use('CopyBox', '#my-code', { title: 'Example', content: '...' });

// Make components available globally when loaded as scripts
if (typeof window !== 'undefined') {
  window.FileDisplay = FileDisplay;
  window.CopyBox = CopyBox;
}
