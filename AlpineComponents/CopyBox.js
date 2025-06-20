/**
 * CopyBox - A self-mounting copy box component for any text values
 * Requires: Alpine.js, DaisyUI, Phosphor Icons, ClipboardJS, Lodash
 * 
 * Usage:
 *   new CopyBox('#my-values', { 
 *     title: 'API Keys',
 *     values: [
 *       { label: 'Production', value: 'pk_live_abc123...' },
 *       { label: 'Development', value: 'pk_test_xyz789...' }
 *     ]
 *   });
 */
class CopyBox {
  constructor(selector, options = {}) {
    // Convert selector to a safe ID by removing special chars
    this.id = selector.replace(/[^a-zA-Z0-9]/g, '_');
    this.selector = selector;
    
    // Merge default options
    this.options = {
      title: '',
      values: [],
      columns: 2, // Number of columns for grid layout
      cardClass: 'card w-full bg-base-100 shadow-xl p-6',
      buttonClass: 'btn btn-primary join-item',
      inputClass: 'input input-bordered join-item flex-grow',
      statusCardClass: 'card bg-base-200 shadow-sm p-4 mt-4',
      noCopyText: 'Nothing copied yet.',
      lastCopyLabel: 'Last Copied:',
      ...options
    };
    
    // Auto-mount on creation
    this.mount();
  }
  
  get html() {
    const { title, values, columns, cardClass, buttonClass, inputClass, statusCardClass, lastCopyLabel } = this.options;
    
    // Generate value boxes HTML
    const valueBoxes = values.map((item, index) => `
      <div class="form-control">
        <label class="label">
          <span class="label-text">${_.escape(item.label)}</span>
        </label>
        <div class="join">
          <input
            type="text"
            value="${_.escape(item.value)}"
            readonly
            class="${inputClass}"
            aria-label="${_.escape(item.label)}"
          />
          <button
            @click="copyValue('${_.escape(item.value)}')"
            class="${buttonClass}"
            title="Copy ${_.escape(item.label)}"
          >
            <i class="ph ph-copy"></i>
          </button>
        </div>
      </div>
    `).join('');
    
    return `
      <div x-data="copyBoxData_${this.id}" class="${cardClass}">
        <div class="card-body">
          ${title ? `<h2 class="card-title text-center mb-6">${_.escape(title)}</h2>` : ''}
          
          <div class="grid grid-cols-1 md:grid-cols-${columns} gap-6 ${title ? '' : ''}mb-8">
            ${valueBoxes}
          </div>
          
          <div class="${statusCardClass}" role="status" aria-live="polite">
            <p class="font-medium mb-1">${_.escape(lastCopyLabel)}</p>
            <p class="text-sm font-light break-all-words" x-text="copiedValue"></p>
          </div>
        </div>
      </div>
    `;
  }
  
  get data() {
    const { noCopyText } = this.options;
    const componentId = this.id;
    
    return {
      copiedValue: noCopyText,
      
      copyValue(value) {
        // Use ClipboardJS to copy
        ClipboardJS.copy(value);
        this.copiedValue = value;
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('value-copied', { 
          detail: { 
            value: value,
            componentId: componentId
          } 
        }));
      }
    };
  }
  
  mount() {
    const target = document.querySelector(this.selector);
    if (!target) {
      console.error(`CopyBox: Target element "${this.selector}" not found`);
      return false;
    }
    
    // Set the HTML
    target.innerHTML = this.html;
    
    // Make the data available globally for Alpine
    window[`copyBoxData_${this.id}`] = this.data;
    
    return true;
  }
  
  // Add a new value dynamically
  addValue(label, value) {
    this.options.values.push({ label, value });
    this.mount(); // Re-mount with new value
  }
  
  // Remove a value by label
  removeValue(label) {
    this.options.values = this.options.values.filter(item => item.label !== label);
    this.mount(); // Re-mount without the value
  }
  
  // Update all values
  setValues(values) {
    this.options.values = values;
    this.mount(); // Re-mount with new values
  }
  
  // Get the last copied value
  getLastCopied() {
    const data = window[`copyBoxData_${this.id}`];
    return data ? data.copiedValue : null;
  }
  
  // Destroy the component and clean up
  destroy() {
    const target = document.querySelector(this.selector);
    if (target) {
      target.innerHTML = '';
    }
    delete window[`copyBoxData_${this.id}`];
  }
  
  // Update component options
  update(newOptions) {
    this.options = { ...this.options, ...newOptions };
    this.mount(); // Re-mount with new options
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CopyBox;
}

// Also make available globally
if (typeof window !== 'undefined') {
  window.CopyBox = CopyBox;
}