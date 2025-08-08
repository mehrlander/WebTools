({
  name: 'GitHub',
  
  async init() {
    console.log('Initializing GitHub module...');
    
    // Move all GitHub-related methods from main HTML to here
    this.autoFetchLatestCommit = autoFetchLatestCommit;
    this.loadExtensions = loadExtensions;
    this.loadSpecificScripts = loadSpecificScripts;
    this.loadSingleScript = loadSingleScript;
    this.loadEditor = loadEditor;
    this.validateExtension = validateExtension;
    this.getLatestCommit = getLatestCommit;
    this.useLatestCommit = useLatestCommit;
    this.checkIfUsingLatest = checkIfUsingLatest;
    this.updateCommitAndRefresh = updateCommitAndRefresh;
    
    // Initialize GitHub-related state if needed
    if (!this.latestCommitHash) this.latestCommitHash = '';
    
    console.log('GitHub module initialized');
    
    // Implementation functions (all moved from main HTML)
    async function autoFetchLatestCommit() {
      if (this.cfg.github.repoVersion) {
        console.log(`Using saved commit: ${this.cfg.github.repoVersion.substring(0, 8)}...`);
        this.commitStatus = 'Using saved config';
        this.isUsingLatest = false;
        return;
      }
      
      try {
        console.log('Fetching latest commit from GitHub...');
        this.commitStatus = 'Fetching latest...';
        const headers = {};
        if (this.cfg.github?.apiKey) {
          headers['Authorization'] = `token ${this.cfg.github.apiKey}`;
        }
        
        const res = await fetch('https://api.github.com/repos/mehrlander/WebTools/commits/main', { headers });
        if (!res.ok) {
          throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
        }
        
        const commit = await res.json();
        this.cfg.github.repoVersion = commit.sha;
        this.latestCommitHash = commit.sha;
        this.commitStatus = 'Using latest';
        this.isUsingLatest = true;
        console.log(`Successfully fetched latest commit: ${commit.sha.substring(0, 8)}... (${commit.commit.message.split('\n')[0]})`);
      } catch (e) {
        console.warn(`Failed to fetch latest commit: ${e.message}. Will load extensions from main branch without hash.`);
        this.cfg.github.repoVersion = 'main';
        this.commitStatus = 'Using main branch';
        this.isUsingLatest = true;
      }
    }
    
    async function loadExtensions(folder, target) {
      try {
        const headers = {};
        if (this.cfg.github?.apiKey) {
          headers['Authorization'] = `token ${this.cfg.github.apiKey}`;
        }
        
        const baseUrl = 'https://api.github.com/repos/mehrlander/WebTools/contents';
        const url = this.cfg.github?.repoVersion && this.cfg.github.repoVersion !== 'main'
          ? `${baseUrl}/${folder}?ref=${this.cfg.github.repoVersion}`
          : `${baseUrl}/${folder}`;
        
        const res = await fetch(url, { headers });
        if (!res.ok) {
          console.warn(`GitHub API returned ${res.status} for ${folder}`);
          return;
        }
        
        const files = await res.json();
        await Promise.all(
          files
            .filter(f => f.name.endsWith('.js') && f.name !== 'ItemEditor.js')
            .map(async f => {
              try {
                const code = await (await fetch(f.download_url)).text();
                const config = eval(`(${code})`);
                
                if (!this.validateExtension(config, target, f.name)) return;
                
                this.ext[target].push(config);
                console.log(`Loaded ${target}: ${f.name}`);
                await config.init?.call(this);
                
              } catch (e) {
                console.error(`Error loading ${f.name}:`, e.message);
              }
            })
        );
      } catch (e) {
        console.warn(`Error accessing GitHub ${folder}:`, e.message);
      }
    }
    
    async function loadSpecificScripts(scriptNames) {
      const toLoad = scriptNames.filter(name => !this.ext.loadedScripts.has(name));
      if (!toLoad.length) return;
      
      for (const name of toLoad) {
        await this.loadSingleScript(name);
        this.ext.loadedScripts.add(name);
      }
    }
    
    async function loadSingleScript(scriptName) {
      try {
        const headers = {};
        if (this.cfg.github?.apiKey) {
          headers['Authorization'] = `token ${this.cfg.github.apiKey}`;
        }
        
        const baseUrl = 'https://api.github.com/repos/mehrlander/WebTools/contents/AppScripts';
        const url = this.cfg.github?.repoVersion 
          ? `${baseUrl}/${scriptName}.js?ref=${this.cfg.github.repoVersion}`
          : `${baseUrl}/${scriptName}.js`;
        
        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`Failed to fetch ${scriptName}: ${res.status}`);
        }
        
        const file = await res.json();
        const code = await (await fetch(file.download_url)).text();
        
        const config = eval(`(${code})`);
        if (!this.validateExtension(config, 'scripts', `${scriptName}.js`)) {
          throw new Error(`Invalid script structure: ${scriptName}`);
        }
        
        this.ext.scripts.push(config);
        console.log(`Loaded script: ${scriptName}`);
        
        await config.init?.call(this);
        
      } catch (error) {
        console.error(`Error loading script ${scriptName}:`, error);
        throw error;
      }
    }
    
    async function loadEditor() {
      try {
        const headers = {};
        if (this.cfg.github?.apiKey) {
          headers['Authorization'] = `token ${this.cfg.github.apiKey}`;
        }
        
        const baseUrl = 'https://api.github.com/repos/mehrlander/WebTools/contents/AppModals/ItemEditor.js';
        const url = this.cfg.github?.repoVersion && this.cfg.github.repoVersion !== 'main'
          ? `${baseUrl}?ref=${this.cfg.github.repoVersion}`
          : baseUrl;
        
        const res = await fetch(url, { headers });
        if (res.ok) {
          const file = await res.json();
          const code = await (await fetch(file.download_url)).text();
          
          this.ext.editor = eval(`(${code})`);
          if (!this.validateExtension(this.ext.editor, 'tabs', 'ItemEditor.js')) {
            throw new Error('Editor missing required properties');
          }
          console.log('Loaded ItemEditor.js');
          await this.ext.editor.init?.call(this);
        }
      } catch (e) {
        console.error('Failed to load editor:', e.message);
        this.ext.editor = {
          name: 'Editor',
          content: () => '<div class="p-6">Editor not found. Add ItemEditor.js to AppModals folder on GitHub.</div>'
        };
      }
    }
    
    function validateExtension(config, target, filename) {
      const rules = this.validators[target];
      if (!rules) return true;
      
      const missing = [
        ...rules.required.filter(prop => !config[prop]),
        ...rules.functions.filter(fn => typeof config[fn] !== 'function')
      ];
      
      if (missing.length) {
        console.error(`${filename} missing required properties: ${missing.join(', ')}`);
        return false;
      }
      return true;
    }
    
    async function getLatestCommit() {
      try {
        this.commitStatus = 'Fetching latest...';
        const res = await fetch('https://api.github.com/repos/mehrlander/WebTools/commits/main');
        const commit = await res.json();
        this.cfg.github.repoVersion = commit.sha;
        this.latestCommitHash = commit.sha;
        this.commitStatus = 'Got latest';
        this.isUsingLatest = true;
      } catch (e) {
        this.commitStatus = 'Fetch failed';
      }
    }
    
    async function useLatestCommit() {
      if (this.saveConfig) {
        this.cfg.github.repoVersion = '';
        await this.saveConfig();
      }
      window.location.reload();
    }
    
    function checkIfUsingLatest() {
      if (this.latestCommitHash && this.cfg.github.repoVersion === this.latestCommitHash) {
        this.commitStatus = 'Using latest';
        this.isUsingLatest = true;
      } else {
        this.commitStatus = 'Custom commit';
        this.isUsingLatest = false;
      }
    }
    
    async function updateCommitAndRefresh() {
      if (this.saveConfig) {
        await this.saveConfig();
      }
      window.location.reload();
    }
  }
})