/**
 * FileDisplay - A self-mounting file content display component
 * Requires: Alpine.js, DaisyUI, Phosphor Icons, Lodash
 * 
 * Usage:
 *   new FileDisplay('#my-file-display', { 
 *     fileName: 'example.js',
 *     content: '// file content here'
 *   });
 */
class FileDisplay {
  constructor(selector, options = {}) {
    // Convert selector to a safe ID by removing special chars
    this.id = selector.replace(/[^a-zA-Z0-9]/g, '_');
    this.selector = selector;
    
    // Merge default options
    this.options = {
      fileName: 'No file selected',
      content: '',
      versionInfo: '',
      placeholder: 'Select a file to view its contents',
      rows: 20,
      collapsible: true,
      collapsed: false,
      containerClass: '',
      textareaClass: 'textarea textarea-bordered font-mono text-sm resize-none flex-grow',
      headerClass: 'flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors mb-1',
      onUrlsClick: null, // Callback for URLs button
      hasValidSelection: false,
      ...options
    };
    
    // Auto-mount on creation
    this.mount();
  }
  
  get html() {
    const { collapsible, fileName, versionInfo, placeholder, rows, textareaClass, headerClass, hasValidSelection, containerClass } = this.options;
    
    return `
      <div x-data="fileDisplayData_${this.id}" class="${containerClass}">
        ${collapsible ? `
          <button @click="toggleCollapsed()" class="${headerClass}">
            <i :class="collapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'" class="transition-transform"></i>
            <span>Content</span>
          </button>
        ` : ''}
        
        <div x-show="${collapsible ? '!collapsed' : 'true'}">
          <div class="space-y-2">
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium font-mono truncate" x-text="fileName">${_.escape(fileName)}</div>
                <div class="text-xs text-base-content/60" x-html="versionInfo">${versionInfo}</div>
              </div>
              <button @click="handleUrlsClick()" 
                      :disabled="!hasValidSelection" 
                      class="btn btn-sm btn-outline">
                <i class="ph ph-link"></i>
                URLs
              </button>
            </div>
            <div class="flex w-full">
              <textarea x-model="content" 
                       rows="${rows}" 
                       class="${textareaClass}" 
                       placeholder="${_.escape(placeholder)}" 
                       readonly></textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  get data() {
    const { fileName, content, versionInfo, collapsed, onUrlsClick, hasValidSelection } = this.options;
    const componentId = this.id;
    
    return {
      fileName,
      content,
      versionInfo,
      collapsed,
      hasValidSelection,
      
      toggleCollapsed() {
        this.collapsed = !this.collapsed;
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('file-display-toggled', { 
          detail: { 
            collapsed: this.collapsed,
            componentId
          } 
        }));
      },
      
      handleUrlsClick() {
        if (typeof onUrlsClick === 'function') {
          onUrlsClick();
        }
        
        // Also dispatch event
        window.dispatchEvent(new CustomEvent('file-display-urls-clicked', { 
          detail: { componentId } 
        }));
      }
    };
  }
  
  mount() {
    const target = document.querySelector(this.selector);
    if (!target) {
      console.error(`FileDisplay: Target element "${this.selector}" not found`);
      return false;
    }
    
    // Set the HTML
    target.innerHTML = this.html;
    
    // Make the data available globally for Alpine
    window[`fileDisplayData_${this.id}`] = this.data;
    
    return true;
  }
  
  // Update file content
  setContent(content) {
    const data = window[`fileDisplayData_${this.id}`];
    if (data) {
      data.content = content;
    }
  }
  
  // Update file name
  setFileName(fileName) {
    const data = window[`fileDisplayData_${this.id}`];
    if (data) {
      data.fileName = fileName;
    }
  }
  
  // Update version info
  setVersionInfo(versionInfo) {
    const data = window[`fileDisplayData_${this.id}`];
    if (data) {
      data.versionInfo = versionInfo;
    }
  }
  
  // Update all file data at once
  updateFile(fileName, content, versionInfo) {
    const data = window[`fileDisplayData_${this.id}`];
    if (data) {
      data.fileName = fileName;
      data.content = content;
      data.versionInfo = versionInfo || '';
    }
  }
  
  // Update URLs button state
  setUrlsEnabled(enabled) {
    const data = window[`fileDisplayData_${this.id}`];
    if (data) {
      data.hasValidSelection = enabled;
    }
  }
  
  // Toggle collapsed state
  toggle() {
    const data = window[`fileDisplayData_${this.id}`];
    if (data && this.options.collapsible) {
      data.toggleCollapsed();
    }
  }
  
  // Get current state
  getState() {
    const data = window[`fileDisplayData_${this.id}`];
    return data ? {
      fileName: data.fileName,
      content: data.content,
      versionInfo: data.versionInfo,
      collapsed: data.collapsed
    } : null;
  }
  
  // Destroy the component and clean up
  destroy() {
    const target = document.querySelector(this.selector);
    if (target) {
      target.innerHTML = '';
    }
    delete window[`fileDisplayData_${this.id}`];
  }
  
  // Update component options
  update(newOptions) {
    this.options = { ...this.options, ...newOptions };
    this.mount(); // Re-mount with new options
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileDisplay;
}

// Also make available globally
if (typeof window !== 'undefined') {
  window.FileDisplay = FileDisplay;
}
