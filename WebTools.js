// WebTools - Component library manager for Alpine.js components
class WebTools {
  constructor(options = {}) {
    this.options = {
      baseUrl: 'https://cdn.jsdelivr.net/gh/mehrlander/WebTools@main/AlpineComponents',
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
      <button class="btn btn-circle btn-sm btn-primary shadow-lg" onclick="WT.toggleDebug()">
        <i class="ph ph-code text-lg"></i>
      </button>
    `;
    button.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999';
    
    const panel = document.createElement('div');
    panel.id = 'wt-debug';
    panel.style.cssText = `
      position:fixed;bottom:70px;right:20px;width:350px;max-height:500px;
      background:var(--fallback-b1,oklch(var(--b1)/1));
      border:1px solid var(--fallback-bc,oklch(var(--bc)/0.2));
      border-radius:0.5rem;box-shadow:0 10px 25px rgba(0,0,0,0.1);
      z-index:9998;display:none;overflow:hidden;flex-direction:column;
    `;
    
    panel.innerHTML = `
      <div class="p-3 border-b border-base-300 flex justify-between items-center">
        <h3 class="font-bold">WebTools</h3>
        <button class="btn btn-sm btn-ghost btn-circle" onclick="WT.toggleDebug()">
          <i class="ph ph-x"></i>
        </button>
      </div>
      <div class="overflow-auto flex-1 p-3">
        <div id="wt-debug-content"></div>
      </div>
      <div class="p-3 border-t border-base-300">
        <input type="text" id="wt-load-input" placeholder="Component name..." 
               class="input input-bordered input-sm w-full"
               onkeypress="if(event.key==='Enter') WT.loadFromDebug()">
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
    
    if (comps.length === 0) {
      content.innerHTML = '<p class="text-sm opacity-60">No components loaded</p>';
      return;
    }
    
    content.innerHTML = comps.map(name => {
      const count = this.instances.get(name)?.length || 0;
      return `
        <div class="mb-2 p-2 bg-base-200 rounded text-sm">
          <div class="font-semibold">${name}</div>
          <div class="text-xs opacity-70">Instances: ${count}</div>
          <div class="mt-1 flex gap-1">
            <button class="btn btn-xs" onclick="WT.copy('${name}')">Copy</button>
            <button class="btn btn-xs" onclick="WT.view('${name}')">View</button>
          </div>
        </div>
      `;
    }).join('');
  }
  
  toggleDebug() {
    const panel = document.getElementById('wt-debug');
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
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
      alert(`Failed: ${e.message}`);
    }
  }
  
  async copy(name) {
    try {
      const url = `${this.options.baseUrl}/${name}.js`;
      const res = await fetch(url);
      const code = await res.text();
      await navigator.clipboard.writeText(code);
      alert(`${name} copied!`);
    } catch (e) {
      alert(`Failed: ${e.message}`);
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
