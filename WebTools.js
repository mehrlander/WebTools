class WebTools {
  constructor(options = {}) {
    console.log('[WebTools] Initializing...', options)
    
    this.options = {
      cache: true,
      showConfig: true,
      debug: true,
      ...options
    }
    
    this.components = new Map()
    this.loading = new Set()
    this.instances = new Map()
    
    // Default base URL - will be overridden by Alpine store if available
    this._defaultBaseUrl = 'https://cdn.jsdelivr.net/gh/mehrlander/WebTools@test-branch/AlpineComponents'
    
    if (this.options.showConfig) {
      // Delay config init to ensure DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.initConfig())
      } else {
        this.initConfig()
      }
    }
    
    window.WebTools = this
    window.WT = this
    
    console.log('[WebTools] Initialized successfully')
  }
  
  get baseUrl() {
    // Try to get from Alpine store first
    if (typeof Alpine !== 'undefined' && Alpine.store) {
      try {
        const config = Alpine.store('config')
        if (config && config.webToolsRepo) {
          const url = `https://cdn.jsdelivr.net/gh/${config.webToolsRepo}@${config.webToolsCommit}/${config.componentsPath}`
          if (this.options.debug) {
            console.log('[WebTools] Using Alpine store URL:', url)
          }
          return url
        }
      } catch (e) {
        console.warn('[WebTools] Alpine store not ready, using default URL')
      }
    }
    
    // Fallback to default
    if (this.options.debug) {
      console.log('[WebTools] Using default URL:', this._defaultBaseUrl)
    }
    return this._defaultBaseUrl
  }
  
  async loadComponent(name) {
    console.log(`[WebTools] Loading component: ${name}`)
    
    if (this.components.has(name) && this.options.cache) {
      console.log(`[WebTools] Component ${name} found in cache`)
      return this.components.get(name)
    }
    
    if (this.loading.has(name)) {
      console.log(`[WebTools] Component ${name} already loading, waiting...`)
      return await this.waitFor(name)
    }
    
    this.loading.add(name)
    
    try {
      const url = `${this.baseUrl}/${name}.js`
      console.log(`[WebTools] Fetching component from: ${url}`)
      
      await this.loadScript(url)
      const component = await this.getGlobal(name)
      
      this.components.set(name, component)
      this.loading.delete(name)
      
      console.log(`[WebTools] Component ${name} loaded successfully`)
      
      if (this.configPanel) this.updateConfig()
      
      return component
    } catch (e) {
      this.loading.delete(name)
      console.error(`[WebTools] Failed to load component ${name}:`, e)
      throw e
    }
  }
  
  async loadComponents(...names) {
    console.log(`[WebTools] Loading multiple components:`, names)
    const results = {}
    for (const name of names) {
      try {
        results[name] = await this.loadComponent(name)
      } catch (e) {
        console.error(`[WebTools] Failed to load ${name}:`, e)
        results[name] = null
      }
    }
    return results
  }
  
  async create(name, selector, options = {}) {
    console.log(`[WebTools] Creating instance of ${name} on ${selector}`)
    
    const Component = await this.loadComponent(name)
    const instance = new Component(selector, options)
    
    if (!this.instances.has(name)) {
      this.instances.set(name, [])
    }
    this.instances.get(name).push({ instance, selector })
    
    console.log(`[WebTools] Instance of ${name} created successfully`)
    
    if (this.configPanel) this.updateConfig()
    
    return instance
  }
  
  has(name) {
    return this.components.has(name)
  }
  
  list() {
    return Array.from(this.components.keys())
  }
  
  loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = url
      script.onload = () => {
        console.log(`[WebTools] Script loaded: ${url}`)
        resolve()
      }
      script.onerror = (e) => {
        console.error(`[WebTools] Script failed to load: ${url}`, e)
        reject(new Error(`Failed to load ${url}`))
      }
      document.head.appendChild(script)
    })
  }
  
  getGlobal(name, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      let checkCount = 0
      const check = () => {
        checkCount++
        if (window[name]) {
          console.log(`[WebTools] Global ${name} found after ${checkCount} checks`)
          resolve(window[name])
        } else if (Date.now() - start > timeout) {
          console.error(`[WebTools] Timeout waiting for global ${name} after ${checkCount} checks`)
          reject(new Error(`Timeout waiting for ${name}`))
        } else {
          setTimeout(check, 100) // Check every 100ms instead of 50ms
        }
      }
      check()
    })
  }
  
  async waitFor(name) {
    while (this.loading.has(name)) {
      await new Promise(r => setTimeout(r, 100))
    }
    if (!this.components.has(name)) {
      throw new Error(`${name} failed to load`)
    }
    return this.components.get(name)
  }
  
  initConfig() {
    const button = document.createElement('div')
    button.innerHTML = `
      <button class="btn btn-circle btn-sm btn-ghost border border-base-300 bg-base-100 shadow-sm hover:shadow-md transition-all" 
              onclick="WT.toggleConfig()" title="WebTools Config">
        <i class="ph ph-gear-six text-lg"></i>
      </button>
    `
    button.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999'
    
    const panel = document.createElement('div')
    panel.id = 'wt-config'
    panel.style.cssText = `
      position:fixed;top:60px;right:16px;width:320px;max-height:80vh;
      background:var(--fallback-b1,oklch(var(--b1)/1));
      border:1px solid var(--fallback-bc,oklch(var(--bc)/0.2));
      border-radius:0.75rem;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1),0 10px 10px -5px rgba(0,0,0,0.04);
      z-index:9998;display:none;overflow:hidden;flex-direction:column;
    `
    
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
    `
    
    document.body.appendChild(button)
    document.body.appendChild(panel)
    this.configPanel = panel
    this.updateConfig()
  }
  
  updateConfig() {
    if (!this.configPanel) return
    
    const content = document.getElementById('wt-config-content')
    const comps = Array.from(this.components.keys())
    const stats = this.configPanel.querySelector('.flex.justify-between.text-xs')
    if (stats) {
      stats.innerHTML = `
        <span>${comps.length} components</span>
        <span>${this.getInstanceCount()} instances</span>
      `
    }
    
    if (comps.length === 0) {
      content.innerHTML = '<p class="text-sm text-base-content/60 text-center py-8">No components loaded yet</p>'
      return
    }
    
    content.innerHTML = `
      <div class="space-y-2">
        ${comps.map(name => {
          const count = this.instances.get(name)?.length || 0
          return `
            <div class="card bg-base-200 card-compact hover:shadow-md transition-shadow">
              <div class="card-body p-3">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-medium">${name}</div>
                    <div class="text-xs text-base-content/60">${count} instance${count !== 1 ? 's' : ''}</div>
                  </div>
                  <div class="flex gap-1">
                    <button class="btn btn-xs btn-ghost" onclick="WT.view('${name}')" title="View on GitHub">
                      <i class="ph ph-arrow-square-out"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `
  }
  
  toggleConfig() {
    const panel = document.getElementById('wt-config')
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'
    }
  }
  
  async loadFromConfig() {
    const input = document.getElementById('wt-load-input')
    const name = input.value.trim()
    if (!name) return
    
    try {
      await this.loadComponent(name)
      input.value = ''
      this.updateConfig()
    } catch (e) {
      alert(`Failed to load ${name}: ${e.message}`)
    }
  }
  
  view(name) {
    window.open(`${this.baseUrl}/${name}.js`, '_blank')
  }
  
  getInstances(name) {
    return this.instances.get(name) || []
  }
  
  getInstanceCount() {
    let total = 0
    this.instances.forEach(instances => {
      total += instances.length
    })
    return total
  }
}

// Initialize WebTools immediately
console.log('[WebTools] Creating global instance...')
window.WT = new WebTools({ showConfig: true })
