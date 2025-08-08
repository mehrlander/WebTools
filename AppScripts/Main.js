({
  name: 'Main',
  version: '1.0.0',
  description: 'Core Data Jar functionality - database, item management, and execution',
  
  async init() {
    console.log('Initializing Main module...');
    
    // Explicitly check for Dexie and get it from window if needed
    let DexieLib = typeof Dexie !== 'undefined' ? Dexie : window.Dexie;
    
    if (!DexieLib) {
      console.error('Dexie is not available in any context!');
      console.log('Checking window object:', {
        windowDexie: typeof window.Dexie,
        globalDexie: typeof Dexie,
        windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('dexie'))
      });
      throw new Error('Dexie library not loaded - cannot initialize database');
    }
    
    console.log('✓ Dexie found:', typeof DexieLib, 'from', typeof Dexie !== 'undefined' ? 'global' : 'window');
    
    // Enhance the Alpine instance with full functionality
    Object.assign(this, {
      db: null,
      DexieLib: DexieLib, // Store Dexie reference
      
      // Database initialization
      async initDB() {
        console.log('Initializing database with Dexie...');
        this.db = new this.DexieLib('DataJarDB');
        
        // Version 1: Basic items table
        this.db.version(1).stores({
          items: '++id, name, type, code, autorun, *tags, notes'
        });
        
        // Version 2: Add config store
        this.db.version(2).stores({
          items: '++id, name, type, code, autorun, *tags, notes',
          config: 'key'
        });
        
        // Hooks for timestamps
        this.db.items.hook('creating', (primKey, obj) => {
          obj.createdAt = new Date();
          obj.tags = obj.tags || [];
          obj.type = obj.type || 'js';
        });
        
        this.db.items.hook('updating', (modifications) => {
          modifications.updatedAt = new Date();
        });
        
        await this.db.open();
        console.log('✓ Database initialized');
      },
      
      // Load configuration from database
      async loadConfig() {
        try {
          const savedTypes = await this.db.config.get('types');
          if (savedTypes) {
            this.cfg.types = savedTypes.value;
            console.log('✓ Loaded saved type configuration');
          } else {
            // Initialize with defaults
            this.cfg.types = {
              js: { label: 'JavaScript', badge: 'badge-primary', exec: true },
              html: { label: 'HTML', badge: 'badge-secondary', exec: true },
              json: { label: 'JSON', badge: 'badge-accent', exec: true },
              text: { label: 'Text', badge: 'badge-neutral', exec: false }
            };
          }
          
          // Load GitHub config
          const savedGithub = await this.db.config.get('github');
          if (savedGithub && savedGithub.value.repoVersion) {
            this.cfg.github.repoVersion = savedGithub.value.repoVersion;
            console.log(`✓ Loaded saved commit: ${this.cfg.github.repoVersion.substring(0, 8)}...`);
          }
        } catch (error) {
          console.error('Error loading config:', error);
        }
      },
      
      // Save configuration to database
      async saveConfig() {
        try {
          await this.db.config.put({ 
            key: 'types', 
            value: this.cfg.types 
          });
          
          await this.db.config.put({
            key: 'github',
            value: {
              repoVersion: this.cfg.github.repoVersion
            }
          });
          
          console.log('✓ Configuration saved');
        } catch (error) {
          console.error('Error saving config:', error);
        }
      },
      
      // Load items from database
      async loadItems() {
        try {
          this.items = await this.db.items.orderBy('name').toArray();
          console.log(`✓ Loaded ${this.items.length} items`);
          
          // Execute autorun items
          this.executeAutorunItems();
        } catch (error) {
          console.error('Error loading items:', error);
          this.items = [];
        }
      },
      
      // Execute autorun items
      executeAutorunItems() {
        const autorunItems = this.items.filter(i => i.autorun && this.cfg.types[i.type]?.exec);
        autorunItems.forEach(item => {
          console.log(`Autorun: ${item.name}`);
          this.executeItem(item);
        });
      },
      
      // Enhanced item execution
      executeItem(item) {
        try {
          const handlers = {
            js: () => {
              const result = Function(item.code)();
              console.log(`✓ Executed JS: ${item.name}`);
              return result;
            },
            
            html: () => {
              const w = window.open('', '_blank', 'width=600,height=400');
              w.document.write(item.code);
              w.document.close();
              console.log(`✓ Opened HTML: ${item.name}`);
            },
            
            json: () => {
              const data = JSON.parse(item.code);
              window[item.name] = data;
              console.log(`✓ Loaded JSON into window.${item.name}`);
              
              // Show JSON in modal
              const modal = document.createElement('div');
              modal.className = 'modal modal-open';
              modal.innerHTML = `
                <div class="modal-box max-w-4xl">
                  <h3 class="font-bold text-lg mb-4">${this.escapeHtml(item.name)} - JSON Viewer</h3>
                  <pre class="bg-base-200 p-4 rounded-lg overflow-auto max-h-96">${this.escapeHtml(JSON.stringify(data, null, 2))}</pre>
                  <div class="modal-action">
                    <button class="btn" onclick="this.closest('.modal').remove()">Close</button>
                  </div>
                </div>
                <form method="dialog" class="modal-backdrop">
                  <button type="button" onclick="this.closest('.modal').remove()">close</button>
                </form>
              `;
              document.body.appendChild(modal);
            },
            
            text: () => {
              // Show text in modal
              const modal = document.createElement('div');
              modal.className = 'modal modal-open';
              modal.innerHTML = `
                <div class="modal-box max-w-4xl">
                  <h3 class="font-bold text-lg mb-4">${this.escapeHtml(item.name)} - Text Viewer</h3>
                  <div class="bg-base-200 p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">${this.escapeHtml(item.code)}</div>
                  <div class="modal-action">
                    <button class="btn" onclick="this.closest('.modal').remove()">Close</button>
                  </div>
                </div>
                <form method="dialog" class="modal-backdrop">
                  <button type="button" onclick="this.closest('.modal').remove()">close</button>
                </form>
              `;
              document.body.appendChild(modal);
            }
          };
          
          if (handlers[item.type]) {
            return handlers[item.type]();
          } else {
            console.warn(`Unknown item type: ${item.type}`);
          }
        } catch (error) {
          console.error(`Error executing ${item.name}:`, error.message);
          
          // Show error notification
          const notification = document.createElement('div');
          notification.className = 'toast toast-top toast-end';
          notification.innerHTML = `
            <div class="alert alert-error">
              <span>Error in ${item.name}: ${error.message}</span>
            </div>
          `;
          document.body.appendChild(notification);
          setTimeout(() => notification.remove(), 5000);
        }
      },
      
      // Edit item (prepare for editor)
      editItem(item = null) {
        this.editingItem = item ? {
          ...item,
          tags: Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '')
        } : {
          name: '',
          type: 'js',
          autorun: false,
          tags: '',
          notes: '',
          code: ''
        };
        
        // Switch to editor tab if available
        if (this.ext.editor) {
          this.activeTab = 0; // Editor will be first after console
        }
      },
      
      // Save item to database
      async saveItem() {
        if (!this.editingItem?.name) {
          alert('Item name is required');
          return;
        }
        
        try {
          const data = {
            ...this.editingItem,
            tags: this.editingItem.tags
              .split(',')
              .map(t => t.trim())
              .filter(Boolean)
          };
          
          if (data.id) {
            await this.db.items.update(data.id, data);
            console.log(`✓ Updated item: ${data.name}`);
          } else {
            const id = await this.db.items.add(data);
            console.log(`✓ Created item: ${data.name} (ID: ${id})`);
          }
          
          await this.loadItems();
          this.editingItem = null;
          this.activeTab = 0; // Back to console
          
        } catch (error) {
          console.error('Error saving item:', error);
          alert(`Failed to save item: ${error.message}`);
        }
      },
      
      // Delete item from database
      async deleteItem() {
        if (!this.editingItem?.id) return;
        
        if (!confirm(`Delete "${this.editingItem.name}"?`)) return;
        
        try {
          await this.db.items.delete(this.editingItem.id);
          console.log(`✓ Deleted item: ${this.editingItem.name}`);
          
          await this.loadItems();
          this.editingItem = null;
          this.activeTab = 0; // Back to console
          
        } catch (error) {
          console.error('Error deleting item:', error);
          alert(`Failed to delete item: ${error.message}`);
        }
      },
      
      // Cancel editing
      cancelEdit() {
        this.editingItem = null;
        this.activeTab = 0; // Back to console
      },
      
      // Run current code being edited
      runCurrentCode() {
        if (!this.editingItem) return;
        
        const tempItem = {
          ...this.editingItem,
          name: this.editingItem.name || 'Untitled'
        };
        
        console.log(`Running: ${tempItem.name}`);
        this.executeItem(tempItem);
      },
      
      // Get placeholder text for editor
      getPlaceholderText(type) {
        const placeholders = {
          js: 'Enter your JavaScript code here...\n\n// Example:\nconsole.log("Hello, World!");',
          html: 'Enter your HTML content here...\n\n<!-- Example -->\n<h1>Hello, World!</h1>',
          json: 'Enter valid JSON data here...\n\n{\n  "example": "data"\n}',
          text: 'Enter your text content here...'
        };
        return placeholders[type] || placeholders.js;
      },
      
      // Helper: Escape HTML for safe display
      escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      },
      
      // Export/Import functionality
      async exportData() {
        try {
          const data = {
            version: '1.0',
            exported: new Date().toISOString(),
            items: await this.db.items.toArray(),
            config: {
              types: this.cfg.types
            }
          };
          
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `data-jar-export-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          
          console.log('✓ Data exported successfully');
        } catch (error) {
          console.error('Export failed:', error);
        }
      },
      
      async importData(jsonData) {
        try {
          const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
          
          if (!data.items || !Array.isArray(data.items)) {
            throw new Error('Invalid import data structure');
          }
          
          // Clear existing data
          await this.db.items.clear();
          
          // Import items
          for (const item of data.items) {
            delete item.id; // Remove IDs to let database generate new ones
            await this.db.items.add(item);
          }
          
          // Import config if present
          if (data.config?.types) {
            this.cfg.types = data.config.types;
            await this.saveConfig();
          }
          
          await this.loadItems();
          console.log(`✓ Imported ${data.items.length} items`);
          
        } catch (error) {
          console.error('Import failed:', error);
          alert(`Import failed: ${error.message}`);
        }
      }
    });
    
    // Initialize the database and load data
    try {
      await this.initDB();
      await this.loadConfig();
      await this.loadItems();
      
      console.log('✓ Main module fully initialized');
      return true;
      
    } catch (error) {
      console.error('Main module initialization failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error;
    }
  }
})