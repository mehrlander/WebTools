/**
 * RepositoryViewer - A self-mounting GitHub repository file browser component
 * Requires: Alpine.js, DaisyUI, Phosphor Icons, Lodash, CopyBox component
 * 
 * Usage:
 *   new RepositoryViewer('#my-viewer', { 
 *     repository: 'owner/repo',
 *     initialData: { files, commits, content }
 *   });
 */
class RepositoryViewer {
  constructor(selector, options = {}) {
    // Convert selector to a safe ID
    this.id = selector.replace(/[^a-zA-Z0-9]/g, '_');
    this.selector = selector;
    
    // Process options
    this.options = {
      repository: null,
      initialData: null,
      token: null, // Optional GitHub token for private repos
      autoLoad: true,
      showCommits: true,
      showFiles: true,
      showContent: true,
      maxCommits: 30,
      defaultBranch: 'main',
      containerClass: 'max-w-7xl mx-auto px-2 py-3',
      gridClass: 'grid grid-cols-1 lg:grid-cols-3 gap-3',
      ...options
    };
    
    // Auto-mount on creation
    this.mount();
  }
  
  get html() {
    const { repository, containerClass, gridClass, showFiles, showCommits, showContent } = this.options;
    
    return `
      <div class="${containerClass}" x-data="repositoryViewerData_${this.id}">
        <div class="mb-3">
          <h1 class="text-lg font-bold">Repository Viewer</h1>
          <p class="text-sm text-base-content/70">
            Browsing: <span x-text="currentRepo">${repository || 'No repository'}</span>
          </p>
        </div>
        
        <div class="${gridClass}">
          ${showFiles || showCommits ? `
            <div class="lg:col-span-1 space-y-3">
              ${showFiles ? this.getFilesHtml() : ''}
              ${showCommits ? this.getCommitsHtml() : ''}
            </div>
          ` : ''}
          
          ${showContent ? `
            <div class="${showFiles || showCommits ? 'lg:col-span-2' : 'lg:col-span-3'}">
              ${this.getContentHtml()}
            </div>
          ` : ''}
        </div>
        
        ${this.getModalHtml()}
      </div>
    `;
  }
  
  getFilesHtml() {
    return `
      <div>
        <button @click="toggleFiles()" class="flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors">
          <i :class="filesCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'" class="transition-transform"></i>
          <span>Files</span>
        </button>
        <div x-show="!filesCollapsed">
          <div class="overflow-y-auto text-sm bg-base-100 rounded-lg p-1 min-h-[100px] max-h-80 border border-base-300">
            <template x-if="fileTreeLoading">
              <div class="text-base-content/60 text-center py-3 text-sm">Loading repository...</div>
            </template>
            <template x-if="fileTreeError">
              <div class="text-error text-center py-3 text-sm" x-text="fileTreeError"></div>
            </template>
            <template x-if="!fileTreeLoading && !fileTreeError">
              <div>
                <template x-if="currentPath">
                  <div @click="loadFileTree(getParentPath(currentPath))" class="file-item px-1 py-0.5 hover:bg-base-200 rounded cursor-pointer font-mono">
                    <i class="ph ph-folder text-warning"></i> ..
                  </div>
                </template>
                <template x-for="item in sortedFileTree" :key="item.path">
                  <div @click="handleFileClick(item)" 
                       :class="currentFile === item.path ? 'bg-primary/20' : ''"
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
    `;
  }
  
  getCommitsHtml() {
    return `
      <div>
        <button @click="toggleCommits()" class="flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors">
          <i :class="commitsCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'" class="transition-transform"></i>
          <span x-text="\`Commits (\${commits.length})\`">Commits</span>
        </button>
        <div x-show="!commitsCollapsed">
          <div class="space-y-0 text-xs overflow-y-auto w-full min-h-[100px] max-h-60 p-1 bg-base-100 rounded-lg border border-base-300">
            <template x-if="commitsLoading">
              <div class="text-base-content/60 text-center py-3 text-sm">Loading commits...</div>
            </template>
            <template x-if="commitsError">
              <div class="text-error text-center py-3 text-sm" x-text="commitsError"></div>
            </template>
            <template x-if="!commitsLoading && !commitsError && commits.length === 0">
              <div class="text-base-content/60 text-center py-3 text-sm">No commits found</div>
            </template>
            <template x-if="!commitsLoading && !commitsError && commits.length > 0">
              <div>
                <template x-for="(commit, index) in commits" :key="commit.sha">
                  <div :data-commit="commit.sha" 
                       :class="getCommitClasses(commit.sha)"
                       class="commit-item flex items-center gap-2 px-1 py-0.5 hover:bg-base-200 rounded transition-colors w-full">
                    <div class="flex gap-1 items-center flex-shrink-0">
                      <input type="radio" name="compareFrom_${this.id}" :value="commit.sha" 
                             x-model="fromCommit" @change="handleCompareChange()"
                             class="radio radio-warning radio-xs compareRadio fromRadio">
                      <input type="radio" name="compareTo_${this.id}" :value="commit.sha" 
                             x-model="toCommit" @change="handleCompareChange()"
                             class="radio radio-error radio-xs compareRadio toRadio">
                    </div>
                    <div @click="selectCommit(commit.sha)" class="flex-1 min-w-0 cursor-pointer commit-content">
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                          <div class="text-xs font-medium truncate" x-text="commit.commit.message.split('\\n')[0]"></div>
                          <div class="flex items-center gap-2 mt-0.5">
                            <template x-if="index === 0">
                              <span class="badge badge-primary badge-xs">Latest</span>
                            </template>
                            <span class="text-xs opacity-50" x-text="formatDate(commit.commit.author.date)"></span>
                            <template x-if="currentFile">
                              <span class="text-xs font-mono opacity-70" x-text="currentFile.split('/').pop()"></span>
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
  
  getContentHtml() {
    return `
      <div>
        <button @click="toggleContent()" class="flex items-center gap-1 font-semibold text-base py-0.5 hover:text-primary transition-colors mb-1">
          <i :class="contentCollapsed ? 'ph ph-caret-right' : 'ph ph-caret-down'" class="transition-transform"></i>
          <span>Content</span>
        </button>
        
        <div x-show="!contentCollapsed">
          <div class="space-y-2">
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium font-mono truncate" x-text="displayFileName">No file selected</div>
                <div class="text-xs text-base-content/60" x-html="versionInfo"></div>
              </div>
              <button @click="urlsModal.showModal()" :disabled="!hasValidSelection" class="btn btn-sm btn-outline">
                <i class="ph ph-link"></i>
                URLs
              </button>
            </div>
            <div class="flex w-full">
              <textarea x-model="fileContent" rows="20" 
                       class="textarea textarea-bordered font-mono text-sm resize-none flex-grow" 
                       placeholder="Select a file to view its contents" readonly></textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  getModalHtml() {
    return `
      <dialog x-ref="urlsModal" class="modal">
        <div class="modal-box max-w-3xl">
          <form method="dialog">
            <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
          </form>
          <h3 class="font-bold text-lg mb-4">File URLs</h3>
          
          <div id="url-copybox-${this.id}"></div>
        </div>
      </dialog>
    `;
  }
  
  get data() {
    const { repository, initialData, token, autoLoad, maxCommits, defaultBranch } = this.options;
    const componentId = this.id;
    
    return {
      // State
      currentRepo: repository,
      currentFile: null,
      currentPath: '',
      selectedCommit: null,
      fromCommit: null,
      toCommit: null,
      
      // UI State
      filesCollapsed: false,
      commitsCollapsed: false,
      contentCollapsed: false,
      
      // Data
      fileTree: [],
      commits: [],
      commitCache: {},
      
      // Loading states
      fileTreeLoading: false,
      commitsLoading: false,
      fileTreeError: null,
      commitsError: null,
      
      // Content
      fileContent: '',
      displayFileName: 'No file selected',
      versionInfo: '',
      
      // CopyBox component
      urlCopyBox: null,
      urlsModal: null,
      
      // Configuration
      token,
      maxCommits,
      defaultBranch,
      
      async init() {
        this.urlsModal = this.$refs.urlsModal;
        
        if (initialData) {
          this.loadInitialData(initialData);
        } else if (autoLoad && repository) {
          await this.loadRepo();
        }
      },
      
      // Computed properties
      get sortedFileTree() {
        return [...this.fileTree].sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      },
      
      get hasValidSelection() {
        return this.selectedCommit && this.currentFile;
      },
      
      // Initial data loading
      loadInitialData(data) {
        if (data.files) {
          this.fileTree = data.files;
          this.fileTreeLoading = false;
        }
        
        if (data.commits) {
          this.commits = data.commits;
          this.commitCache = {};
          data.commits.forEach(commit => {
            this.commitCache[commit.sha] = commit;
          });
          this.commitsLoading = false;
        }
        
        if (data.content) {
          this.fileContent = data.content.content || '';
          this.displayFileName = data.content.fileName || '';
          this.currentFile = data.content.filePath || null;
          this.selectedCommit = data.content.commitSha || null;
        }
        
        this.updateUrls();
      },
      
      // API methods
      async apiRequest(url) {
        const headers = {};
        if (this.token) {
          headers.Authorization = `token ${this.token}`;
        }
        
        const response = await fetch(url, { headers });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      },
      
      // Utility methods
      formatDate(iso) {
        const d = new Date(iso);
        return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
      },
      
      getParentPath(path) {
        return path.split('/').slice(0, -1).join('');
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
      
      // Toggle methods
      toggleFiles() {
        this.filesCollapsed = !this.filesCollapsed;
      },
      
      toggleCommits() {
        this.commitsCollapsed = !this.commitsCollapsed;
      },
      
      toggleContent() {
        this.contentCollapsed = !this.contentCollapsed;
      },
      
      // Main loading methods
      async loadRepo() {
        if (!this.currentRepo) return;
        
        this.currentFile = null;
        this.selectedCommit = null;
        this.fromCommit = null;
        this.toCommit = null;
        this.commitCache = {};
        
        // Test if repo exists and is accessible
        try {
          const testUrl = `https://api.github.com/repos/${this.currentRepo}`;
          await this.apiRequest(testUrl);
        } catch(error) {
          this.showError(`Could not access repository: ${error.message}`);
          return;
        }
        
        // Clear content area until a commit is selected
        this.fileContent = '';
        this.displayFileName = 'Select a commit to view content';
        this.versionInfo = '';
        
        await Promise.all([
          this.loadFileTree(),
          this.loadCommitHistory()
        ]);
        this.updateUrls();
      },
      
      showError(message) {
        this.fileTreeError = message;
        this.commitsError = message;
      },
      
      async loadFileTree(path = '') {
        this.fileTreeLoading = true;
        this.fileTreeError = null;
        this.currentPath = path;

        if (!this.currentRepo) return;

        try {
          const url = `https://api.github.com/repos/${this.currentRepo}/contents/${path}`;
          const items = await this.apiRequest(url);
          this.fileTree = items;

          // Auto-select the first file in the directory
          await this.autoSelectFirstFile();

        } catch(error) {
          console.error('Error loading file tree:', error);
          this.fileTreeError = 'Error loading files';
        } finally {
          this.fileTreeLoading = false;
        }
      },

      async autoSelectFirstFile() {
        // Sort the file tree: directories first, then files, alphabetically
        const sorted = [...this.fileTree].sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        // Find the first file (not directory)
        const firstFile = sorted.find(item => item.type === 'file');

        if (firstFile) {
          // Load the file (this will also load its commits and display content)
          await this.loadFile(firstFile.path);
        }
      },
      
      async handleFileClick(item) {
        if (item.type === 'dir') {
          await this.loadFileTree(item.path);
        } else {
          await this.loadFile(item.path);
        }
      },
      
      async loadFile(path) {
        if (!this.currentRepo || !path) return;
        
        try {
          this.currentFile = path;
          
          // Load commit history for this file
          await this.loadCommitHistory(path);
          
          // Auto-select the most recent commit and show the file content
          if (this.commits.length > 0) {
            const mostRecentSha = this.commits[0].sha;
            
            // Clear any existing commit selections
            this.fromCommit = null;
            this.toCommit = null;
            
            // Select the most recent commit
            this.selectedCommit = mostRecentSha;
            
            // Show the file content from the most recent commit
            await this.showFileAtCommit(path, mostRecentSha);
          }
          
        } catch(error) {
          console.error('Error loading file:', error);
        }
      },
      
      async loadCommitHistory(filePath = null) {
        this.commitsLoading = true;
        this.commitsError = null;
        
        if (!this.currentRepo) return;
        
        try {
          let url = `https://api.github.com/repos/${this.currentRepo}/commits?per_page=${this.maxCommits}`;
          if (filePath) {
            url += `&path=${encodeURIComponent(filePath)}`;
          }
          
          const commits = await this.apiRequest(url);
          this.commits = commits;
          this.commitCache = {};
          
          // Cache commits
          commits.forEach(commit => {
            this.commitCache[commit.sha] = commit;
          });
          
          // Auto-select the first commit if no file path (loading repo-wide commits)
          if (!filePath && commits.length > 0 && !this.selectedCommit) {
            const firstCommitSha = commits[0].sha;
            this.selectedCommit = firstCommitSha;
            
            // Show content from the first commit
            await this.displayAnyFileFromCommit(firstCommitSha);
          }
        } catch(error) {
          console.error('Error loading commit history:', error);
          this.commitsError = 'Error loading commits';
        } finally {
          this.commitsLoading = false;
        }
      },
      
      async showFileAtCommit(filePath, sha) {
        try {
          const url = `https://api.github.com/repos/${this.currentRepo}/contents/${filePath}?ref=${sha}`;
          const file = await this.apiRequest(url);
          const content = atob(file.content.replace(/\s/g, ''));
          
          this.fileContent = content;
          this.displayFileName = filePath;
          
          const commitData = this.commitCache[sha];
          if (commitData) {
            const statsText = await this.getCommitStats(sha);
            const lengthText = this.getFileLength();
            this.versionInfo = `${this.formatDate(commitData.commit.author.date)}${statsText}${lengthText}`;
          }
          
          this.updateUrls();
        } catch(error) {
          console.error('Error loading file at commit:', error);
          this.fileContent = '// File not found in this commit';
          this.displayFileName = filePath;
          this.updateUrls();
        }
      },
      
      async displayAnyFileFromCommit(sha) {
        try {
          // Get the file tree at this commit
          const url = `https://api.github.com/repos/${this.currentRepo}/git/trees/${sha}?recursive=1`;
          const tree = await this.apiRequest(url);
          
          // Find the first actual file (not a directory)
          const firstFile = tree.tree.find(item => item.type === 'blob');
          
          if (firstFile) {
            // Update currentFile to the found file so URLs work properly
            this.currentFile = firstFile.path;
            
            // Fetch and display this file
            const fileUrl = `https://api.github.com/repos/${this.currentRepo}/contents/${firstFile.path}?ref=${sha}`;
            const file = await this.apiRequest(fileUrl);
            
            if (file.content) {
              const content = atob(file.content.replace(/\s/g, ''));
              this.fileContent = content;
              this.displayFileName = firstFile.path;
              
              const commitData = this.commitCache[sha];
              if (commitData) {
                const statsText = await this.getCommitStats(sha);
                const lengthText = this.getFileLength();
                this.versionInfo = `${this.formatDate(commitData.commit.author.date)}${statsText}${lengthText}`;
              }
              
              this.updateUrls();
              return;
            }
          }
          
          // Fallback: show commit message if no files found
          const commitData = this.commitCache[sha];
          if (commitData) {
            this.fileContent = commitData.commit.message;
            this.displayFileName = `Commit: ${commitData.commit.message.split('\n')[0]}`;
            const statsText = await this.getCommitStats(sha);
            const lengthText = this.getFileLength();
            this.versionInfo = `${this.formatDate(commitData.commit.author.date)}${statsText}${lengthText}`;
            this.currentFile = null; // No file to show URLs for
            this.updateUrls();
          }
          
        } catch(error) {
          console.error('Error loading file from commit:', error);
          this.fileContent = '// Error loading content from commit';
          this.updateUrls();
        }
      },
      
      async getCommitStats(sha) {
        try {
          const url = `https://api.github.com/repos/${this.currentRepo}/commits/${sha}`;
          const commit = await this.apiRequest(url);
          
          if (commit.stats) {
            const {additions = 0, deletions = 0, total = 0} = commit.stats;
            if (total === 0) return '';
            
            const parts = [];
            if (additions > 0) parts.push(`<span class="text-green-500">+${additions}</span>`);
            if (deletions > 0) parts.push(`<span class="text-red-500">-${deletions}</span>`);
            
            return ` • ${parts.join(' ')}`;
          }
          return '';
        } catch(error) {
          console.error('Error fetching commit stats:', error);
          return '';
        }
      },
      
      getFileLength() {
        if (!this.fileContent) return '';
        
        const lineCount = this.fileContent.split('\n').length;
        return ` • ${lineCount} lines`;
      },
      
      // Event handlers
      async selectCommit(sha) {
        // Clear radio selections
        this.fromCommit = null;
        this.toCommit = null;
        
        this.selectedCommit = sha;

        // ALWAYS show content from the selected commit
        if (this.currentFile) {
          // Show the currently selected file from this commit
          await this.showFileAtCommit(this.currentFile, sha);
        } else {
          // Show any file from this commit
          await this.displayAnyFileFromCommit(sha);
        }
      },
      
      async handleCompareChange() {
        // Clear single commit selection when using radio buttons
        this.selectedCommit = null;
        
        // When two commits are selected, show the "to" commit version
        if (this.fromCommit && this.toCommit) {
          if (this.currentFile) {
            await this.showFileAtCommit(this.currentFile, this.toCommit);
          } else {
            // Show any file when no file selected but comparing
            await this.displayAnyFileFromCommit(this.toCommit);
          }
        }
        
        this.updateUrls();
      },
      
      // URL management
      updateUrls() {
        const urls = [];
        
        if (this.hasValidSelection) {
          const repoPath = this.currentRepo;
          const filePath = this.currentFile;
          const commitSha = this.selectedCommit;
          
          urls.push({
            label: 'GitHub (Latest)',
            value: `https://github.com/${repoPath}/blob/${this.defaultBranch}/${filePath}`
          });
          urls.push({
            label: 'GitHub (Selected Commit)',
            value: `https://github.com/${repoPath}/blob/${commitSha}/${filePath}`
          });
          urls.push({
            label: 'JSDelivr CDN (Latest)',
            value: `https://cdn.jsdelivr.net/gh/${repoPath}/${filePath}`
          });
          urls.push({
            label: 'JSDelivr CDN (Selected Commit)',
            value: `https://cdn.jsdelivr.net/gh/${repoPath}@${commitSha}/${filePath}`
          });
        }
        
        // Update or create CopyBox component
        if (typeof CopyBox !== 'undefined') {
          if (this.urlCopyBox) {
            this.urlCopyBox.setValues(urls);
          } else {
            this.urlCopyBox = new CopyBox(`#url-copybox-${componentId}`, {
              values: urls,
              columns: 1,
              cardClass: 'w-full bg-transparent',
              inputClass: 'input input-bordered input-sm join-item flex-1 font-mono text-xs',
              buttonClass: 'btn btn-sm join-item',
              statusCardClass: 'card bg-base-200 shadow-sm p-4 mt-6',
              noCopyText: 'No URL copied yet',
              lastCopyLabel: 'Copied:'
            });
          }
        }
      }
    };
  }
  
  mount() {
    const target = document.querySelector(this.selector);
    if (!target) {
      console.error(`RepositoryViewer: Target element "${this.selector}" not found`);
      return false;
    }
    
    // Set the HTML
    target.innerHTML = this.html;
    
    // Make the data available globally for Alpine
    window[`repositoryViewerData_${this.id}`] = this.data;
    
    return true;
  }
  
  // Public API methods
  setRepository(repository) {
    const data = window[`repositoryViewerData_${this.id}`];
    if (data) {
      data.currentRepo = repository;
      this.options.repository = repository;
    }
  }
  
  setData(newData) {
    const data = window[`repositoryViewerData_${this.id}`];
    if (data) {
      data.loadInitialData(newData);
    }
  }
  
  getCurrentFile() {
    const data = window[`repositoryViewerData_${this.id}`];
    return data ? data.currentFile : null;
  }
  
  getCurrentCommit() {
    const data = window[`repositoryViewerData_${this.id}`];
    return data ? data.selectedCommit : null;
  }
  
  // Destroy the component and clean up
  destroy() {
    const target = document.querySelector(this.selector);
    if (target) {
      target.innerHTML = '';
    }
    delete window[`repositoryViewerData_${this.id}`];
  }
  
  // Update component options
  update(newOptions) {
    this.options = { ...this.options, ...newOptions };
    this.mount(); // Re-mount with new options
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RepositoryViewer;
}

// Also make available globally
if (typeof window !== 'undefined') {
  window.RepositoryViewer = RepositoryViewer;
}