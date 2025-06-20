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
        
        // Validate component
        if (!this.validateComponent(name, component)) {
          throw new Error(`${name} is not a valid component`);
        }
        
        this.components.set(name, component);
        this.loading.delete(name);
        
        console.log(`[WebTools] Loaded ${name}:`, {
          type: typeof component,
          isClass: component.prototype && component.prototype.constructor === component,
          methods: component.prototype ? Object.getOwnPropertyNames(component.prototype) : [],
          validation: this.getComponentInfo(component),
          storedSuccessfully: this.components.has(name)
        });
        
        this.updateConfig();
        return component;
      } catch (e) {
        this.loading.delete(name);
        console.error(`[WebTools] Failed to load ${name}:`, e);
        throw e;
      }
    }
    
    const results = {};
    for (const name of names) {
      try {
        results[name] = await this.loadComponent(name);
      } catch (e) {
        // Error already logged in loadComponent
        results[name] = null;
      }
    }
    return results;
  }
  
  // Create component instance
  async create(name, selector, options = {}) {
    console.log(`[WebTools] Creating ${name} instance for ${selector}`, options);
    
    const Component = await this.loadComponent(name);
    
    if (!Component) {
      throw new Error(`Component ${name} not found`);
    }
    
    // Verify selector exists
    const element = document.querySelector(selector);
    if (!element) {
      console.warn(`[WebTools] Warning: Selector "${selector}" not found in DOM`);
    }
    
    console.log(`[WebTools] Instantiating ${name}...`);
    console.log(`[WebTools] Component type:`, typeof Component);
    console.log(`[WebTools] Component constructor:`, Component);
    
    let instance;
    try {
      instance = new Component(selector, options);
      console.log(`[WebTools] ${name} instance created successfully`);
      console.log(`[WebTools] Instance:`, instance);
    } catch (e) {
      console.error(`[WebTools] Failed to instantiate ${name}:`, e);
      console.error(`[WebTools] Stack trace:`, e.stack);
      throw e;
    }
    
    // Track instance
    if (!this.instances.has(name)) {
      this.instances.set(name, []);
    }
    this.instances.get(name).push({ instance, selector });
    this.updateConfig();
    
    return instance;
  }
  
  // Validate component
  validateComponent(name, component) {
    if (!component) return false;
    
    // Check if it's a constructor function or class
    if (typeof component === 'function') {
      // Check for class indicators
      const isClass = component.prototype && 
                     component.prototype.constructor === component;
      
      console.log(`[WebTools] ${name} validation:`, {
        isFunction: true,
        isClass,
        hasPrototype: !!component.prototype,
        prototypeKeys: component.prototype ? Object.keys(component.prototype) : []
      });
      
      return true;
    }
    
    return false;
  }
  
  // Get component info
  getComponentInfo(component) {
    if (!component) return { valid: false };
    
    const info = {
      type: typeof component,
      isClass: false,
      isFunction: typeof component === 'function',
      methods: [],
      properties: []
    };
    
    if (typeof component === 'function') {
      info.isClass = component.prototype && 
                    component.prototype.constructor === component;
      
      if (component.prototype) {
        info.methods = Object.getOwnPropertyNames(component.prototype)
          .filter(name => name !== 'constructor' && 
                         typeof component.prototype[name] === 'function');
        
        info.properties = Object.getOwnPropertyNames(component.prototype)
          .filter(name => name !== 'constructor' && 
                         typeof component.prototype[name] !== 'function');
      }
    }
    
    return info;
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
    console.log(`[WebTools] Waiting for global ${name}...`);
    const start = Date.now();
    while (!window[name]) {
      if (Date.now() - start > timeout) throw new Error(`Timeout waiting for ${name}`);
      await this.wait(50);
    }
    console.log(`[WebTools] Found global ${name}`);
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
    const component = this.components.get(name);
    const info = this.getComponentInfo(component);
    
    return `
      <div class="card bg-base-200 card-compact hover:shadow-md transition-shadow">
        <div class="card-body p-3">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="font-medium">${name}</div>
              <div class="text-xs text-base-content/60">
                ${count} instance${count !== 1 ? 's' : ''} • 
                ${info.isClass ? 'Class' : 'Function'} • 
                ${info.methods.length} methods
              </div>
              ${count === 0 ? `<div class="text-xs text-warning mt-1">⚠️ No instances created</div>` : ''}
            </div>
            <div class="flex gap-1">
              <button class="btn btn-xs btn-ghost" onclick="WT.showInfo('${name}')" title="Component info">
                <i class="ph ph-info"></i>
              </button>
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
  
  // Show component info
  showInfo(name) {
    const component = this.components.get(name);
    const info = this.getComponentInfo(component);
    const instances = this.getInstances(name);
    
    console.group(`[WebTools] ${name} Component Info`);
    console.log('Type:', info.type);
    console.log('Is Class:', info.isClass);
    console.log('Methods:', info.methods);
    console.log('Properties:', info.properties);
    console.log('Instances:', instances.length);
    
    if (instances.length > 0) {
      console.log('Instance details:');
      instances.forEach(({ instance, selector }, i) => {
        console.log(`  ${i + 1}. Selector: ${selector}`, instance);
      });
    }
    console.groupEnd();
    
    // Also show in alert for now
    alert(`${name} Component:
Type: ${info.isClass ? 'Class' : 'Function'}
Methods: ${info.methods.join(', ') || 'none'}
Instances: ${instances.length}
${instances.length > 0 ? '\nSelectors:\n' + instances.map(i => `- ${i.selector}`).join('\n') : ''}`);
  }
  
  view = (name) => window.open(`${this.options.baseUrl}/${name}.js`, '_blank');
  
  getInstances = (name) => this.instances.get(name) || [];
  
  // Get all instances across all components
  getAllInstances() {
    const all = [];
    this.instances.forEach((instances, componentName) => {
      instances.forEach(({ instance, selector }) => {
        all.push({ componentName, instance, selector });
      });
    });
    return all;
  }
  
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
  
  // Get debug info for a component
  debug(name) {
    console.group(`[WebTools] Debug info for ${name}`);
    
    const component = this.components.get(name);
    if (!component) {
      console.error(`Component ${name} not loaded`);
      console.groupEnd();
      return;
    }
    
    const info = this.getComponentInfo(component);
    const instances = this.getInstances(name);
    
    console.log('Component:', component);
    console.log('Type:', info.type);
    console.log('Is Class:', info.isClass);
    console.log('Methods:', info.methods);
    console.log('Properties:', info.properties);
    console.log('Instances:', instances.length);
    
    if (instances.length > 0) {
      console.log('Instance details:');
      instances.forEach(({ instance, selector }, i) => {
        console.log(`  ${i + 1}. Selector: ${selector}`);
        console.log(`     Instance:`, instance);
        console.log(`     Element:`, document.querySelector(selector));
        
        // Try to get state
        if (instance && typeof instance.getState === 'function') {
          try {
            console.log(`     State:`, instance.getState());
          } catch (e) {
            console.log(`     State: Error - ${e.message}`);
          }
        }
      });
    }
    
    console.groupEnd();
  }
  
  // Test component creation
  async testCreate(name, selector = '#test', options = {}) {
    console.group(`[WebTools] Testing ${name} creation`);
    
    try {
      // Check if component is loaded
      if (!this.has(name)) {
        console.log('Component not loaded, loading now...');
        await this.loadComponent(name);
      }
      
      // Get component info
      const component = this.components.get(name);
      const info = this.getComponentInfo(component);
      console.log('Component info:', info);
      
      // Check if selector exists
      const element = document.querySelector(selector);
      console.log('Target element:', element);
      
      if (!element && selector !== '#test') {
        console.error(`Selector "${selector}" not found in DOM`);
        console.groupEnd();
        return null;
      }
      
      // Try to create instance
      console.log('Creating instance...');
      const instance = await this.create(name, selector, options);
      console.log('Instance created successfully:', instance);
      
      console.groupEnd();
      return instance;
    } catch (e) {
      console.error('Failed to create instance:', e);
      console.groupEnd();
      throw e;
    }
  }
  
  // Check health of all components
  checkHealth() {
    console.group('[WebTools] Component Health Check');
    
    const report = {
      loaded: this.list(),
      instances: {},
      issues: []
    };
    
    this.list().forEach(name => {
      const component = this.components.get(name);
      const instances = this.getInstances(name);
      const info = this.getComponentInfo(component);
      
      report.instances[name] = instances.length;
      
      console.log(`${name}:`, {
        type: info.isClass ? 'Class' : 'Function',
        methods: info.methods,
        instances: instances.length,
        selectors: instances.map(i => i.selector)
      });
      
      if (instances.length === 0) {
        report.issues.push(`${name} has no instances`);
      }
      
      // Check each instance
      instances.forEach(({ instance, selector }, i) => {
        const el = document.querySelector(selector);
        if (!el) {
          report.issues.push(`${name} instance ${i} selector "${selector}" not found in DOM`);
        }
        if (instance && typeof instance.getState === 'function') {
          try {
            const state = instance.getState();
            console.log(`  Instance ${i} state:`, state);
          } catch (e) {
            console.log(`  Instance ${i} getState() failed:`, e.message);
          }
        }
      });
    });
    
    if (report.issues.length > 0) {
      console.warn('Issues found:', report.issues);
    }
    
    console.log('Summary:', {
      totalComponents: report.loaded.length,
      totalInstances: Object.values(report.instances).reduce((a, b) => a + b, 0),
      issues: report.issues.length,
      alpineLoaded: typeof Alpine !== 'undefined',
      alpineVersion: typeof Alpine !== 'undefined' ? Alpine.version : 'not loaded'
    });
    
    console.groupEnd();
    return report;
  }
  
  // Export/import
  export = () => ({ components: this.list(), baseUrl: this.options.baseUrl });
  async import(state) {
    if (state.baseUrl) this.options.baseUrl = state.baseUrl;
    if (state.components) await this.loadComponent(...state.components);
  }
  
  // Helper for auto-loading components
  async loadComponents(components) {
    if (components.length === 0) return;
    
    console.log(`[WebTools] Loading components: ${components.join(', ')}`);
    
    try {
      const loaded = await this.loadComponent(...components);
      
      // Validate loaded components
      const loadedNames = [];
      const failedNames = [];
      
      if (components.length === 1) {
        if (loaded) {
          loadedNames.push(components[0]);
        } else {
          failedNames.push(components[0]);
        }
      } else {
        Object.entries(loaded).forEach(([name, component]) => {
          if (component) {
            loadedNames.push(name);
          } else {
            failedNames.push(name);
          }
        });
      }
      
      console.log(`[WebTools] Successfully loaded: ${loadedNames.join(', ') || 'none'}`);
      if (failedNames.length > 0) {
        console.error(`[WebTools] Failed to load: ${failedNames.join(', ')}`);
      }
      
      // Show loaded component details
      loadedNames.forEach(name => {
        const info = this.getComponentInfo(this.components.get(name));
        console.log(`[WebTools] ${name}: ${info.isClass ? 'Class' : 'Function'} with methods: [${info.methods.join(', ')}]`);
      });
      
      // Run health check after a delay
      setTimeout(() => {
        console.log('[WebTools] Running initial health check...');
        const health = this.checkHealth();
        if (health.issues.length > 0) {
          console.warn('[WebTools] Health check found issues. Run WT.debug("ComponentName") for details.');
        }
      }, 500);
      
    } catch (e) {
      console.error('[WebTools] Failed to auto-load components', e);
    }
  }
}

// Auto-init
const script = document.currentScript;
const autoInit = script?.getAttribute('data-init') !== 'false';
const config = script?.getAttribute('data-config') === 'true';
const autoLoad = script?.getAttribute('data-load');

// Create instance immediately if auto-init is enabled
if (autoInit) {
  console.log('[WebTools] Auto-initializing...');
  const wt = new WebTools({ config });
  window.WebTools = window.WT = wt;
  console.log('[WebTools] Instance available as window.WT');
  
  // Add helpful console message
  console.log('%c[WebTools] Debug Commands:', 'font-weight: bold; color: #4a90e2');
  console.log('  WT.checkHealth()     - Check component health');
  console.log('  WT.list()            - List loaded components');
  console.log('  WT.showInfo("name")  - Show component details');
  console.log('  WT.debug("name")     - Debug specific component');
  console.log('  WT.testCreate("name", "#selector") - Test component creation');
  console.log('  WT.getInstances("name") - Get component instances');
  console.log('  WT.getAllInstances() - Get all instances across components');
  
  if (autoLoad) {
    // Parse components to load
    const components = autoLoad.split(',').map(s => s.trim()).filter(Boolean);
    console.log(`[WebTools] Will auto-load: ${components.join(', ')}`);
    
    // Wait for DOM to be ready before loading components
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', async () => {
        await wt.loadComponents(components);
      });
    } else {
      // DOM already loaded
      wt.loadComponents(components);
    }
  }
}
