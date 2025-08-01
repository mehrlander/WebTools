/**
 * SmartTextArea Web Component with Alpine.js Store Integration
 * 
 * A self-contained smart textarea component that creates its own Alpine store for state management.
 * Each instance has reactive state accessible via Alpine.store(storeId).
 * 
 * @usage
 * <script src="https://cdn.jsdelivr.net/gh/mehrlander/WebTools@main/AlpineComponents/SmartTextArea.js"></script>
 * <smart-textarea store-id="my-editor" placeholder="Enter text..." height="300"></smart-textarea>
 * 
 * // Access state:
 * Alpine.store('my-editor').content = 'Hello';
 * Alpine.store('my-editor').isViewMode = true;
 * Alpine.store('my-editor').wrapEnabled = false;
 * 
 * // Read computed properties:
 * Alpine.store('my-editor').stats // { chars, lines, words }
 * 
 * @requires Alpine.js 3.x, Phosphor Icons, DaisyUI
 */

// SmartTextArea Web Component Class
class SmartTextArea extends HTMLElement {
  constructor() {
    super();
    this._initialized = false;
  }
  
  connectedCallback() {
    if (!this._initialized) {
      this.initialize();
    }
  }
  
  async initialize() {
    if (this._initialized) return;
    
    try {
      // Get store ID from attribute or auto-generate
      this.storeId = this.getAttribute('store-id') || 
                     `textarea_${Math.random().toString(36).substr(2, 9)}`;
      
      // Set store-id attribute if it was auto-generated
      if (!this.getAttribute('store-id')) {
        this.setAttribute('store-id', this.storeId);
      }
      
      await this.waitForAlpine();
      this.registerAlpineComponent();
      this.initializeStore();
      this.render();
      this._initialized = true;
      
      // Dispatch ready event
      this.dispatchEvent(new CustomEvent('smart-textarea-ready', {
        detail: { storeId: this.storeId },
        bubbles: true
      }));
    } catch (error) {
      console.error(`Failed to initialize SmartTextArea ${this.storeId}:`, error);
    }
  }
  
  async waitForAlpine() {
    // Wait for Alpine to be available
    let attempts = 0;
    while (typeof Alpine === 'undefined' || !Alpine.store) {
      attempts++;
      if (attempts > 100) { // 5 second timeout
        throw new Error('Alpine.js failed to load within 5 seconds');
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  registerAlpineComponent() {
    // Register the controller component with Alpine if not already registered
    if (!Alpine.data('textAreaController')) {
      Alpine.data('textAreaController', (storeId) => ({
        storeId,
        
        get store() {
          return Alpine.store(storeId);
        },
        
        init() {
          // The store should already exist, created by the web component
          if (!this.store) {
            console.error(`textAreaController: Store '${storeId}' not found!`);
          }
          
          // Add keyboard shortcuts
          const keyHandler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
              e.preventDefault();
              this.store.wrapEnabled = !this.store.wrapEnabled;
            }
          };
          
          // Store handler reference for cleanup
          this._keyHandler = keyHandler;
          window.addEventListener('keydown', keyHandler);
          
          // Cleanup on destroy
          this.$cleanup = () => {
            window.removeEventListener('keydown', this._keyHandler);
          };
        },
        
        handleInput() {
          // No need to dispatch events - store updates automatically
        },
        
        handlePaste(event) {
          const pastedText = (event.clipboardData || window.clipboardData).getData('text');
          
          // Check if we should auto-switch to view mode
          if (pastedText.length > this.store.captureThreshold) {
            event.preventDefault();
            
            // Set the content and switch mode
            this.store.content = pastedText;
            
            // Delay mode switch slightly to prevent flash
            setTimeout(() => {
              this.store.isViewMode = true;
            }, 50);
          }
          // Otherwise, let the paste happen normally
        },
        
        async mobilePaste() {
          // First ensure we're in edit mode
          if (this.store.isViewMode) {
            this.store.isViewMode = false;
            await this.$nextTick();
          }
          
          // Focus the textarea
          this.$refs.textarea.focus();
          
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              // Insert at cursor position
              const start = this.$refs.textarea.selectionStart;
              const end = this.$refs.textarea.selectionEnd;
              this.store.content = this.store.content.substring(0, start) + text + this.store.content.substring(end);
              
              // Check if we should auto-switch to view mode
              if (text.length > this.store.captureThreshold) {
                setTimeout(() => {
                  this.store.isViewMode = true;
                }, 50);
              }
            }
          } catch (err) {
            try {
              document.execCommand('paste');
            } catch (e) {
              alert('Please tap and hold in the text area, then select "Paste" from the menu.');
            }
          }
        },
        
        async copyContent(event) {
          try {
            await navigator.clipboard.writeText(this.store.content);
            
            const button = event.target.closest('button');
            const originalHTML = button.innerHTML;
            button.innerHTML = '<i class="ph ph-check text-xs"></i> Copied';
            setTimeout(() => {
              button.innerHTML = originalHTML;
            }, 2000);
          } catch (err) {
            console.error('Failed to copy:', err);
          }
        },
        
        clearSelection() {
          // Prevent text selection on double-click
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
        }
      }));
    }
  }
  
  initializeStore() {
    // Read initial values from attributes
    const initialContent = this.getAttribute('value') || '';
    const captureThreshold = parseInt(this.getAttribute('capture-threshold')) || 5000;
    const defaultWrap = this.getAttribute('default-wrap') !== 'false';
    
    // Create the store with just reactive state
    Alpine.store(this.storeId, {
      // Reactive properties
      content: initialContent,
      isViewMode: false,
      wrapEnabled: defaultWrap,
      captureThreshold,
      
      // Computed properties (read-only getters)
      get lineCount() {
        return this.content ? this.content.split('\n').length : 0;
      },
      
      get wordCount() {
        return this.content ? this.content.trim().split(/\s+/).filter(Boolean).length : 0;
      },
      
      get stats() {
        return {
          chars: this.content.length,
          lines: this.lineCount,
          words: this.wordCount
        };
      }
    });
  }
  
  render() {
    // Get render-time configuration from attributes
    const placeholder = this.getAttribute('placeholder') || 'Enter or paste text here...';
    const height = this.getAttribute('height') || '350';
    const containerClass = this.getAttribute('container-class') || 'w-full';
    const textareaClass = this.getAttribute('textarea-class') || 'textarea textarea-bordered !w-full resize-none !text-base';
    
    this.innerHTML = `
      <div class="${containerClass}" x-data="textAreaController('${this.storeId}')">
        <!-- Persistent button bar -->
        <div class="flex justify-between items-center mb-1">
          <!-- Left side: mode toggles -->
          <div class="flex gap-0.5">
            <button @click="store.isViewMode = false" 
                    class="btn btn-xs btn-ghost px-2 h-7"
                    :class="store.isViewMode ? 'opacity-50' : 'bg-base-200'"
                    title="Edit mode">
              <i class="ph ph-pencil-simple text-xs"></i>
            </button>
            <button @click="store.isViewMode = true" 
                    class="btn btn-xs btn-ghost px-2 h-7"
                    :class="store.isViewMode ? 'bg-base-200' : 'opacity-50'"
                    title="View mode">
              <i class="ph ph-eye text-xs"></i>
            </button>
          </div>
          
          <!-- Center: wrap toggle -->
          <div>
            <button @click="store.wrapEnabled = !store.wrapEnabled" 
                    class="btn btn-xs btn-ghost px-2 h-7 opacity-60 hover:opacity-100"
                    :class="{ 'opacity-100': store.wrapEnabled }"
                    title="Toggle word wrap">
              <i class="ph ph-arrow-u-down-left text-xs"></i>
            </button>
          </div>
          
          <!-- Right side: actions -->
          <div class="flex gap-0.5">
            <button @click="copyContent($event)" 
                    class="btn btn-xs btn-ghost px-2 h-7 opacity-60 hover:opacity-100"
                    title="Copy all text">
              <i class="ph ph-copy text-xs"></i>
            </button>
            <button @click="mobilePaste" 
                    class="btn btn-xs btn-ghost px-2 h-7 opacity-60 hover:opacity-100"
                    title="Paste from clipboard">
              <i class="ph ph-clipboard-text text-xs"></i>
            </button>
            <button @click="store.content = ''; store.isViewMode = false" 
                    class="btn btn-xs btn-ghost px-2 h-7 opacity-60 hover:opacity-100 hover:text-error"
                    title="Clear all text">
              <i class="ph ph-trash text-xs"></i>
            </button>
            <button @click="$refs.infoModal.showModal()" 
                    class="btn btn-xs btn-ghost px-2 h-7 opacity-60 hover:opacity-100"
                    title="More info">
              <i class="ph ph-caret-down text-xs"></i>
            </button>
          </div>
        </div>
        
        <!-- Content area container -->
        <div class="relative" style="height: ${height}px">
          <!-- Edit mode: Textarea -->
          <textarea 
            x-ref="textarea"
            x-model="store.content"
            @input="handleInput"
            @paste="handlePaste"
            @dblclick="store.wrapEnabled = !store.wrapEnabled; clearSelection()"
            placeholder="${placeholder}"
            style="height: ${height}px; font-size: 16px !important; line-height: 1.5;"
            :style="store.wrapEnabled ? 'word-break: break-all;' : ''"
            :wrap="store.wrapEnabled ? 'soft' : 'off'"
            class="${textareaClass} transition-opacity duration-150 absolute inset-0 !text-base"
            :class="{ 
              'opacity-0 pointer-events-none': store.isViewMode, 
              'opacity-100': !store.isViewMode,
              'whitespace-nowrap': !store.wrapEnabled
            }"
          ></textarea>
          
          <!-- View mode: Display div -->
          <div style="height: ${height}px"
               @dblclick="store.wrapEnabled = !store.wrapEnabled; clearSelection()"
               class="border border-base-300 rounded-lg bg-base-100/50 overflow-y-auto transition-opacity duration-150 absolute inset-0"
               :class="{ 
                 'opacity-0 pointer-events-none': !store.isViewMode, 
                 'opacity-100': store.isViewMode,
                 'overflow-x-auto': !store.wrapEnabled
               }">
            <pre class="font-mono leading-relaxed text-base-content/80 p-2 m-0 !text-base" 
                 style="font-size: 16px !important; line-height: 1.5;"
                 :class="store.wrapEnabled ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'"
                 x-text="store.content || '[Empty]'"></pre>
          </div>
        </div>
        
        <!-- Info Modal -->
        <dialog x-ref="infoModal" class="modal">
          <div class="modal-box">
            <form method="dialog">
              <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
            </form>
            <h3 class="font-bold text-lg mb-4">Component Info</h3>
            
            <!-- Stats Section -->
            <div class="mb-4">
              <h4 class="text-sm font-semibold mb-2 text-base-content/70">Statistics</h4>
              <div class="space-y-2">
                <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                  <span class="text-sm">Characters</span>
                  <span class="font-mono" x-text="store.content.length"></span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                  <span class="text-sm">Words</span>
                  <span class="font-mono" x-text="store.wordCount"></span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                  <span class="text-sm">Lines</span>
                  <span class="font-mono" x-text="store.lineCount"></span>
                </div>
              </div>
            </div>
            
            <!-- Config Section -->
            <div>
              <h4 class="text-sm font-semibold mb-2 text-base-content/70">Configuration</h4>
              <div class="space-y-2">
                <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                  <span class="text-sm">Store ID</span>
                  <span class="font-mono text-xs" x-text="storeId"></span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                  <span class="text-sm">Auto-view threshold</span>
                  <span class="font-mono" x-text="store.captureThreshold + ' chars'"></span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                  <span class="text-sm">Current mode</span>
                  <span class="font-mono" x-text="store.isViewMode ? 'View' : 'Edit'"></span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                  <span class="text-sm">Word wrap</span>
                  <span class="font-mono" x-text="store.wrapEnabled ? 'On' : 'Off'"></span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-200 rounded">
                  <span class="text-sm">Height</span>
                  <span class="font-mono" x-text="'${height}px'"></span>
                </div>
              </div>
            </div>
          </div>
        </dialog>
      </div>
    `;
    
    // Tell Alpine to initialize the new DOM elements
    if (Alpine.initTree) {
      Alpine.initTree(this);
    }
  }
  
  disconnectedCallback() {
    // Clean up store if possible
    if (typeof Alpine !== 'undefined' && Alpine._stores && this.storeId) {
      delete Alpine._stores[this.storeId];
    }
    
    this._initialized = false;
  }
  
  // Public API method to get the store
  getStore() {
    return Alpine.store(this.storeId);
  }
  
  // Static method for WebTools compatibility
  static onLoad() {
    console.log('SmartTextArea: Component loaded', {
      version: '5.0.1',
      type: 'Alpine Store-based Web Component', 
      requires: ['Alpine.js 3.x', 'Phosphor Icons', 'DaisyUI'],
      api: 'Access via Alpine.store(storeId) - stores contain: content, isViewMode, wrapEnabled, captureThreshold, stats'
    });
  }
}

// Register the custom element
if (!customElements.get('smart-textarea')) {
  customElements.define('smart-textarea', SmartTextArea);
}

// Call onLoad
if (typeof SmartTextArea.onLoad === 'function') {
  SmartTextArea.onLoad();
}

// Expose to global scope for external access
window.SmartTextArea = SmartTextArea;
