class FileDisplay {
  constructor(selector, options = {}) {
    this.el = document.querySelector(selector)
    if (!this.el) {
      console.warn(`FileDisplay: No element found for selector "${selector}"`)
      return
    }
    
    this.options = options
    this.render()
  }
  
  render() {
    this.el.innerHTML = `
      <div x-data="{
        get sortedFileTree() {
          return [...$store.data.fileTree].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
            return a.name.localeCompare(b.name)
          })
        },
        
        getParentPath(path) {
          return path.split('/').slice(0, -1).join('/')
        },
        
        async handleFileClick(item) {
          if (item.type === 'dir') {
            await repositoryViewer().loadFileTree(item.path)
          } else {
            await repositoryViewer().loadFile(item.path)
          }
        }
      }">
        <button @click="$store.ui.filesCollapsed = !$store.ui.filesCollapsed" 
                class="flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors w-full text-left">
          <i :class="$store.ui.filesCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'"></i>
          <span>Files</span>
        </button>
        
        <div x-show="!$store.ui.filesCollapsed" x-collapse>
          <div class="overflow-y-auto text-sm bg-base-100 rounded-lg p-1 min-h-[100px] max-h-80 border border-base-300 mt-1">
            <template x-if="$store.ui.fileTreeLoading">
              <div class="text-base-content/60 text-center py-3 text-sm">Loading repository...</div>
            </template>
            
            <template x-if="$store.ui.fileTreeError">
              <div class="text-error text-center py-3 text-sm" x-text="$store.ui.fileTreeError"></div>
            </template>
            
            <template x-if="!$store.ui.fileTreeLoading && !$store.ui.fileTreeError">
              <div>
                <template x-if="$store.repo.currentPath">
                  <div @click="repositoryViewer().loadFileTree(getParentPath($store.repo.currentPath))" 
                       class="file-item px-1 py-0.5 hover:bg-base-200 rounded cursor-pointer font-mono">
                    <i class="ph ph-folder text-warning"></i> ..
                  </div>
                </template>
                
                <template x-for="item in sortedFileTree" :key="item.path">
                  <div @click="handleFileClick(item)" 
                       :class="$store.repo.currentFile === item.path ? 'bg-primary/20' : ''"
                       class="file-item p-1 hover:bg-base-200 rounded cursor-pointer">
                    <i :class="item.type === 'dir' ? 'ph ph-folder text-warning' : 'ph ph-file text-info'"></i>
                    <span x-text="item.name"></span>
                  </div>
                </template>
              </div>
            </template>
          </div>
        </div>
      </div>
    `
  }
  
  destroy() {
    this.el.innerHTML = ''
  }
}
