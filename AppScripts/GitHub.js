({
  name: 'GitHub',
  version: '1.0.0',
  
  init() {
    console.log('Initializing GitHub module...');
    
    // Create a GitHub API interface
    this.github = {
      // Configuration
      config: {
        apiKey: this.cfg?.github?.apiKey || '',
        repo: 'mehrlander/WebTools',
        commitHash: this.cfg?.github?.repoVersion || '',
        useCache: true,
        cache: new Map(),
        cacheTTL: 5 * 60 * 1000 // 5 minutes
      },
      
      // Set API key after initialization
      setApiKey(key) {
        this.config.apiKey = key;
        console.log('GitHub API key updated');
      },
      
      // Set commit hash
      setCommitHash(hash) {
        this.config.commitHash = hash;
        this.config.cache.clear(); // Clear cache when commit changes
        console.log(`GitHub commit set to: ${hash ? hash.substring(0, 8) : 'latest'}...`);
      },
      
      // Get headers for API requests
      getHeaders() {
        const headers = {
          'Accept': 'application/vnd.github.v3+json'
        };
        if (this.config.apiKey) {
          headers['Authorization'] = `token ${this.config.apiKey}`;
        }
        return headers;
      },
      
      // Build API URL with optional ref
      buildUrl(path, includeRef = true) {
        const baseUrl = `https://api.github.com/repos/${this.config.repo}`;
        let url = `${baseUrl}/${path}`;
        
        if (includeRef && this.config.commitHash && this.config.commitHash !== 'main') {
          const separator = path.includes('?') ? '&' : '?';
          url += `${separator}ref=${this.config.commitHash}`;
        }
        
        return url;
      },
      
      // Generic API fetch with caching
      async fetch(path, options = {}) {
        const url = this.buildUrl(path, options.includeRef !== false);
        
        // Check cache
        if (this.config.useCache && options.cache !== false) {
          const cached = this.config.cache.get(url);
          if (cached && (Date.now() - cached.timestamp < this.config.cacheTTL)) {
            console.log(`Using cached data for: ${path}`);
            return cached.data;
          }
        }
        
        try {
          const response = await fetch(url, {
            ...options,
            headers: { ...this.getHeaders(), ...options.headers }
          });
          
          if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          
          // Cache the result
          if (this.config.useCache && options.cache !== false) {
            this.config.cache.set(url, {
              data,
              timestamp: Date.now()
            });
          }
          
          return data;
        } catch (error) {
          console.error(`GitHub API request failed for ${path}:`, error);
          throw error;
        }
      },
      
      // Get latest commit
      async getLatestCommit(branch = 'main') {
        try {
          const commit = await this.fetch(`commits/${branch}`, { 
            includeRef: false,
            cache: false  // Don't cache commit info
          });
          return {
            sha: commit.sha,
            message: commit.commit.message,
            author: commit.commit.author.name,
            date: commit.commit.author.date
          };
        } catch (error) {
          console.error('Failed to fetch latest commit:', error);
          return null;
        }
      },
      
      // List files in a directory
      async listFiles(path, filter = null) {
        try {
          const files = await this.fetch(`contents/${path}`);
          
          if (filter) {
            return files.filter(filter);
          }
          
          return files;
        } catch (error) {
          console.error(`Failed to list files in ${path}:`, error);
          return [];
        }
      },
      
      // Get file content
      async getFileContent(path) {
        try {
          const file = await this.fetch(`contents/${path}`);
          
          if (file.content) {
            // Base64 decode
            return atob(file.content);
          } else if (file.download_url) {
            // Fetch from download URL
            const response = await fetch(file.download_url);
            return await response.text();
          }
          
          throw new Error('No content available');
        } catch (error) {
          console.error(`Failed to get content for ${path}:`, error);
          return null;
        }
      },
      
      // Load and evaluate JavaScript files
      async loadScript(folder, filename) {
        try {
          const content = await this.getFileContent(`${folder}/${filename}`);
          if (!content) return null;
          
          const config = eval(`(${content})`);
          console.log(`Loaded ${folder}/${filename}`);
          return config;
        } catch (error) {
          console.error(`Failed to load script ${folder}/${filename}:`, error);
          return null;
        }
      },
      
      // Load multiple scripts from a folder
      async loadScriptsFromFolder(folder, options = {}) {
        const {
          filter = (f) => f.name.endsWith('.js'),
          exclude = [],
          processor = null,
          parallel = true
        } = options;
        
        try {
          const files = await this.listFiles(folder, f => {
            return filter(f) && !exclude.includes(f.name);
          });
          
          console.log(`Found ${files.length} scripts in ${folder}`);
          
          const loadFn = async (file) => {
            const script = await this.loadScript(folder, file.name);
            if (script && processor) {
              return processor(script, file.name);
            }
            return script;
          };
          
          if (parallel) {
            return await Promise.all(files.map(loadFn));
          } else {
            // Sequential loading
            const results = [];
            for (const file of files) {
              results.push(await loadFn(file));
            }
            return results;
          }
        } catch (error) {
          console.error(`Failed to load scripts from ${folder}:`, error);
          return [];
        }
      },
      
      // Load a single script by name
      async loadNamedScript(scriptName, folder = 'AppScripts') {
        try {
          const script = await this.loadScript(folder, `${scriptName}.js`);
          return script;
        } catch (error) {
          console.error(`Failed to load script ${scriptName}:`, error);
          return null;
        }
      },
      
      // Get repository info
      async getRepoInfo() {
        try {
          return await this.fetch('', { includeRef: false });
        } catch (error) {
          console.error('Failed to get repository info:', error);
          return null;
        }
      },
      
      // Get rate limit status
      async getRateLimit() {
        try {
          const response = await fetch('https://api.github.com/rate_limit', {
            headers: this.getHeaders()
          });
          return await response.json();
        } catch (error) {
          console.error('Failed to get rate limit:', error);
          return null;
        }
      },
      
      // Clear cache
      clearCache() {
        this.config.cache.clear();
        console.log('GitHub cache cleared');
      },
      
      // Utility: Check if using latest commit
      async isUsingLatest() {
        const latest = await this.getLatestCommit();
        if (!latest) return false;
        return this.config.commitHash === latest.sha;
      },
      
      // Utility: Get human-readable commit info
      getCommitInfo() {
        if (!this.config.commitHash) return 'Using main branch';
        if (this.config.commitHash === 'main') return 'Using main branch';
        return `Using commit: ${this.config.commitHash.substring(0, 8)}...`;
      }
    };
    
    // Make GitHub available globally on the Alpine instance
    this.GitHub = this.github;
    
    // Auto-set commit hash if available
    if (this.cfg?.github?.repoVersion) {
      this.github.setCommitHash(this.cfg.github.repoVersion);
    }
    
    // Auto-set API key if available
    if (this.cfg?.github?.apiKey) {
      this.github.setApiKey(this.cfg.github.apiKey);
    }
    
    console.log('GitHub module ready');
    return Promise.resolve();
  }
})