// WebTools - Component library manager for Alpine.js components
class WebTools {
  constructor(options = {}) {
    const scriptSrc = document.currentScript?.src || '';
    const [, commit] = scriptSrc.match(/WebTools@([a-f0-9]+)\//) || [, 'main'];
    const [, repo] = scriptSrc.match(/github\.com\/([^\/]+\/[^\/]+)/) || [, 'mehrlander/WebTools'];
    
    Object.assign(this, {
      options: {
        baseUrl: `https://cdn.jsdelivr.net/gh/${repo}@${commit}/AlpineComponents`,
        config: false,
        cache: true,
        ...options
      },
      components: new Map(),
      loading: new Set(),
      instances: new Map()
    });
    
    if (this.options.config) this.initConfig();
    window.WebTools = window.WT = this;
  }
  
  // Load component(s)
  async loadComponent(...names) {
    if (names.length === 1) {
      const [name] = names;
      
      if (this.options.cache && this.components.has(name)) 
        return this.components.get(name);
      
      if (this.loading.has(name)) {
        while (this.loading.has(name)) await this.wait(100);
        if (!this.components.has(name)) throw new Error(`${name} failed to load`);
        return this.components.get(name);
      }
      
      this.loading.add(name);
      
      try {
        await this.loadScript(`${this.options.baseUrl}/${name}.js`);
        const component = await this.waitForGlobal(name);
        this.components.set(name, component);
        this.loading.delete(name);
        this.updateConfig();
        return component;
      } catch (e) {
        this.loading.delete(name);
        throw e;
      }
    }
    
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
    
    if (!this.instances.has(name)) this.instances.set(name, []);
    this.instances.get(name).push({ instance, selector });
    this.updateConfig();
    
    return instance;
  }
  
  // Utilities
  has = (name) => this.components.has(name);
  list = () => Array.from(this.components.keys());
  wait = (ms) => new Promise(r => setTimeout(r, ms));
  
  loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = Object.assign(document.createElement('script'), {
        src: url,
        onload: resolve,
        onerror: () => reject(new Error(`Failed to load ${url}`))
      });
      document.head.appendChild(script);
    });
  }
  
  async waitForGlobal(name, timeout = 5000) {
    const start = Date.now();
    while (!window[name]) {
      if (Date.now() - start > timeout) throw new Error(`Timeout waiting for ${name}`);
      await this.wait(50);
    }
    return window[name];
  }
  
  // Config panel
  initConfig() {
    const button = this.createElement('div', {
      style: 'position:fixed;top:16px;right:16px;z-index:9999',
      html: `<button class="btn btn-circle btn-sm btn-ghost border border-base-300 bg-base-100 shadow-sm hover:shadow-md transition-all" 
                    onclick="WT.toggleConfig()" title="WebTools Config">
              <i class="ph ph-gear-six text-lg"></i>
            </button>`
    });
    
    this.configPanel = this.createElement('div', {
      id: 'wt-config',
      style: `position:fixed;top:60px;right:16px;width:320px;max-height:80vh;
              background:var(--fallback-b1,oklch(var(--b1)/1));
              border:1px solid var(--fallback-bc,oklch(var(--bc)/0.2));
              border-radius:0.75rem;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);
              z-index:9998;display:none;overflow:hidden;flex-direction:column;`,
      html: this.configHTML()
    });
    
    document.body.append(button, this.configPanel);
    this.updateConfig();
  }
  
  configHTML() {
    return `
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
          <span>0 components</span>
          <span>0 instances</span>
        </div>
      </div>`;
  }
  
  updateConfig() {
    if (!this.configPanel) return;
    
    const content = document.getElementById('wt-config-content');
    const comps = this.list();
    const totalInstances = Array.from(this.instances.values()).reduce((sum, arr) => sum + arr.length, 0);
    
    // Update stats
    const stats = this.configPanel.querySelector('.flex.justify-between.text-xs');
    if (stats) stats.innerHTML = `<span>${comps.length} components</span><span>${totalInstances} instances</span>`;
    
    content.innerHTML = comps.length === 0 
      ? '<p class="text-sm text-base-content/60 text-center py-8">No components loaded yet</p>'
      : `<div class="space-y-2">${comps.map(name => this.componentCard(name)).join('')}</div>`;
  }
  
  componentCard(name) {
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
      </div>`;
  }
  
  toggleConfig() {
    const panel = this.configPanel;
    if (!panel) return;
    
    const isHidden = panel.style.display === 'none';
    const props = isHidden 
      ? { display: 'flex', opacity: '1', transform: 'scale(1) translateY(0)' }
      : { opacity: '0', transform: 'scale(0.95) translateY(-10px)' };
    
    if (isHidden) {
      Object.assign(panel.style, { display: 'flex', opacity: '0', transform: 'scale(0.95) translateY(-10px)' });
      requestAnimationFrame(() => {
        panel.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
        Object.assign(panel.style, props);
      });
    } else {
      Object.assign(panel.style, props);
      setTimeout(() => Object.assign(panel.style, { display: 'none', transition: '' }), 200);
    }
  }
  
  async loadFromConfig() {
    const input = document.getElementById('wt-load-input');
    const name = input.value.trim();
    if (!name) return;
    
    try {
      await this.loadComponent(name);
      input.value = '';
    } catch (e) {
      alert(`Failed to load ${name}: ${e.message}`);
    }
  }
  
  async copy(name) {
    try {
      const res = await fetch(`${this.options.baseUrl}/${name}.js`);
      await navigator.clipboard.writeText(await res.text());
      
      // Update icon
      document.querySelectorAll(`[onclick="WT.copy('${name}')"] i`).forEach(icon => {
        icon.className = 'ph ph-check text-success';
        setTimeout(() => icon.className = 'ph ph-clipboard-text', 2000);
      });
    } catch (e) {
      console.error(`Failed to copy ${name}:`, e);
    }
  }
  
  view = (name) => window.open(`${this.options.baseUrl}/${name}.js`, '_blank');
  
  getInstances = (name) => this.instances.get(name) || [];
  
  destroyAll(name) {
    this.getInstances(name).forEach(({ instance }) => instance.destroy?.());
    this.instances.delete(name);
    this.updateConfig();
  }
  
  // Helpers
  createElement(tag, props) {
    const el = document.createElement(tag);
    if (props.style) el.style.cssText = props.style;
    if (props.id) el.id = props.id;
    if (props.html) el.innerHTML = props.html;
    return el;
  }
  
  // Export/import
  export = () => ({ components: this.list(), baseUrl: this.options.baseUrl });
  async import(state) {
    if (state.baseUrl) this.options.baseUrl = state.baseUrl;
    if (state.components) await this.loadComponent(...state.components);
  }
}

// Auto-init
const script = document.currentScript;
const autoInit = script?.getAttribute('data-init') !== 'false';
const config = script?.getAttribute('data-config') === 'true';
const autoLoad = script?.getAttribute('data-load');

if (autoInit) {
  window.addEventListener('DOMContentLoaded', async () => {
    const wt = new WebTools({ config });
    
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
