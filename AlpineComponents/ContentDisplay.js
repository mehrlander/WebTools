class ContentDisplay {
  constructor(selector, options = {}) {
    this.el = document.querySelector(selector)
    if (!this.el) {
      console.warn(`ContentDisplay: No element found for selector "${selector}"`)
      return
    }
    
    this.options = options
    this.render()
  }
  
  render() {
    this.el.innerHTML = `
      <div x-data="{ 
        collapsed: false,
        
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
      }">
        <div class="flex items-center justify-between mb-2">
          <button @click="collapsed = !collapsed" 
                  class="flex items-center gap-1 font-semibold hover:text-primary transition-colors">
            <i :class="collapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'"></i>
            <span x-text="$store.repo.currentFile || 'No file selected'"></span>
          </button>
          <button @click="$store.ui.openUrlsModal()" 
                  :disabled="!$store.repo.hasValidSelection"
                  :class="$store.repo.hasValidSelection ? 'btn-outline' : 'btn-disabled'"
                  class="btn btn-sm">
            <i class="ph ph-link"></i>
            <span>URLs</span>
          </button>
        </div>
        
        <div x-show="!collapsed" x-collapse>
          <div class="text-xs text-base-content/60 mb-1" x-text="$store.repo.versionInfo"></div>
          <textarea x-model="$store.repo.fileContent" 
                    rows="20" 
                    class="textarea textarea-bordered w-full font-mono text-sm" 
                    placeholder="Select a file to view" 
                    readonly></textarea>
        </div>
        
        <template x-effect="
          if ($store.ui.urlsModalOpen) {
            const urls = generateUrls()
            window.WT?.getInstances('CopyBox').forEach(({instance}) => {
              instance?.setUrls(urls)
            })
          }
        "></template>
      </div>
    `
  }
  
  destroy() {
    this.el.innerHTML = ''
  }
}

// Export to global scope
window.ContentDisplay = ContentDisplay
