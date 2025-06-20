/**
 * CommitDisplay - A reactive commit list display component
 * Requires: Alpine.js, DaisyUI, Phosphor Icons
 */
class CommitDisplay {
  constructor(selector, options = {}) {
    this.selector = selector;
    this.id = `cd_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[CommitDisplay] Creating component for ${selector}`, options);
    console.log(`[CommitDisplay] Alpine available?`, typeof Alpine !== 'undefined');
    console.log(`[CommitDisplay] Alpine version/features:`, {
      version: Alpine?.version,
      hasReactive: typeof Alpine?.reactive === 'function',
      hasStore: typeof Alpine?.store === 'function',
      hasInitTree: typeof Alpine?.initTree === 'function'
    });
    
    // Check if Alpine is available
    if (typeof Alpine === 'undefined') {
      console.error('[CommitDisplay] Alpine.js is not loaded!');
      throw new Error('Alpine.js is required for CommitDisplay');
    }
    
    // Create data store (works with both Alpine 2.x and 3.x)
    if (Alpine.reactive) {
      console.log(`[CommitDisplay] Using Alpine 3.x reactive`);
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
    } else {
      console.log(`[CommitDisplay] Using plain object (Alpine 2.x compatible)`);
      this.store = {
        commits: [],
        selectedCommit: null,
        fromCommit: null,
        toCommit: null,
        currentFile: null,
        loading: true,
        error: null,
        collapsed: false,
        ...options
      };
    }
    
    console.log(`[CommitDisplay] Initial store state:`, { ...this.store });
    console.log(`[CommitDisplay] Store is reactive?`, this.store);
    console.log(`[CommitDisplay] Commits in initial options:`, options.commits?.length || 0);
    
    // Store callbacks separately (non-reactive)
    this.callbacks = {
      onCommitSelect: options.onCommitSelect,
      onCompareChange: options.onCompareChange
    };
    
    this.mount();
  }
  
  mount() {
    const target = document.querySelector(this.selector);
    console.log(`[CommitDisplay] Mounting to ${this.selector}`, target);
    
    if (!target) {
      console.error(`CommitDisplay: Target "${this.selector}" not found`);
      return false;
    }
    
    // Create Alpine component inline
    const dataAttribute = Alpine.reactive ? `$store.${this.id}` : `${this.id}()`;
    
    target.innerHTML = `
      <div x-data="${dataAttribute}" class="${this.store.containerClass || ''}">
        <div x-init="console.log('[CommitDisplay] Alpine initialized with data:', $data); console.log('[CommitDisplay] Commits in $data:', $data.commits?.length); console.log('[CommitDisplay] Loading state:', $data.loading)"></div>
        ${this.store.collapsible !== false ? `
          <button @click="collapsed = !collapsed" class="${this.store.headerClass || 'flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors'}">
            <i :class="collapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'"></i>
            <span x-text="'Commits (' + commits.length + ')'"></span>
          </button>
        ` : ''}
        
        <div x-show="${this.store.collapsible !== false ? '!collapsed' : 'true'}">
          <div x-init="console.log('[CommitDisplay] Container init - loading:', loading, 'error:', error, 'commits:', commits?.length)"></div>
          <div class="${this.store.listClass || 'space-y-0 text-xs overflow-y-auto w-full min-h-[100px] max-h-60 p-1 bg-base-100 rounded-lg border border-base-300'}">
            <div x-show="loading" class="text-base-content/60 text-center py-3 text-sm">Loading commits...</div>
            <div x-show="error" class="text-error text-center py-3 text-sm" x-text="error"></div>
            <div x-show="!loading && !error && commits.length === 0" class="text-base-content/60 text-center py-3 text-sm">No commits found</div>
            
            <template x-if="!loading && !error && commits.length > 0">
              <div>
                <div x-init="console.log('[CommitDisplay] Rendering commits:', commits.length, 'First commit:', commits[0])"></div>
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
    
    console.log(`[CommitDisplay] HTML injected, initializing Alpine`);
    
    // Initialize Alpine component with store reference
    console.log(`[CommitDisplay] Attempting Alpine initialization`);
    
    // Try different Alpine initialization methods
    if (Alpine.store && Alpine.reactive) {
      console.log(`[CommitDisplay] Using Alpine.store method`);
      Alpine.store(this.id, this.store);
      Alpine.initTree(target);
    } else {
      console.log(`[CommitDisplay] Using window data method (fallback)`);
      // Fallback for older Alpine versions
      window[this.id] = () => {
        console.log(`[CommitDisplay] Data function called, returning:`, this.store);
        return this.store;
      };
      
      // Manually trigger Alpine init if needed
      if (Alpine.start) {
        Alpine.start();
      }
    }
    
    console.log(`[CommitDisplay] Component mounted, checking data availability`);
    
    // Verify the component can access data
    const componentEl = target.querySelector('[x-data]');
    if (componentEl && componentEl.__x) {
      console.log(`[CommitDisplay] Alpine component data:`, componentEl.__x.$data);
    }
    
    // Check data after a delay to see if it updates
    setTimeout(() => {
      const el = target.querySelector('[x-data]');
      if (el && el.__x) {
        console.log(`[CommitDisplay] Data after 1s delay:`, {
          commits: el.__x.$data.commits?.length,
          loading: el.__x.$data.loading,
          error: el.__x.$data.error
        });
      }
    }, 1000);
    
    // Set up event listeners
    target.addEventListener('commit-select', (e) => {
      console.log(`[CommitDisplay] Commit selected:`, e.detail);
      this.callbacks.onCommitSelect?.(e.detail);
    });
    
    target.addEventListener('compare-change', () => {
      console.log(`[CommitDisplay] Compare changed:`, this.store.fromCommit, this.store.toCommit);
      this.store.selectedCommit = null;
      this.callbacks.onCompareChange?.(this.store.fromCommit, this.store.toCommit);
    });
    
    return true;
  }
  
  // Simplified setters using reactive store
  setCommits(commits) {
    console.log(`[CommitDisplay] setCommits called with ${commits?.length || 0} commits`);
    console.log(`[CommitDisplay] First commit:`, commits?.[0]);
    console.log(`[CommitDisplay] Store before update:`, this.store);
    this.store.commits = commits;
    this.store.loading = false;
    console.log(`[CommitDisplay] Store after setCommits:`, { 
      commits: this.store.commits.length, 
      loading: this.store.loading,
      error: this.store.error,
      storeObject: this.store
    });
    
    // Force update if not using reactive
    if (!Alpine.reactive) {
      console.log(`[CommitDisplay] Forcing component refresh (non-reactive mode)`);
      this.refresh();
    }
  }
  
  setLoading(loading) {
    console.log(`[CommitDisplay] setLoading:`, loading);
    this.store.loading = loading;
    if (!Alpine.reactive) this.refresh();
  }
  
  setError(error) {
    console.log(`[CommitDisplay] setError:`, error);
    this.store.error = error;
    if (!Alpine.reactive) this.refresh();
  }
  
  setSelectedCommit(sha) {
    console.log(`[CommitDisplay] setSelectedCommit:`, sha);
    this.store.selectedCommit = sha;
    this.store.fromCommit = null;
    this.store.toCommit = null;
    if (!Alpine.reactive) this.refresh();
  }
  
  setCompareCommits(fromSha, toSha) {
    console.log(`[CommitDisplay] setCompareCommits:`, fromSha, toSha);
    this.store.fromCommit = fromSha;
    this.store.toCommit = toSha;
    this.store.selectedCommit = null;
    if (!Alpine.reactive) this.refresh();
  }
  
  clearSelections() {
    console.log(`[CommitDisplay] clearSelections`);
    this.store.selectedCommit = null;
    this.store.fromCommit = null;
    this.store.toCommit = null;
    if (!Alpine.reactive) this.refresh();
  }
  
  setCurrentFile(filePath) {
    console.log(`[CommitDisplay] setCurrentFile:`, filePath);
    this.store.currentFile = filePath;
    if (!Alpine.reactive) this.refresh();
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
  
  // Force refresh for non-reactive Alpine versions
  refresh() {
    const component = document.querySelector(`${this.selector} [x-data]`);
    console.log(`[CommitDisplay] Refresh - found component:`, component, 'has __x?', component?.__x);
    if (component && component.__x) {
      console.log(`[CommitDisplay] Refreshing Alpine component`);
      component.__x.$nextTick(() => {
        component.__x.$refresh();
      });
    } else {
      console.log(`[CommitDisplay] Could not refresh - no Alpine component found`);
    }
  }
  
  // Cleanup
  destroy() {
    const target = document.querySelector(this.selector);
    if (target) {
      if (Alpine.destroyTree) {
        Alpine.destroyTree(target);
      }
      target.innerHTML = '';
    }
    if (Alpine.store) {
      delete Alpine.store()[this.id];
    } else {
      delete window[this.id];
    }
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
