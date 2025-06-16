// ThemePicker.js - Alpine.js Theme Picker Component for DaisyUI
// Place this file at: https://github.com/mehrlander/WebTools/blob/main/AlpineComponents/ThemePicker.js

(function(window) {
  'use strict';
  
  // Extract every DaisyUI theme into a JS object
  const grabThemes = css =>
    Object.fromEntries([...css.matchAll(/\[data-theme=([^\]]+)]\s*{([^}]+)}/g)]
      .map(([,n,b])=>[n,Object.fromEntries(
        [...b.matchAll(/--([^:]+):\s*([^;]+);/g)]
          .map(([,k,v])=>[k.trim(),v.trim()]))]));

  // Theme picker component factory
  function themePicker(options = {}) {
    const { 
      gridCols = 2, 
      initialTheme = 'emerald',
      buttonClass = 'btn btn-sm gap-2 rounded-full px-4 bg-base-200 hover:bg-base-300 border-0',
      showColorSwatches = true,
      themesUrl = 'https://cdn.jsdelivr.net/npm/daisyui@5/themes.css'
    } = options;

    // Component HTML structure
    const html = `
      <div class="dropdown">
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
                  ${showColorSwatches ? `
                  <!-- color swatches -->
                  <div class="flex gap-1 flex-shrink-0">
                    <span class="w-3 h-3 rounded-full bg-primary"></span>
                    <span class="w-3 h-3 rounded-full bg-secondary"></span>
                    <span class="w-3 h-3 rounded-full bg-accent"></span>
                  </div>
                  ` : ''}
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

    // Component data and methods
    const data = function() {
      return {
        themes: {},
        currentTheme: initialTheme,
        loading: true,
        error: null,
        
        async init() {
          try {
            // Fetch and parse themes
            const response = await fetch(themesUrl);
            if (!response.ok) throw new Error('Failed to load themes');
            
            const css = await response.text();
            this.themes = grabThemes(css);
            this.loading = false;
            
            // Set initial theme
            this.setTheme(this.currentTheme);
          } catch (err) {
            console.error('Error loading themes:', err);
            this.error = err.message;
            this.loading = false;
          }
        },
        
        setTheme(theme) {
          this.currentTheme = theme;
          document.documentElement.setAttribute('data-theme', theme);
          
          // Store preference
          if (window.localStorage) {
            localStorage.setItem('selected-theme', theme);
          }
          
          // Dispatch custom event
          window.dispatchEvent(new CustomEvent('theme-changed', { 
            detail: { theme, themes: this.themes } 
          }));
        },
        
        // Load saved theme preference
        loadSavedTheme() {
          if (window.localStorage) {
            const saved = localStorage.getItem('selected-theme');
            if (saved && this.themes[saved]) {
              this.setTheme(saved);
            }
          }
        }
      };
    };

    return { html, data };
  }

  // Mount component function
  function mountComponent(selector, component) {
    const target = document.querySelector(selector);
    if (!target) {
      console.error(`Target element "${selector}" not found`);
      return null;
    }

    // Generate unique data function name
    const dataFnName = `themePickerData_${Date.now()}`;

    // Set the HTML
    target.innerHTML = component.html;

    // Set Alpine attributes
    target.setAttribute('x-data', `${dataFnName}()`);
    target.setAttribute('x-init', 'init().then(() => loadSavedTheme())');

    // Make the data function available globally for Alpine
    window[dataFnName] = component.data;

    return dataFnName;
  }

  // Export to window
function mountComponent(selector, component) {
  const target = document.querySelector(selector);
  if (!target) {
    console.error(`Target element "${selector}" not found`);
    return null;
  }

  // Generate a unique function name
  const dataFnName = `themePickerData_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Set the HTML inside the target
  target.innerHTML = component.html;

  // Reference the top-level element of the inserted component
  const root = target.firstElementChild;
  if (!root) {
    console.error(`No root element found in "${selector}"`);
    return null;
  }

  // Attach Alpine.js attributes to that root element
  root.setAttribute('x-data', `${dataFnName}()`);
  root.setAttribute('x-init', 'init().then(() => loadSavedTheme())');

  // Assign the data object globally
  window[dataFnName] = () => component.data;

  return dataFnName;
}

})(window);
