class CopyBox {
  constructor(selector, options = {}) {
    this.el = document.querySelector(selector)
    if (!this.el) {
      console.warn(`CopyBox: No element found for selector "${selector}"`)
      return
    }
    
    this.options = options
    this.urls = []
    this.render()
  }
  
  render() {
    this.el.innerHTML = `
      <div x-data="{
        urls: [],
        lastCopied: '',
        
        async copyUrl(url) {
          await navigator.clipboard.writeText(url.value)
          this.lastCopied = url.label
          setTimeout(() => { this.lastCopied = '' }, 2000)
        },
        
        generateUrls() {
          if (!$store.repo.hasValidSelection) return []
          
          const repo = $store.repo.currentRepo
          const file = $store.repo.currentFile
          const sha = $store.repo.selectedCommit
          
          return [
            { label: 'GitHub (Latest)', value: \`https://github.com/\${repo}/blob/main/\${file}\` },
            { label: 'GitHub (Selected Commit)', value: \`https://github.com/\${repo}/blob/\${sha}/\${file}\` },
            { label: 'JSDelivr CDN (Latest)', value: \`https://cdn.jsdelivr.net/gh/\${repo}/\${file}\` },
            { label: 'JSDelivr CDN (Selected Commit)', value: \`https://cdn.jsdelivr.net/gh/\${repo}@\${sha}/\${file}\` }
          ]
        }
      }" x-init="urls = generateUrls()">
        <div class="space-y-2">
          <template x-for="url in urls" :key="url.label">
            <div class="join w-full">
              <input type="text" :value="url.value" readonly 
                     class="input input-bordered input-sm join-item flex-1 font-mono text-xs">
              <button @click="copyUrl(url)" 
                      class="btn btn-sm join-item"
                      :class="lastCopied === url.label ? 'btn-success' : ''">
                <i :class="lastCopied === url.label ? 'ph ph-check' : 'ph ph-clipboard'"></i>
              </button>
            </div>
          </template>
          
          <template x-if="urls.length === 0">
            <div class="text-sm text-base-content/60 text-center py-4">
              Select a file and commit to generate URLs
            </div>
          </template>
        </div>
        
        <div x-show="lastCopied" x-transition
             class="card bg-base-200 shadow-sm p-3 mt-4">
          <div class="text-sm">
            <span class="text-base-content/60">Copied:</span>
            <span class="font-medium" x-text="lastCopied"></span>
          </div>
        </div>
        
        <template x-effect="urls = generateUrls()"></template>
      </div>
    `
  }
  
  setUrls(urls) {
    this.urls = urls
    const alpineData = this.el.querySelector('[x-data]')?._x_dataStack?.[0]
    if (alpineData) {
      alpineData.urls = urls
    }
  }
  
  destroy() {
    this.el.innerHTML = ''
  }
}

// Export to global scope
window.CopyBox = CopyBox
