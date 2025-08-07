({
  name: 'Main',
  version: '1.0.0',
  
  async init() {
    console.log('Initializing Main module...');
    
    // Add full application methods to the Alpine instance
    Object.assign(this, {
      db: null,
      mainReady: false,
      
      // Database initialization
      async initDB() {
        this.db = new Dexie('DataJarDB');
        
        this.db.version(1).stores({
          items: '++id, name, type, code, autorun, *tags, notes'
        });
        
        this.db.version(2).stores({
          items: '++id, name, type, code, autorun, *tags, notes',
          config: 'key'
        });
        
        // Add hooks for timestamps
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
      
      // Load configuration
      async loadConfig() {
        try {
          const savedConfig = await this.db.config.get('github');
          if (savedConfig && savedConfig.value) {
            // Merge saved config with current (preserving API key from HTML)
            this.cfg.github = { ...this.cfg.github, ...savedConfig.value };
            console.log('✓ Configuration loaded');
          }
        } catch (error) {
          console.warn('Could not load saved config:', error);
        }
      },
      
      // Save configuration
      async saveConfig() {
        try {
          await this.db.config.put({
            key: 'github',
            value: {
              repoVersion: this.cfg.github.repoVersion
              // Don't save API key to database
            }
          });
          console.log('✓ Configuration saved');
        } catch (error) {
          console.error('Failed to save config:', error);
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
          console.error('Failed to load items:', error);
          this.items = [];
        }
      },
      
      // Execute autorun items
      executeAutorunItems() {
        const autorunItems = this.items.filter(item => item.autorun);
        autorunItems.forEach(item => {
          console.log(`Autorun: ${item.name}`);
          this.executeItem(item);
        });
      },
      
      // Enhanced execute item
      executeItem(item) {
        try {
          const handlers = {
            js: () => Function(item.code)(),
            html: () => {
              const w = window.open('', '_blank', 'width=600,height=400');
              w.document.write(item.code);
              w.document.close();
            },
            json: () => {
              window[item.name] = JSON.parse(item.code);
              console.log(`JSON loaded to window.${item.name}`);
            },
            text: () => {
              console.log(`Text content: ${item.name}\n${item.code}`);
            }
          };
          
          const handler = handlers[item.type];
          if (handler) {
            handler();
            console.log(`✓ Executed: ${item.name}`);
          } else {
            console.warn(`Unknown item type: ${item.type}`);
          }
        } catch (error) {
          console.error(`Error executing ${item.name}:`, error);
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
        this.activeTab = 0;
        
        // Load editor if not already loaded
        if (!this.ext.editor) {
          this.loadEditor();
        }
      },
      
      // Save item to database
      async saveItem() {
        if (!this.editingItem?.name) {
          console.warn('Cannot save: item name is required');
          return;
        }
        
        const data = {
          ...this.editingItem,
          tags: this.editingItem.tags
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
        };
        
        try {
          if (data.id) {
            await this.db.items.update(data.id, data);
            console.log(`✓ Updated: ${data.name}`);
          } else {
            delete data.id;
            const id = await this.db.items.add(data);
            console.log(`✓ Created: ${data.name} (ID: ${id})`);
          }
          
          await this.loadItems();
          this.editingItem = null;
        } catch (error) {
          console.error('Failed to save item:', error);
          alert('Failed to save item: ' + error.message);
        }
      },
      
      // Delete item from database
      async deleteItem() {
        if (!this.editingItem?.id) return;
        
        if (confirm(`Delete "${this.editingItem.name}"?`)) {
          try {
            await this.db.items.delete(this.editingItem.id);
            console.log(`✓ Deleted: ${this.editingItem.name}`);
            await this.loadItems();
            this.editingItem = null;
          } catch (error) {
            console.error('Failed to delete item:', error);
          }
        }
      },
      
      // Cancel editing
      cancelEdit() {
        this.editingItem = null;
        this.activeTab = 0;
      },
      
      // Run current code being edited
      runCurrentCode() {
        if (this.editingItem) {
          this.executeItem({ ...this.editingItem });
        }
      },
      
      // Get placeholder text for editor
      getPlaceholderText(type) {
        const placeholders = {
          js: 'Enter your JavaScript code here...',
          html: 'Enter your HTML content here...',
          json: 'Enter valid JSON data here...',
          text: 'Enter your text content here...'
        };
        return placeholders[type] || 'Enter your code here...';
      },
      
      // Load the editor module
      async loadEditor() {
        try {
          const editorCode = await this.loadGitHubFile('AppModals/ItemEditor.js');
          if (editorCode) {
            this.ext.editor = eval(`(${editorCode})`);
            if (this.ext.editor.init) {
              await this.ext.editor.init.call(this);
            }
            console.log('✓ Editor loaded');
          }
        } catch (error) {
          console.error('Failed to load editor:', error);
          
          // Fallback editor
          this.ext.editor = {
            name: 'Editor',
            icon: 'ph ph-pencil',
            content() {
              return `
                <div class="h-full p-6 flex flex-col">
                  <div class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold">
                      ${this.editingItem?.id ? 'Edit Item' : 'Add New Item'}
                    </h1>
                    <div class="flex gap-2">
                      <button class="btn" @click="cancelEdit()">Cancel</button>
                      <button class="btn btn-primary" @click="saveItem()">Save</button>
                      <template x-if="editingItem?.id">
                        <button class="btn btn-error" @click="deleteItem()">Delete</button>
                      </template>
                    </div>
                  </div>
                  
                  <template x-if="editingItem">
                    <div class="flex-1 flex flex-col gap-4">
                      <input type="text" x-model="editingItem.name" 
                             class="input input-bordered w-full" 
                             placeholder="Item name" required>
                      
                      <div class="flex gap-4 items-center">
                        <select x-model="editingItem.type" class="select select-bordered">
                          <option value="js">JavaScript</option>
                          <option value="html">HTML</option>
                          <option value="json">JSON</option>
                          <option value="text">Text</option>
                        </select>
                        
                        <label class="label cursor-pointer">
                          <input type="checkbox" x-model="editingItem.autorun" 
                                 class="checkbox checkbox-primary mr-2">
                          <span>Autorun on load</span>
                        </label>
                        
                        <button class="btn btn-ghost ml-auto" @click="runCurrentCode()">
                          <i class="ph ph-play-circle text-xl"></i> Run
                        </button>
                      </div>
                      
                      <input type="text" x-model="editingItem.tags" 
                             class="input input-bordered w-full" 
                             placeholder="Tags (comma-separated)">
                      
                      <textarea x-model="editingItem.notes" 
                                class="textarea textarea-bordered w-full h-24" 
                                placeholder="Notes (optional)"></textarea>
                      
                      <textarea x-model="editingItem.code" 
                                class="flex-1 p-3 font-mono text-sm border rounded bg-base-100 resize-none" 
                                :placeholder="getPlaceholderText(editingItem.type)"></textarea>
                    </div>
                  </template>
                </div>
              `;
            }
          };
        }
      }
    });
    
    // Now initialize the database and load data
    try {
      await this.initDB();
      await this.loadConfig();
      await this.loadItems();
      
      this.mainReady = true;
      console.log('✓ Main module ready');
      
      // Load extensions now that main is ready
      await Promise.all([
        this.loadExtensions('AppButtons', 'buttons'),
        this.loadExtensions('AppTabs', 'tabs')
      ]);
      
    } catch (error) {
      console.error('Main module initialization failed:', error);
      throw error;
    }
  }
})