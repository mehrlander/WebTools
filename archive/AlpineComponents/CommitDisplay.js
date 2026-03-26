class CommitDisplay {
  constructor(selector, options = {}) {
    this.el = document.querySelector(selector)
    if (!this.el) {
      console.warn(`CommitDisplay: No element found for selector "${selector}"`)
      return
    }
    
    this.options = options
    this.render()
  }
  
  render() {
    this.el.innerHTML = `
      <div x-data="{
        async handleCommitSelect(sha) {
          $store.repo.selectCommit(sha)
          const viewer = repositoryViewer()
          if ($store.repo.currentFile) {
            await viewer.showFileContent($store.repo.currentFile, sha)
          } else {
            await viewer.showAnyFileFromCommit(sha)
          }
        }
      }">
        <button @click="$store.ui.commitsCollapsed = !$store.ui.commitsCollapsed" 
                class="flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors w-full text-left">
          <i :class="$store.ui.commitsCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'"></i>
          <span>Commits</span>
        </button>
        
        <div x-show="!$store.ui.commitsCollapsed" x-collapse>
          <div class="max-h-96 overflow-y-auto border border-base-300 rounded-lg mt-1">
            <template x-if="$store.data.commits.length === 0">
              <div class="text-base-content/60 text-center py-3 text-sm">No commits loaded</div>
            </template>
            
            <template x-for="commit in $store.data.commits" :key="commit.sha">
              <div @click="handleCommitSelect(commit.sha)"
                   :class="$store.repo.selectedCommit === commit.sha ? 'bg-primary/20' : ''"
                   class="p-2 hover:bg-base-200 cursor-pointer border-b border-base-200 last:border-0">
                <div class="text-sm font-medium truncate" x-text="commit.commit.message.split('\\n')[0]"></div>
                <div class="text-xs text-base-content/60">
                  <span x-text="commit.commit.author.name"></span> • 
                  <span x-text="new Date(commit.commit.author.date).toLocaleDateString()"></span>
                </div>
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

// Export to global scope
window.CommitDisplay = CommitDisplay
