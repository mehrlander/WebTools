/**
 * CommitDisplay - A reactive commit list display component
 * Requires: Alpine.js, DaisyUI, Phosphor Icons
 */
class CommitDisplay {
  constructor(selector, options = {}) {
    this.selector = selector;
    this.id = `cd_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create reactive data store
    this.store = Alpine.reactive({
      commits: [],
      selectedCommit: null,
      fromCommit: null,
      toCommit: null,
      currentFile: null,
      loading: true,
      error: null,
      collapsed: false,
      ...options
    });
    
    // Store callbacks separately (non-reactive)
    this.callbacks = {
      onCommitSelect: options.onCommitSelect,
      onCompareChange: options.onCompareChange
    };
    
    this.mount();
  }
  
  mount() {
    const target = document.querySelector(this.selector);
    if (!target) {
      console.error(`CommitDisplay: Target "${this.selector}" not found`);
      return false;
    }
    
    // Create Alpine component inline
    target.innerHTML = `
      <div x-data="$store.${this.id}" class="${this.store.containerClass || ''}">
        ${this.store.collapsible !== false ? `
          <button @click="collapsed = !collapsed" class="${this.store.headerClass || 'flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors'}">
            <i :class="collapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'"></i>
            <span x-text="'Commits (' + commits.length + ')'"></span>
          </button>
        ` : ''}
        
        <div x-show="${this.store.collapsible !== false ? '!collapsed' : 'true'}">
          <div class="${this.store.listClass || 'space-y-0 text-xs overflow-y-auto w-full min-h-[100px] max-h-60 p-1 bg-base-100 rounded-lg border border-base-300'}">
            <div x-show="loading" class="text-base-content/60 text-center py-3 text-sm">Loading commits...</div>
            <div x-show="error" class="text-error text-center py-3 text-sm" x-text="error"></div>
            <div x-show="!loading && !error && commits.length === 0" class="text-base-content/60 text-center py-3 text-sm">No commits found</div>
            
            <template x-if="!loading && !error && commits.length > 0">
              <div>
                <template x-for="(commit, index) in commits" :key="commit.sha">
                  <div :class="{
                         'bg-primary/20 border-l-2 border-primary': selectedCommit === commit.sha,
                         'bg-warning/20 border-l-2 border-warning': fromCommit === commit.sha,
                         'bg-error/20 border-l-2 border-error': toCommit === commit.sha
                       }"
                       class="commit-item flex items-center gap-2 px-1 py-0.5 hover:bg-base-200 rounded transition-colors w-full">
                    <div class="flex gap-1 items-center flex-shrink-0">
                      <input type="radio" :name="'${this.id}-from'" :value="commit.sha" 
                             x-model="fromCommit" @change="$dispatch('compare-change')"
                             class="radio radio-warning radio-xs">
                      <input type="radio" :name="'${this.id}-to'" :value="commit.sha" 
                             x-model="toCommit" @change="$dispatch('compare-change')"
                             class="radio radio-error radio-xs">
                    </div>
                    <div @click="selectedCommit = commit.sha; fromCommit = null; toCommit = null; $dispatch('commit-select', commit.sha)" 
                         class="flex-1 min-w-0 cursor-pointer">
                      <div class="text-xs font-medium truncate" x-text="commit.commit.message.split('\\n')[0]"></div>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span x-show="index === 0" class="badge badge-primary badge-xs">Latest</span>
                        <span class="text-xs opacity-50" x-text="new Date(commit.commit.author.date).toLocaleDateString()"></span>
                        <span x-show="currentFile" class="text-xs font-mono opacity-70" x-text="currentFile?.split('/').pop()"></span>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </div>
        </div>
      </div>
    `;
    
    // Initialize Alpine component with store reference
    Alpine.initTree(target);
    Alpine.store(this.id, this.store);
    
    // Set up event listeners
    target.addEventListener('commit-select', (e) => {
      this.callbacks.onCommitSelect?.(e.detail);
    });
    
    target.addEventListener('compare-change', () => {
      this.store.selectedCommit = null;
      this.callbacks.onCompareChange?.(this.store.fromCommit, this.store.toCommit);
    });
    
    return true;
  }
  
  // Simplified setters using reactive store
  setCommits(commits) {
    this.store.commits = commits;
    this.store.loading = false;
  }
  
  setLoading(loading) {
    this.store.loading = loading;
  }
  
  setError(error) {
    this.store.error = error;
  }
  
  setSelectedCommit(sha) {
    this.store.selectedCommit = sha;
    this.store.fromCommit = null;
    this.store.toCommit = null;
  }
  
  setCompareCommits(fromSha, toSha) {
    this.store.fromCommit = fromSha;
    this.store.toCommit = toSha;
    this.store.selectedCommit = null;
  }
  
  clearSelections() {
    this.store.selectedCommit = null;
    this.store.fromCommit = null;
    this.store.toCommit = null;
  }
  
  setCurrentFile(filePath) {
    this.store.currentFile = filePath;
  }
  
  // Getters
  getState = () => ({ ...this.store });
  
  getSelectedCommit = () => this.store.commits.find(c => c.sha === this.store.selectedCommit);
  
  getCompareCommits() {
    const { fromCommit, toCommit, commits } = this.store;
    return fromCommit && toCommit ? {
      from: commits.find(c => c.sha === fromCommit),
      to: commits.find(c => c.sha === toCommit)
    } : null;
  }
  
  // Cleanup
  destroy() {
    const target = document.querySelector(this.selector);
    if (target) {
      Alpine.destroyTree(target);
      target.innerHTML = '';
    }
    delete Alpine.store()[this.id];
  }
  
  // Update options
  update(newOptions) {
    Object.assign(this.store, newOptions);
    if (newOptions.onCommitSelect) this.callbacks.onCommitSelect = newOptions.onCommitSelect;
    if (newOptions.onCompareChange) this.callbacks.onCompareChange = newOptions.onCompareChange;
  }
}

// Export for both module systems and global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommitDisplay;
}
if (typeof window !== 'undefined') {
  window.CommitDisplay = CommitDisplay;
}
