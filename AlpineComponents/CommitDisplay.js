/**
 * CommitDisplay - A reactive commit list display component
 * Requires: Alpine.js 3.x, DaisyUI, Phosphor Icons
 */
class CommitDisplay {
  constructor(selector, options = {}) {
    this.el = document.querySelector(selector);
    if (!this.el) {
      console.warn(`CommitDisplay: No element found for selector "${selector}"`);
      return;
    }
    
    // Store options for reference
    this.options = {
      commits: [],
      selectedCommit: null,
      fromCommit: null,
      toCommit: null,
      currentFile: null,
      loading: true,
      error: null,
      collapsed: false,
      collapsible: true,
      containerClass: '',
      headerClass: 'flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors',
      listClass: 'space-y-0 text-xs overflow-y-auto w-full min-h-[100px] max-h-60 p-1 bg-base-100 rounded-lg border border-base-300',
      onCommitSelect: null,
      onCompareChange: null,
      ...options
    };
    
    // Create unique component ID for Alpine registration
    this.componentId = `commitDisplay_${Math.random().toString(36).substr(2, 9)}`;
    
    // Register Alpine component
    this.registerAlpineComponent();
    
    // Render the component
    this.render();
    
    // Bind events after render
    this.bindEvents();
  }
  
  registerAlpineComponent() {
    const options = this.options;
    
    Alpine.data(this.componentId, () => ({
      // Reactive state
      commits: options.commits,
      selectedCommit: options.selectedCommit,
      fromCommit: options.fromCommit,
      toCommit: options.toCommit,
      currentFile: options.currentFile,
      loading: options.loading,
      error: options.error,
      collapsed: options.collapsed,
      
      // Computed properties
      get hasSelections() {
        return this.selectedCommit || (this.fromCommit && this.toCommit);
      },
      
      get commitCount() {
        return this.commits?.length || 0;
      },
      
      // Methods
      toggle() {
        this.collapsed = !this.collapsed;
      },
      
      selectCommit(sha) {
        this.selectedCommit = sha;
        this.fromCommit = null;
        this.toCommit = null;
        this.$dispatch('commit-select', sha);
      },
      
      updateCompare() {
        this.selectedCommit = null;
        this.$dispatch('compare-change', {
          from: this.fromCommit,
          to: this.toCommit
        });
      },
      
      clearSelections() {
        this.selectedCommit = null;
        this.fromCommit = null;
        this.toCommit = null;
      },
      
      getCommitClass(commit) {
        if (this.selectedCommit === commit.sha) {
          return 'bg-primary/20 border-l-2 border-primary';
        }
        if (this.fromCommit === commit.sha) {
          return 'bg-warning/20 border-l-2 border-warning';
        }
        if (this.toCommit === commit.sha) {
          return 'bg-error/20 border-l-2 border-error';
        }
        return '';
      }
    }));
  }
  
  render() {
    const radioNameFrom = `${this.componentId}-from`;
    const radioNameTo = `${this.componentId}-to`;
    
    this.el.innerHTML = `
      <div x-data="${this.componentId}" class="${this.options.containerClass}">
        ${this.options.collapsible ? `
          <button @click="toggle()" class="${this.options.headerClass}">
            <i :class="collapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'"></i>
            <span x-text="'Commits (' + commitCount + ')'"></span>
          </button>
        ` : ''}
        
        <div x-show="${this.options.collapsible ? '!collapsed' : 'true'}" 
             x-collapse="${this.options.collapsible ? 'true' : ''}">
          <div class="${this.options.listClass}">
            <!-- Loading state -->
            <div x-show="loading" class="text-base-content/60 text-center py-3 text-sm">
              Loading commits...
            </div>
            
            <!-- Error state -->
            <div x-show="error && !loading" class="text-error text-center py-3 text-sm" x-text="error"></div>
            
            <!-- Empty state -->
            <div x-show="!loading && !error && commitCount === 0" 
                 class="text-base-content/60 text-center py-3 text-sm">
              No commits found
            </div>
            
            <!-- Commits list -->
            <template x-for="(commit, index) in commits" :key="commit.sha">
              <div :class="getCommitClass(commit)"
                   class="commit-item flex items-center gap-2 px-1 py-0.5 hover:bg-base-200 rounded transition-colors w-full">
                <!-- Radio buttons for comparison -->
                <div class="flex gap-1 items-center flex-shrink-0">
                  <input type="radio" 
                         name="${radioNameFrom}" 
                         :value="commit.sha" 
                         x-model="fromCommit" 
                         @change="updateCompare()"
                         class="radio radio-warning radio-xs"
                         title="Select as 'from' commit">
                  <input type="radio" 
                         name="${radioNameTo}" 
                         :value="commit.sha" 
                         x-model="toCommit" 
                         @change="updateCompare()"
                         class="radio radio-error radio-xs"
                         title="Select as 'to' commit">
                </div>
                
                <!-- Commit info -->
                <div @click="selectCommit(commit.sha)" 
                     class="flex-1 min-w-0 cursor-pointer">
                  <div class="text-xs font-medium truncate" 
                       x-text="commit.commit.message.split('\\n')[0]"
                       :title="commit.commit.message"></div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span x-show="index === 0" class="badge badge-primary badge-xs">Latest</span>
                    <span class="text-xs opacity-50" 
                          x-text="new Date(commit.commit.author.date).toLocaleDateString()"></span>
                    <span x-show="currentFile" 
                          class="text-xs font-mono opacity-70" 
                          x-text="currentFile?.split('/').pop()"
                          :title="currentFile"></span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    `;
  }
  
  bindEvents() {
    // Handle commit selection event
    if (this.options.onCommitSelect) {
      this.el.addEventListener('commit-select', (event) => {
        const sha = event.detail;
        const commit = this.getData()?.commits.find(c => c.sha === sha);
        this.options.onCommitSelect(sha, commit);
      });
    }
    
    // Handle compare change event
    if (this.options.onCompareChange) {
      this.el.addEventListener('compare-change', (event) => {
        const { from, to } = event.detail;
        this.options.onCompareChange(from, to);
      });
    }
  }
  
  // Public API methods
  
  setCommits(commits) {
    const data = this.getData();
    if (data) {
      data.commits = commits;
      data.loading = false;
      data.error = null;
    }
  }
  
  setLoading(loading) {
    const data = this.getData();
    if (data) {
      data.loading = loading;
    }
  }
  
  setError(error) {
    const data = this.getData();
    if (data) {
      data.error = error;
      data.loading = false;
    }
  }
  
  setSelectedCommit(sha) {
    const data = this.getData();
    if (data) {
      data.selectedCommit = sha;
      data.fromCommit = null;
      data.toCommit = null;
    }
  }
  
  setCompareCommits(fromSha, toSha) {
    const data = this.getData();
    if (data) {
      data.fromCommit = fromSha;
      data.toCommit = toSha;
      data.selectedCommit = null;
    }
  }
  
  clearSelections() {
    const data = this.getData();
    if (data) {
      data.clearSelections();
    }
  }
  
  setCurrentFile(filePath) {
    const data = this.getData();
    if (data) {
      data.currentFile = filePath;
    }
  }
  
  // Get Alpine component data
  getData() {
    const alpineEl = this.el.querySelector('[x-data]');
    return alpineEl ? Alpine.$data(alpineEl) : null;
  }
  
  // Get current state as plain object
  getState() {
    const data = this.getData();
    if (!data) return null;
    
    return {
      commits: data.commits,
      selectedCommit: data.selectedCommit,
      fromCommit: data.fromCommit,
      toCommit: data.toCommit,
      currentFile: data.currentFile,
      loading: data.loading,
      error: data.error,
      collapsed: data.collapsed
    };
  }
  
  getSelectedCommit() {
    const data = this.getData();
    return data?.commits.find(c => c.sha === data.selectedCommit) || null;
  }
  
  getCompareCommits() {
    const data = this.getData();
    if (!data || !data.fromCommit || !data.toCommit) return null;
    
    return {
      from: data.commits.find(c => c.sha === data.fromCommit),
      to: data.commits.find(c => c.sha === data.toCommit)
    };
  }
  
  // Cleanup
  destroy() {
    // Remove event listeners
    this.el.removeEventListener('commit-select', this.options.onCommitSelect);
    this.el.removeEventListener('compare-change', this.options.onCompareChange);
    
    // Clear the element
    this.el.innerHTML = '';
  }
  
  // Static method for WebTools compatibility
  static onLoad() {
    console.log('CommitDisplay: Component loaded', {
      version: '2.0.0',
      type: 'Alpine-aware component',
      requires: ['Alpine.js 3.x', 'DaisyUI', 'Phosphor Icons'],
      methods: ['setCommits', 'setLoading', 'setError', 'setSelectedCommit', 'setCompareCommits', 'clearSelections', 'setCurrentFile', 'getState', 'getSelectedCommit', 'getCompareCommits']
    });
  }
}

// Call onLoad if component is loaded standalone
if (typeof CommitDisplay.onLoad === 'function') {
  CommitDisplay.onLoad();
}
