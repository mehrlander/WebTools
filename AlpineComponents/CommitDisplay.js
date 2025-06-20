/**
 * CommitDisplay - A self-mounting commit list display component
 * Requires: Alpine.js, DaisyUI, Phosphor Icons, Lodash
 * 
 * Usage:
 *   new CommitDisplay('#my-commits', { 
 *     commits: [...],
 *     onCommitSelect: (sha) => { ... }
 *   });
 */
class CommitDisplay {
  constructor(selector, options = {}) {
    // Convert selector to a safe ID by removing special chars
    this.id = selector.replace(/[^a-zA-Z0-9]/g, '_');
    this.selector = selector;
    
    // Merge default options
    this.options = {
      commits: [],
      selectedCommit: null,
      fromCommit: null,
      toCommit: null,
      currentFile: null,
      loading: true,  // Default to loading state
      error: null,
      collapsible: true,
      collapsed: false,
      containerClass: '',
      headerClass: 'flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors',
      listClass: 'space-y-0 text-xs overflow-y-auto w-full min-h-[100px] max-h-60 p-1 bg-base-100 rounded-lg border border-base-300',
      onCommitSelect: null, // Callback when commit is clicked
      onCompareChange: null, // Callback when compare radios change
      ...options
    };
    
    // Auto-mount on creation
    this.mount();
  }
  
  get html() {
    const { collapsible, commits, headerClass, listClass, containerClass } = this.options;
    
    return `
      <div x-data="commitDisplayData_${this.id}" class="${containerClass}">
        ${collapsible ? `
          <button @click="toggleCollapsed()" class="${headerClass}">
            <i :class="collapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'" class="transition-transform"></i>
            <span x-text="'Commits (' + commits.length + ')'">Commits</span>
          </button>
        ` : ''}
        
        <div x-show="${collapsible ? '!collapsed' : 'true'}">
          <div class="${listClass}">
            <template x-if="loading">
              <div class="text-base-content/60 text-center py-3 text-sm">Loading commits...</div>
            </template>
            <template x-if="error">
              <div class="text-error text-center py-3 text-sm" x-text="error"></div>
            </template>
            <template x-if="!loading && !error && commits.length === 0">
              <div class="text-base-content/60 text-center py-3 text-sm">No commits found</div>
            </template>
            <template x-if="!loading && !error && commits.length > 0">
              <div>
                <template x-for="(commit, index) in commits" :key="commit.sha">
                  <div :data-commit="commit.sha" 
                       :class="getCommitClasses(commit.sha)"
                       class="commit-item flex items-center gap-2 px-1 py-0.5 hover:bg-base-200 rounded transition-colors w-full">
                    <div class="flex gap-1 items-center flex-shrink-0">
                      <input type="radio" :name="radioName + '-from'" :value="commit.sha" 
                             x-model="fromCommit" @change="handleCompareChange()"
                             class="radio radio-warning radio-xs compareRadio fromRadio">
                      <input type="radio" :name="radioName + '-to'" :value="commit.sha" 
                             x-model="toCommit" @change="handleCompareChange()"
                             class="radio radio-error radio-xs compareRadio toRadio">
                    </div>
                    <div @click="selectCommit(commit.sha)" class="flex-1 min-w-0 cursor-pointer commit-content">
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                          <div class="text-xs font-medium truncate" x-text="commit.commit.message.split('\n')[0]"></div>
                          <div class="flex items-center gap-2 mt-0.5">
                            <template x-if="index === 0">
                              <span class="badge badge-primary badge-xs">Latest</span>
                            </template>
                            <span class="text-xs opacity-50" x-text="formatDate(commit.commit.author.date)"></span>
                            <template x-if="currentFile">
                              <span class="text-xs font-mono opacity-70" x-text="getFileName(currentFile)"></span>
                            </template>
                          </div>
                        </div>
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
  }
  
  createDataObject() {
    // Always read from current options to get latest values
    const componentId = this.id;
    const radioName = `compare-${this.id}`;
    const options = this.options;
    
    return {
      commits: options.commits,
      selectedCommit: options.selectedCommit,
      fromCommit: options.fromCommit,
      toCommit: options.toCommit,
      currentFile: options.currentFile,
      loading: options.loading,
      error: options.error,
      collapsed: options.collapsed,
      radioName,
      
      formatDate(iso) {
        const d = new Date(iso);
        return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
      },
      
      getFileName(path) {
        return path ? path.split('/').pop() : '';
      },
      
      getCommitClasses(sha) {
        let classes = [];
        if (this.selectedCommit === sha) {
          classes.push('bg-primary/20', 'border-l-2', 'border-primary');
        }
        if (this.fromCommit === sha) {
          classes.push('bg-warning/20', 'border-l-2', 'border-warning');
        }
        if (this.toCommit === sha) {
          classes.push('bg-error/20', 'border-l-2', 'border-error');
        }
        return classes.join(' ');
      },
      
      toggleCollapsed() {
        this.collapsed = !this.collapsed;
        
        // Update options to keep in sync
        options.collapsed = this.collapsed;
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('commits-display-toggled', { 
          detail: { 
            collapsed: this.collapsed,
            componentId
          } 
        }));
      },
      
      selectCommit(sha) {
        // Clear radio selections
        this.fromCommit = null;
        this.toCommit = null;
        this.selectedCommit = sha;
        
        // Update options to keep in sync
        options.fromCommit = null;
        options.toCommit = null;
        options.selectedCommit = sha;
        
        // Call callback if provided
        if (typeof options.onCommitSelect === 'function') {
          options.onCommitSelect(sha);
        }
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('commit-selected', { 
          detail: { 
            sha,
            componentId
          } 
        }));
      },
      
      handleCompareChange() {
        // Clear single commit selection when using radio buttons
        this.selectedCommit = null;
        
        // Update options to keep in sync
        options.selectedCommit = null;
        options.fromCommit = this.fromCommit;
        options.toCommit = this.toCommit;
        
        // Call callback if provided
        if (typeof options.onCompareChange === 'function') {
          options.onCompareChange(this.fromCommit, this.toCommit);
        }
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('commits-compare-changed', { 
          detail: { 
            fromCommit: this.fromCommit,
            toCommit: this.toCommit,
            componentId
          } 
        }));
      }
    };
  }
  
  get data() {
    return this.createDataObject();
  }
  
  mount() {
    const target = document.querySelector(this.selector);
    if (!target) {
      console.error(`CommitDisplay: Target element "${this.selector}" not found`);
      return false;
    }
    
    // Make the data available globally for Alpine
    window[`commitDisplayData_${this.id}`] = this.createDataObject();
    
    // If Alpine is available, use mutateDom for proper reactivity
    if (window.Alpine && window.Alpine.mutateDom) {
      window.Alpine.mutateDom(() => {
        target.innerHTML = this.html;
      });
    } else {
      // Fallback if Alpine isn't ready
      target.innerHTML = this.html;
    }
    
    return true;
  }
  
  // Force update by remounting with current options
  forceUpdate() {
    this.mount();
  }
  
  // Update commits list
  setCommits(commits) {
    // Update the options
    this.options.commits = commits;
    this.options.loading = false;
    
    // Force a re-mount to update the display
    this.forceUpdate();
  }
  
  // Set loading state
  setLoading(loading) {
    this.options.loading = loading;
    this.forceUpdate();
  }
  
  // Set error state
  setError(error) {
    this.options.error = error;
    this.forceUpdate();
  }
  
  // Set selected commit
  setSelectedCommit(sha) {
    this.options.selectedCommit = sha;
    // Clear compare selections when setting single selection
    this.options.fromCommit = null;
    this.options.toCommit = null;
    this.forceUpdate();
  }
  
  // Set compare commits
  setCompareCommits(fromSha, toSha) {
    this.options.fromCommit = fromSha;
    this.options.toCommit = toSha;
    // Clear single selection when setting compare
    this.options.selectedCommit = null;
    this.forceUpdate();
  }
  
  // Clear all selections
  clearSelections() {
    this.options.selectedCommit = null;
    this.options.fromCommit = null;
    this.options.toCommit = null;
    this.forceUpdate();
  }
  
  // Set current file (for display purposes)
  setCurrentFile(filePath) {
    this.options.currentFile = filePath;
    this.forceUpdate();
  }
  
  // Toggle collapsed state
  toggle() {
    const data = window[`commitDisplayData_${this.id}`];
    if (data && this.options.collapsible) {
      data.toggleCollapsed();
    }
  }
  
  // Get current state
  getState() {
    const data = window[`commitDisplayData_${this.id}`];
    return data ? {
      selectedCommit: data.selectedCommit,
      fromCommit: data.fromCommit,
      toCommit: data.toCommit,
      commits: data.commits,
      loading: data.loading,
      error: data.error,
      collapsed: data.collapsed
    } : null;
  }
  
  // Get selected commit object
  getSelectedCommit() {
    const data = window[`commitDisplayData_${this.id}`];
    if (!data || !data.selectedCommit) return null;
    return data.commits.find(c => c.sha === data.selectedCommit);
  }
  
  // Get compare commits objects
  getCompareCommits() {
    const data = window[`commitDisplayData_${this.id}`];
    if (!data || !data.fromCommit || !data.toCommit) return null;
    
    return {
      from: data.commits.find(c => c.sha === data.fromCommit),
      to: data.commits.find(c => c.sha === data.toCommit)
    };
  }
  
  // Destroy the component and clean up
  destroy() {
    const target = document.querySelector(this.selector);
    if (target) {
      target.innerHTML = '';
    }
    delete window[`commitDisplayData_${this.id}`];
  }
  
  // Update component options
  update(newOptions) {
    this.options = { ...this.options, ...newOptions };
    this.mount(); // Re-mount with new options
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommitDisplay;
}

// Also make available globally
if (typeof window !== 'undefined') {
  window.CommitDisplay = CommitDisplay;
}
