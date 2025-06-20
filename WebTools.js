// WebTools - Component library manager for Alpine.js components
class WebTools {
  constructor(options = {}) {
    this.options = {
      baseUrl: 'https://cdn.jsdelivr.net/gh/mehrlander/WebTools@39c0ed983caacc9f688654eda38ee2ad26ccd3f0/AlpineComponents',
      version: 'main',
      debug: false,
      cache: true,
      ...options
    };
    
    this.components = new Map();
    this.loading = new Set();
    this.instances = new Map();
    
    if (this.options.debug) this.initDebug();
    
    // Make available globally with shorthand
    window.WebTools = this;
    window.WT = this; // Even shorter alias
  }
  
  // Load components by name
  async load(...names) {
    const results = {};
    for (const name of names) {
      try {
        results[name] = await this.loadOne(name);
      } catch (e) {
        console.error(`Failed to load ${name}:`, e);
        results[name] = { error: e.message };
      }
    }
    return results;
  }
  
  // Load single component
  async loadOne(name) {
    if (this.components.has(name) && this.options.cache) {
      return this.components.get(name);
    }
    
    if (this.loading.has(name)) {
      return this.waitFor(name);
    }
    
    this.loading.add(name);
    
    try {
      const url = `${this.options.baseUrl}/${name}.js`;
      await this.loadScript(url);
      const component = await this.getGlobal(name);
      
      this.components.set(name, component);
      this.loading.delete(name);
      
      if (this.debugPanel) this.updateDebug();
      
      return component;
    } catch (e) {
      this.loading.delete(name);
      throw e;
    }
  }
  
  // Create component instance - the main API
  async create(name, selector, options = {}) {
    const Component = await this.loadOne(name);
    const instance = new Component(selector, options);
    
    // Track instance
    if (!this.instances.has(name)) {
      this.instances.set(name, []);
    }
    this.instances.get(name).push({ instance, selector });
    
    // Update debug panel
    if (this.debugPanel) this.updateDebug();
    
    return instance;
  }
  
  // Shorthand for create
  async use(name, selector, options) {
    return this.create(name, selector, options);
  }
  
  // Get component class without creating instance
  async get(name) {
    return this.loadOne(name);
  }
  
  // Check if component is loaded
  has(name) {
    return this.components.has(name);
  }
  
  // Get all loaded component names
  list() {
    return Array.from(this.components.keys());
  }
  
  // Helper: load script
  loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${url}`));
      document.head.appendChild(script);
    });
  }
  
  // Helper: wait for global
  getGlobal(name, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (window[name]) {
          resolve(window[name]);
        } else if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for ${name}`));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }
  
  // Helper: wait for loading component
  async waitFor(name) {
    while (this.loading.has(name)) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (!this.components.has(name)) {
      throw new Error(`${name} failed to load`);
    }
    return this.components.get(name);
  }
  
  // Debug panel
  initDebug() {
    const button = document.createElement('div');
    button.innerHTML = `
      <button class="btn btn-circle btn-sm btn-ghost border border-base-300 bg-base-100 shadow-sm hover:shadow-md transition-all" 
              onclick="WT.toggleDebug()" title="WebTools Debug">
        <i class="ph ph-gear-six text-lg"></i>
      </button>
    `;
    button.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999';
    
    const panel = document.createElement('div');
    panel.id = 'wt-debug';
    panel.style.cssText = `
      position:fixed;top:60px;right:16px;width:320px;max-height:80vh;
      background:var(--fallback-b1,oklch(var(--b1)/1));
      border:1px solid var(--fallback-bc,oklch(var(--bc)/0.2));
      border-radius:0.75rem;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);
      z-index:9998;display:none;overflow:hidden;flex-direction:column;
    `;
    
    panel.innerHTML = `
      <div class="bg-base-200 px-4 py-3 border-b border-base-300 flex justify-between items-center">
        <div class="flex items-center gap-2">
          <i class="ph ph-package text-lg"></i>
          <h3 class="font-semibold">WebTools</h3>
        </div>
        <button class="btn btn-sm btn-ghost btn-circle" onclick="WT.toggleDebug()">
          <i class="ph ph-x text-lg"></i>
        </button>
      </div>
      <div class="overflow-auto flex-1 p-3">
        <div id="wt-debug-content"></div>
      </div>
      <div class="bg-base-200 px-4 py-3 border-t border-base-300 space-y-2">
        <div class="flex gap-2">
          <input type="text" id="wt-load-input" placeholder="Component name..." 
                 class="input input-bordered input-sm flex-1"
                 onkeypress="if(event.key==='Enter') WT.loadFromDebug()">
          <button class="btn btn-sm btn-primary" onclick="WT.loadFromDebug()">
            <i class="ph ph-download-simple"></i>
          </button>
        </div>
        <div class="flex justify-between text-xs text-base-content/60">
          <span>${this.list().length} components</span>
          <span>${this.getInstanceCount()} instances</span>
        </div>
      </div>
    `;
    
    document.body.appendChild(button);
    document.body.appendChild(panel);
    this.debugPanel = panel;
    this.updateDebug();
  }
  
  updateDebug() {
    if (!this.debugPanel) return;
    
    const content = document.getElementById('wt-debug-content');
    const comps = Array.from(this.components.keys());
    const stats = this.debugPanel.querySelector('.flex.justify-between.text-xs');
    if (stats) {
      stats.innerHTML = `
        <span>${comps.length} components</span>
        <span>${this.getInstanceCount()} instances</span>
      `;
    }
    
    if (comps.length === 0) {
      content.innerHTML = '<p class="text-sm text-base-content/60 text-center py-8">No components loaded yet</p>';
      return;
    }
    
    content.innerHTML = `
      <div class="space-y-2">
        ${comps.map(name => {
          const count = this.instances.get(name)?.length || 0;
          return `
            <div class="card bg-base-200 card-compact hover:shadow-md transition-shadow">
              <div class="card-body p-3">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-medium">${name}</div>
                    <div class="text-xs text-base-content/60">${count} instance${count !== 1 ? 's' : ''}</div>
                  </div>
                  <div class="flex gap-1">
                    <button class="btn btn-xs btn-ghost" onclick="WT.copy('${name}')" title="Copy source">
                      <i class="ph ph-clipboard-text"></i>
                    </button>
                    <button class="btn btn-xs btn-ghost" onclick="WT.view('${name}')" title="View on GitHub">
                      <i class="ph ph-arrow-square-out"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
  
  toggleDebug() {
    const panel = document.getElementById('wt-debug');
    if (panel) {
      if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        panel.style.opacity = '0';
        panel.style.transform = 'scale(0.95) translateY(-10px)';
        
        requestAnimationFrame(() => {
          panel.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
          panel.style.opacity = '1';
          panel.style.transform = 'scale(1) translateY(0)';
        });
      } else {
        panel.style.opacity = '0';
        panel.style.transform = 'scale(0.95) translateY(-10px)';
        
        setTimeout(() => {
          panel.style.display = 'none';
          panel.style.transition = '';
        }, 200);
      }
    }
  }
  
  async loadFromDebug() {
    const input = document.getElementById('wt-load-input');
    const name = input.value.trim();
    if (!name) return;
    
    try {
      await this.loadOne(name);
      input.value = '';
      this.updateDebug();
    } catch (e) {
      alert(`Failed to load ${name}: ${e.message}`);
    }
  }
  
  async copy(name) {
    try {
      const url = `${this.options.baseUrl}/${name}.js`;
      const res = await fetch(url);
      const code = await res.text();
      await navigator.clipboard.writeText(code);
      
      // Show success in button
      const btns = document.querySelectorAll(`[onclick="WT.copy('${name}')"]`);
      btns.forEach(btn => {
        const icon = btn.querySelector('i');
        if (icon) {
          icon.className = 'ph ph-check text-success';
          setTimeout(() => {
            icon.className = 'ph ph-clipboard-text';
          }, 2000);
        }
      });
    } catch (e) {
      console.error(`Failed to copy ${name}:`, e);
    }
  }
  
  view(name) {
    window.open(`${this.options.baseUrl}/${name}.js`, '_blank');
  }
  
  // Bulk operations
  async preload(...names) {
    return this.load(...names);
  }
  
  // Get all instances of a component
  getInstances(name) {
    return this.instances.get(name) || [];
  }
  
  // Destroy all instances of a component
  destroyAll(name) {
    const instances = this.getInstances(name);
    instances.forEach(({ instance }) => {
      if (instance.destroy) instance.destroy();
    });
    this.instances.delete(name);
    
    // Update debug panel
    if (this.debugPanel) this.updateDebug();
  }
  
  // Get total instance count
  getInstanceCount() {
    let total = 0;
    this.instances.forEach(instances => {
      total += instances.length;
    });
    return total;
  }
  
  // Export/import state
  export() {
    return {
      components: this.list(),
      baseUrl: this.options.baseUrl,
      version: this.options.version
    };
  }
  
  async import(state) {
    if (state.baseUrl) this.options.baseUrl = state.baseUrl;
    if (state.version) this.options.version = state.version;
    if (state.components) {
      await this.load(...state.components);
    }
  }
}

// Auto-init if specified
const script = document.currentScript;
const autoInit = script?.getAttribute('data-init') !== 'false';
const debug = script?.getAttribute('data-debug') === 'true';

if (autoInit) {
  window.addEventListener('DOMContentLoaded', () => {
    new WebTools({ debug });
  });
}
