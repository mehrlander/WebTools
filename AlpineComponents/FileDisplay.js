// Example of refactored component following WebTools pattern
// Simpler, more focused, less boilerplate

class FileDisplay {
  constructor(selector, options = {}) {
    this.el = document.querySelector(selector);
    if (!this.el) return;
    
    this.options = {
      fileName: 'No file selected',
      content: '',
      placeholder: 'Select a file to view',
      rows: 15,
      collapsed: false,
      onUrlsClick: null,
      ...options
    };
    
    this.render();
  }
  
  render() {
    const { fileName, content, placeholder, rows, collapsed } = this.options;
    
    this.el.innerHTML = `
      <div x-data="{ collapsed: ${collapsed}, content: '${this.escape(content)}' }" class="space-y-2">
        <div class="flex items-center justify-between">
          <button @click="collapsed = !collapsed" class="flex items-center gap-1 font-semibold hover:text-primary">
            <i :class="collapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'"></i>
            <span>${this.escape(fileName)}</span>
          </button>
          <button @click="$dispatch('urls-click')" class="btn btn-sm btn-outline">
            <i class="ph ph-link"></i> URLs
          </button>
        </div>
        <div x-show="!collapsed" x-collapse>
          <textarea x-model="content" rows="${rows}" 
                   class="textarea textarea-bordered w-full font-mono text-sm" 
                   placeholder="${this.escape(placeholder)}" readonly></textarea>
        </div>
      </div>
    `;
    
    // Handle events
    if (this.options.onUrlsClick) {
      this.el.addEventListener('urls-click', this.options.onUrlsClick);
    }
  }
  
  // Update content
  update(content) {
    this.options.content = content;
    const textarea = this.el.querySelector('textarea');
    if (textarea) textarea.value = content;
  }
  
  // Update filename
  setFileName(name) {
    this.options.fileName = name;
    const button = this.el.querySelector('button span');
    if (button) button.textContent = name;
  }
  
  // Simple escape
  escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  // Cleanup
  destroy() {
    this.el.innerHTML = '';
  }
}
