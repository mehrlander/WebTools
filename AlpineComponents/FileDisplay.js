// FileDisplay component with improved Alpine.js integration
class FileDisplay {
  constructor(selector, options = {}) {
    this.el = document.querySelector(selector);
    if (!this.el) {
      console.warn(`FileDisplay: No element found for selector "${selector}"`);
      return;
    }
    
    // Store options for reference
    this.options = {
      fileName: 'No file selected',
      content: '',
      placeholder: 'Select a file to view',
      rows: 15,
      collapsed: false,
      onUrlsClick: null,
      ...options
    };
    
    // Create unique component ID for Alpine registration
    this.componentId = `fileDisplay_${Math.random().toString(36).substr(2, 9)}`;
    
    // Register Alpine component
    this.registerAlpineComponent();
    
    // Render the component
    this.render();
    
    // Bind events after render
    this.bindEvents();
    
    // Log successful initialization
    console.log(`FileDisplay: Initialized on ${selector}`, {
      componentId: this.componentId,
      options: this.options
    });
  }
  
  registerAlpineComponent() {
    const options = this.options;
    
    Alpine.data(this.componentId, () => ({
      // Reactive state
      collapsed: options.collapsed,
      content: options.content,
      fileName: options.fileName,
      placeholder: options.placeholder,
      rows: options.rows,
      
      // Methods available in Alpine
      toggle() {
        this.collapsed = !this.collapsed;
      },
      
      updateContent(newContent) {
        this.content = newContent;
      },
      
      updateFileName(newName) {
        this.fileName = newName;
      },
      
      handleUrlsClick() {
        this.$dispatch('urls-click', {
          fileName: this.fileName,
          content: this.content
        });
      }
    }));
  }
  
  render() {
    this.el.innerHTML = `
      <div x-data="${this.componentId}" class="space-y-2">
        <div class="flex items-center justify-between">
          <button @click="toggle()" 
                  class="flex items-center gap-1 font-semibold hover:text-primary transition-colors">
            <i :class="collapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'" 
               class="transition-transform duration-200"></i>
            <span x-text="fileName"></span>
          </button>
          <button @click="handleUrlsClick()" 
                  class="btn btn-sm btn-outline">
            <i class="ph ph-link"></i>
            <span>URLs</span>
          </button>
        </div>
        <div x-show="!collapsed" 
             x-collapse
             x-transition:enter="transition ease-out duration-200"
             x-transition:enter-start="opacity-0 transform scale-y-95"
             x-transition:enter-end="opacity-100 transform scale-y-100">
          <textarea x-model="content" 
                    :rows="rows" 
                    class="textarea textarea-bordered w-full font-mono text-sm" 
                    :placeholder="placeholder" 
                    readonly></textarea>
        </div>
      </div>
    `;
  }
  
  bindEvents() {
    // Handle custom urls-click event if callback provided
    if (this.options.onUrlsClick) {
      this.el.addEventListener('urls-click', (event) => {
        this.options.onUrlsClick(event.detail);
      });
    }
  }
  
  // Public API methods
  
  // Update content reactively
  update(content) {
    const data = this.getData();
    if (data) {
      data.updateContent(content);
    } else {
      console.warn('FileDisplay: Alpine component not initialized');
    }
  }
  
  // Update filename reactively
  setFileName(name) {
    const data = this.getData();
    if (data) {
      data.updateFileName(name);
    } else {
      console.warn('FileDisplay: Alpine component not initialized');
    }
  }
  
  // Get current state (useful for debugging)
  getData() {
    const alpineEl = this.el.querySelector('[x-data]');
    return alpineEl ? Alpine.$data(alpineEl) : null;
  }
  
  // Get current state as plain object
  getState() {
    const data = this.getData();
    if (!data) return null;
    
    return {
      collapsed: data.collapsed,
      content: data.content,
      fileName: data.fileName,
      placeholder: data.placeholder,
      rows: data.rows
    };
  }
  
  // Toggle collapsed state
  toggle() {
    const data = this.getData();
    if (data) {
      data.toggle();
    }
  }
  
  // Cleanup
  destroy() {
    // Remove event listeners
    if (this.options.onUrlsClick) {
      this.el.removeEventListener('urls-click', this.options.onUrlsClick);
    }
    
    // Clear the element
    this.el.innerHTML = '';
    
    // Note: Alpine.data registrations persist, but that's usually fine
    // as they're lightweight and may be reused
    
    console.log(`FileDisplay: Destroyed component ${this.componentId}`);
  }
  
  // Static method for WebTools compatibility
  static onLoad() {
    console.log('FileDisplay: Component loaded', {
      version: '2.0.0',
      type: 'Alpine-aware component',
      requires: ['Alpine.js 3.x', 'Phosphor Icons'],
      methods: ['update', 'setFileName', 'toggle', 'getData', 'getState', 'destroy']
    });
  }
}

// Call onLoad if component is loaded standalone
if (typeof FileDisplay.onLoad === 'function') {
  FileDisplay.onLoad();
}
