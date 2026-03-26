/**
 * ThemePicker - A self-mounting DaisyUI theme selector component
 * Requires: Alpine.js, DaisyUI, Phosphor Icons
 * 
 * Usage:
 *   new ThemePicker('#my-selector', { gridCols: 3, initialTheme: 'dark' });
 */
class ThemePicker {
  // Extract every DaisyUI theme into a JS object
  static grabThemes(css) {
    return Object.fromEntries([...css.matchAll(/\[data-theme=([^\]]+)]\s*{([^}]+)}/g)]
      .map(([,n,b])=>[n,Object.fromEntries(
        [...b.matchAll(/--([^:]+):\s*([^;]+);/g)]
          .map(([,k,v])=>[k.trim(),v.trim()]))]));
  }
  
  constructor(selector, options = {}) {
    // Convert selector to a safe ID by removing special chars
    this.id = selector.replace(/[^a-zA-Z0-9]/g, '_');
    this.selector = selector;
    
    // Merge default options
    this.options = {
      gridCols: 2,
      initialTheme: 'emerald',
      buttonClass: 'btn btn-sm gap-2 rounded-full px-4 bg-base-200 hover:bg-base-300 border-0',
      dropdownClass: '',
      themesUrl: 'https://cdn.jsdelivr.net/npm/daisyui@5/themes.css',
      ...options
    };
    
    // Auto-mount on creation
    this.mount();
  }
  
  get html() {
    const { gridCols, buttonClass, dropdownClass } = this.options;
    
    return `
      <div class="dropdown ${dropdownClass}" x-data="themePickerData_${this.id}">
        <button tabindex="0" class="${buttonClass}">
          <i class="ph ph-palette text-lg"></i>
          <span class="capitalize" x-text="currentTheme"></span>
          <i class="ph ph-caret-down text-xs"></i>
        </button>
        <ul tabindex="0"
            class="dropdown-content bg-base-100 rounded-box mt-2 p-1 shadow-lg
                   border border-base-200 max-h-96 overflow-y-auto
                   grid gap-1 grid-cols-${gridCols}"
            style="width: ${gridCols * 12}rem">
          <template x-for="theme in Object.keys(themes)" :key="theme">
            <li :data-theme="theme">
              <a @click="setTheme(theme)"
                 class="block cursor-pointer bg-base-100 hover:bg-base-200 rounded-box px-3 py-2 border border-base-300/50 transition-colors">
                <div class="flex items-center gap-2">
                  <!-- color swatches -->
                  <div class="flex gap-1 flex-shrink-0">
                    <span class="w-3 h-3 rounded-full bg-primary"></span>
                    <span class="w-3 h-3 rounded-full bg-secondary"></span>
                    <span class="w-3 h-3 rounded-full bg-accent"></span>
                  </div>
                  <!-- theme name -->
                  <span class="flex-1 text-sm capitalize truncate text-base-content" x-text="theme"></span>
                  <!-- active check -->
                  <i class="ph ph-check text-primary flex-shrink-0"
                     :class="currentTheme===theme ? '' : 'opacity-0'"></i>
                </div>
              </a>
            </li>
          </template>
        </ul>
      </div>
    `;
  }
  
  get data() {
    const { initialTheme, themesUrl } = this.options;
    const pickerId = this.id;
    
    return {
      themes: {},
      currentTheme: initialTheme,
      pickerId,
      
      async init() {
        // Fetch and parse themes
        this.themes = ThemePicker.grabThemes(await (await fetch(themesUrl)).text());
        
        // Set initial theme
        this.setTheme(this.currentTheme);
        
        // Listen for theme changes from other pickers
        window.addEventListener('theme-changed', (e) => {
          if (e.detail.pickerId !== this.pickerId) {
            // Update our state without triggering another event
            this.currentTheme = e.detail.theme;
          }
        });
      },
      
      setTheme(theme) {
        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        
        // Dispatch custom event with picker ID
        window.dispatchEvent(new CustomEvent('theme-changed', { 
          detail: { 
            theme, 
            pickerId: this.pickerId 
          } 
        }));
      }
    };
  }
  
  mount() {
    const target = document.querySelector(this.selector);
    if (!target) {
      console.error(`ThemePicker: Target element "${this.selector}" not found`);
      return false;
    }
    
    // Set the HTML
    target.innerHTML = this.html;
    
    // Make the data available globally for Alpine
    window[`themePickerData_${this.id}`] = this.data;
    
    return true;
  }
  
  // Destroy the component and clean up
  destroy() {
    const target = document.querySelector(this.selector);
    if (target) {
      target.innerHTML = '';
    }
    delete window[`themePickerData_${this.id}`];
  }
  
  // Update component options
  update(newOptions) {
    this.options = { ...this.options, ...newOptions };
    this.mount(); // Re-mount with new options
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemePicker;
}

// Also make available globally
if (typeof window !== 'undefined') {
  window.ThemePicker = ThemePicker;
}
