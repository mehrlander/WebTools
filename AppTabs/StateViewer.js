{
  name: 'State Viewer',
  icon: 'ph ph-code',
  // Removed: requires: ['JsonEditor'],
  
  init() {
    // Initialize state viewer properties
    this.stateViewerMode = 'all';
    this.jsonEditor = null;
    this.stateDataModified = false;
    this.currentStateData = null;
    
    // Add methods to the Alpine component
    this.initStateViewer = async () => {
      // Load the JSON editor library if not already loaded
      if (!window.DataJarLibs?.createJSONEditor) {
        console.log('Loading JSON Editor library...');
        try {
          const module = await import('https://unpkg.com/vanilla-jsoneditor@latest/standalone.js');
          if (!window.DataJarLibs) window.DataJarLibs = {};
          window.DataJarLibs.createJSONEditor = module.createJSONEditor;
          console.log('JSON Editor library loaded successfully');
        } catch (error) {
          console.error('Failed to load JSON Editor:', error);
          return;
        }
      }
      
      const container = document.getElementById('json-editor');
      if (container && !this.jsonEditor && window.DataJarLibs?.createJSONEditor) {
        try {
          this.jsonEditor = window.DataJarLibs.createJSONEditor({
            target: container,
            props: {
              mode: 'text',
              mainMenuBar: false,
              navigationBar: true,
              readOnly: false,
              onChange: (content) => {
                try {
                  const newData = content.json;
                  const currentData = this.currentStateData;
                  this.stateDataModified = JSON.stringify(newData) !== JSON.stringify(currentData);
                } catch (e) {
                  this.stateDataModified = true;
                }
              }
            }
          });
          await this.loadStateData();
        } catch (error) {
          console.error('Error initializing JSON editor:', error);
        }
      }
    };
    
    this.loadStateData = async () => {
      if (!this.jsonEditor) return;
      
      let data = {};
      
      try {
        switch (this.stateViewerMode) {
          case 'items':
            data = await this.db.items.toArray();
            break;
            
          case 'extensions':
            // Use already loaded extension data
            data = {
              scripts: this.ext.scripts.map(s => ({
                name: s.name,
                hasInit: !!s.init
              })),
              tabs: this.ext.tabs.map(t => ({
                name: t.name,
                icon: t.icon,
                hasInit: !!t.init,
                requires: t.requires || []
              })),
              buttons: this.ext.buttons.slice(1).map(b => ({
                className: b.className,
                innerHTML: b.innerHTML.replace(/<[^>]*>/g, '') // Strip HTML tags
              }))
            };
            break;
            
          case 'config':
            data = this.cfg;
            break;
            
          case 'all':
          default:
            data = {
              items: await this.db.items.toArray(),
              config: this.cfg,
              extensions: {
                scripts: this.ext.scripts.map(s => s.name),
                tabs: this.ext.tabs.map(t => t.name),
                buttons: this.ext.buttons.length - 1
              },
              database: {
                name: 'DataJarDB',
                version: this.db.verno
              }
            };
        }
        
        this.currentStateData = JSON.parse(JSON.stringify(data));
        this.stateDataModified = false;
        this.jsonEditor.set({ json: data });
      } catch (error) {
        console.error('Error loading state data:', error);
        this.jsonEditor.set({ 
          json: { 
            error: 'Failed to load state data', 
            message: error.message 
          } 
        });
      }
    };
    
    this.saveStateData = async () => {
      if (!this.jsonEditor || !this.stateDataModified) return;
      
      try {
        const content = this.jsonEditor.get();
        const data = content.json;
        
        switch (this.stateViewerMode) {
          case 'items':
            if (Array.isArray(data)) {
              // Validate items
              const errors = [];
              data.forEach((item, i) => {
                if (!item.name || !item.type) {
                  errors.push(`Item ${i}: missing required fields`);
                }
                if (item.type && !this.cfg.types[item.type]) {
                  errors.push(`Item ${i}: invalid type "${item.type}"`);
                }
              });
              
              if (errors.length) {
                alert('Validation errors:\n' + errors.join('\n'));
                return;
              }
              
              await this.db.items.clear();
              for (const item of data) {
                // Ensure tags are arrays
                if (item.tags && typeof item.tags === 'string') {
                  item.tags = item.tags.split(',').map(t => t.trim()).filter(Boolean);
                }
                
                if (item.id) {
                  await this.db.items.put(item);
                } else {
                  await this.db.items.add(item);
                }
              }
              await this.loadItems();
            }
            break;
            
          case 'config':
            // Validate config
            if (!data.types || typeof data.types !== 'object') {
              alert('Invalid config: types must be an object');
              return;
            }
            
            this.cfg = data;
            break;
            
          case 'all':
            // Handle saving all data
            if (data.items && Array.isArray(data.items)) {
              await this.db.items.clear();
              for (const item of data.items) {
                if (item.tags && typeof item.tags === 'string') {
                  item.tags = item.tags.split(',').map(t => t.trim()).filter(Boolean);
                }
                
                if (item.id) {
                  await this.db.items.put(item);
                } else {
                  await this.db.items.add(item);
                }
              }
              await this.loadItems();
            }
            
            if (data.config) {
              this.cfg = data.config;
            }
            break;
            
          case 'extensions':
            alert('Extensions cannot be modified - they are loaded from GitHub');
            await this.loadStateData();
            return;
        }
        
        this.stateDataModified = false;
        this.currentStateData = JSON.parse(JSON.stringify(data));
        
        // Show success feedback
        const btn = event.target;
        if (btn) {
          const originalHTML = btn.innerHTML;
          btn.innerHTML = '<i class="ph ph-check"></i> Saved!';
          btn.classList.add('btn-success');
          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('btn-success');
          }, 2000);
        }
        
      } catch (error) {
        console.error('Error saving state data:', error);
        alert('Error saving data: ' + error.message);
      }
    };
    
    // Watch for tab changes to initialize editor when shown
    this.$watch('activeTab', (newTab) => {
      if (newTab === this.ext.tabs.findIndex(t => t.name === 'State Viewer') && !this.jsonEditor) {
        this.$nextTick(() => {
          setTimeout(() => this.initStateViewer(), 100);
        });
      }
    });
  },
  
  content() {
    return `
      <div class="h-full flex flex-col p-4">
        <div class="flex gap-2 mb-4">
          <button @click="loadStateData()" class="btn btn-sm btn-primary">
            <i class="ph ph-arrows-clockwise"></i> Refresh
          </button>
          <button @click="saveStateData()" class="btn btn-sm btn-success" :disabled="!stateDataModified">
            <i class="ph ph-floppy-disk"></i> Save Changes
          </button>
          <select x-model="stateViewerMode" @change="loadStateData()" class="select select-sm select-bordered">
            <option value="all">All Data</option>
            <option value="items">Items</option>
            <option value="extensions">Loaded Extensions</option>
            <option value="config">Configuration</option>
          </select>
          <div x-show="stateDataModified" class="badge badge-warning">Modified</div>
        </div>
        <div id="json-editor" class="flex-1 border border-base-300 rounded-lg"></div>
      </div>
    `;
  }
}