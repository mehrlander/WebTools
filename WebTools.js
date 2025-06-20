// WebTools - Component library manager for Alpine.js components
class WebTools {
  constructor(options = {}) {
    // Auto-detect commit hash from script src
    const scriptSrc = document.currentScript?.src || '';
    const commitMatch = scriptSrc.match(/WebTools@([a-f0-9]+)\//);
    const commit = commitMatch ? commitMatch[1] : 'main';
    const repoMatch = scriptSrc.match(/github\.com\/([^\/]+\/[^\/]+)/);
    const repo = repoMatch ? repoMatch[1] : 'mehrlander/WebTools';
    
    this.options = {
      baseUrl: `https://cdn.jsdelivr.net/gh/${repo}@${commit}/AlpineComponents`,
      config: false,
      cache: true,
      ...options
    };
    
    this.components = new Map();
    this.loading = new Set();
    this.instances = new Map();
    
    if (this.options.config) this.initConfig();
    
    // Make available globally
    window.WebTools = this;
    window.WT = this; // Shorthand alias
  }
  
  // Load one or more components by name
  async loadComponent(...names) {
    // Single component case - return the class directly
    if (names.length === 1) {
      const name = names[0];
      
      if (this.components.has(name) && this.options.cache) {
        return this.components.get(name);
      }
      
      if (this.loading.has(name)) {
        return await this.waitFor(name);
      }
      
      this.loading.add(name);
      
      try {
        const url = `${this.options.baseUrl}/${name}.js`;
        await this.loadScript(url);
        const component = await this.getGlobal(name);
        
        this.components.set(name, component);
        this.loading.delete(name);
        
        if (this.configPanel) this.updateConfig();
        
        return component;
      } catch (e) {
        this.loading.delete(name);
        throw e;
      }
    }
    
    // Multiple components case - return a map
    const results = {};
    for (const name of names) {
      try {
        results[name] = await this.loadComponent(name);
      } catch (e) {
        console.error(`Failed to load ${name}:`, e);
        results[name] = null;
      }
    }
    return results;
  }
  
  // Create component instance
  async create(name, selector, options = {}) {
    const Component = await this.loadComponent(name);
    const instance = new Component(selector, options);
    
    // Track instance
    if (!this.instances.has(name)) {
      this.instances.set(name, []);
    }
    this.instances.get(name).push({ instance, selector });
    
    // Update config panel
    if (this.configPanel) this.updateConfig();
    
    return instance;
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
  
  // Config panel
  initConfig() {
    const button = document.createElement('div');
    button.innerHTML = `
      <button class="btn btn-circle btn-sm btn-ghost border border-base-300 bg-base-100 shadow-sm hover:shadow-md transition-all" 
              onclick="WT.toggleConfig()" title="WebTools Config">
        <i class="ph ph-gear-six text-lg"></i>
      </button>
    `;
    button.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999';
    
    const panel = document.createElement('div');
    panel.id = 'wt-config';
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
        <button class="btn btn-sm btn-ghost btn-circle" onclick="WT.toggleConfig()">
          <i class="ph ph-x text-lg"></i>
        </button>
      </div>
      <div class="overflow-auto flex-1 p-3">
        <div id="wt-config-content"></div>
      </div>
      <div class="bg-base-200 px-4 py-3 border-t border-base-300 space-y-2">
        <div class="flex gap-2">
          <input type="text" id="wt-load-input" placeholder="Component name..." 
                 class="input input-bordered input-sm flex-1"
                 onkeypress="if(event.key==='Enter') WT.loadFromConfig()">
          <button class="btn btn-sm btn-primary" onclick="WT.loadFromConfig()">
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
    this.configPanel = panel;
    this.updateConfig();
  }
  
  updateConfig() {
    if (!this.configPanel) return;
    
    const content = document.getElementById('wt-config-content');
    const comps = Array.from(this.components.keys());
    const stats = this.configPanel.querySelector('.flex.justify-between.text-xs');
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
  
  toggleConfig() {
    const panel = document.getElementById('wt-config');
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
  
  async loadFromConfig() {
    const input = document.getElementById('wt-load-input');
    const name = input.value.trim();
    if (!name) return;
    
    try {
      await this.loadComponent(name);
      input.value = '';
      this.updateConfig();
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
  
  // Get all instances of a component
  getInstances(name) {
    return this.instances.get(name) || [];
  }
  
  // Get total instance count
  getInstanceCount() {
    let total = 0;
    this.instances.forEach(instances => {
      total += instances.length;
    });
    return total;
  }
  
  // Destroy all instances of a component
  destroyAll(name) {
    const instances = this.getInstances(name);
    instances.forEach(({ instance }) => {
      if (instance.destroy) instance.destroy();
    });
    this.instances.delete(name);
    
    // Update config panel
    if (this.configPanel) this.updateConfig();
  }
  
  // Export/import state
  export() {
    return {
      components: this.list(),
      baseUrl: this.options.baseUrl
    };
  }
  
  async import(state) {
    if (state.baseUrl) this.options.baseUrl = state.baseUrl;
    if (state.components) {
      await this.loadComponent(...state.components);
    }
  }
}

// Auto-init if specified
const script = document.currentScript;
const autoInit = script?.getAttribute('data-init') !== 'false';
const config = script?.getAttribute('data-config') === 'true';
const autoLoad = script?.getAttribute('data-load');

if (autoInit) {
  window.addEventListener('DOMContentLoaded', async () => {
    const wt = new WebTools({ config });
    
    // Auto-load components if specified
    if (autoLoad) {
      const components = autoLoad.split(',').map(s => s.trim()).filter(Boolean);
      if (components.length > 0) {
        try {
          await wt.loadComponent(...components);
          console.log(`WebTools: Auto-loaded ${components.join(', ')}`);
        } catch (e) {
          console.error('WebTools: Failed to auto-load components', e);
        }
      }
    }
  });
}
