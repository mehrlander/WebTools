// AppScripts/Main.js
// Core functionality for Data Jar application
({
  name: 'Main',
  version: '1.0.0',
  
  async init() {
    console.log('Initializing Main module...');
    
    // Store reference to Alpine instance
    const app = this;
    
    // Initialize database
    app.db = null;
    
    // Define type configuration
    app.cfg.types = {
      js: { label: 'JavaScript', badge: 'badge-primary', exec: true },
      html: { label: 'HTML', badge: 'badge-secondary', exec: true },
      json: { label: 'JSON', badge: 'badge-accent', exec: true },
      text: { label: 'Text', badge: 'badge-neutral', exec: false }
    };
    
    // Initialize database
    app.initDB = async function() {
      try {
        app.db = new Dexie('DataJarDB');
        
        // Define schema
        app.db.version(1).stores({
          items: '++id, name, type, code, autorun, *tags, notes'
        });
        
        // Add hooks
        app.db.items.hook('creating', (primKey, obj) => {
          obj.createdAt = new Date();
          obj.tags = obj.tags || [];
          obj.type = obj.type || 'js';
        });
        
        app.db.items.hook('updating', (modifications) => {
          modifications.updatedAt = new Date();
        });
        
        await app.db.open();
        console.log('Database initialized');
      } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
      }
    };
    
    // Load items from database
    app.loadItems = async function() {
      try {
        app.items = await app.db.items.orderBy('name').toArray();
        console.log(`Loaded ${app.items.length} items`);
        
        // Execute autorun items
        app.executeAutorunItems();
      } catch (error) {
        console.error('Failed to load items:', error);
        app.items = [];
      }
    };
    
    // Execute autorun items
    app.executeAutorunItems = function() {
      const autorunItems = app.items.filter(item => 
        item.autorun && app.cfg.types[item.type]?.exec
      );
      
      autorunItems.forEach(item => {
        try {
          app.executeItem(item);
        } catch (error) {
          console.error(`Autorun failed for ${item.name}:`, error);
        }
      });
      
      if (autorunItems.length > 0) {
        console.log(`Executed ${autorunItems.length} autorun items`);
      }
    };
    
    // Execute an item based on its type
    app.executeItem = function(item) {
      if (!item || !item.type) {
        console.error('Invalid item', item);
        return;
      }
      
      const handlers = {
        js: () => {
          Function(item.code)();
        },
        html: () => {
          const w = window.open('', '_blank', 'width=600,height=400');
          w.document.write(item.code);
          w.document.close();
        },
        json: () => {
          try {
            const data = JSON.parse(item.code);
            window[item.name] = data;
            console.log(`JSON data stored in window.${item.name}`);
          } catch (e) {
            throw new Error(`Invalid JSON: ${e.message}`);
          }
        },
        text: () => {
          console.log(`Text content for ${item.name}:\n${item.code}`);
        }
      };
      
      try {
        const handler = handlers[item.type];
        if (handler) {
          handler();
          console.log(`Executed: ${item.name} (${item.type})`);
        } else {
          console.warn(`No handler for type: ${item.type}`);
        }
      } catch (error) {
        console.error(`Error executing ${item.name}:`, error.message);
        throw error;
      }
    };
    
    // Edit an item (prepare for editor)
    app.editItem = function(item = null) {
      if (item) {
        // Editing existing item
        app.editingItem = {
          ...item,
          tags: Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '')
        };
      } else {
        // Creating new item
        app.editingItem = {
          name: '',
          type: 'js',
          autorun: false,
          tags: '',
          notes: '',
          code: ''
        };
      }
      
      // Switch to editor tab if available
      if (app.ext.editor) {
        app.activeTab = 0;
      }
    };
    
    // Save item to database
    app.saveItem = async function() {
      if (!app.editingItem || !app.editingItem.name) {
        console.error('Cannot save: item name is required');
        return;
      }
      
      try {
        const data = {
          ...app.editingItem,
          tags: app.editingItem.tags
            ? app.editingItem.tags.split(',').map(t => t.trim()).filter(Boolean)
            : []
        };
        
        if (data.id) {
          // Update existing item
          await app.db.items.update(data.id, data);
          console.log(`Updated item: ${data.name}`);
        } else {
          // Add new item
          delete data.id; // Remove undefined id
          const id = await app.db.items.add(data);
          console.log(`Added new item: ${data.name} (id: ${id})`);
        }
        
        // Reload items and clear editor
        await app.loadItems();
        app.editingItem = null;
        
        // Return to main view
        app.activeTab = 0;
      } catch (error) {
        console.error('Failed to save item:', error);
        alert(`Failed to save: ${error.message}`);
      }
    };
    
    // Delete item from database
    app.deleteItem = async function() {
      if (!app.editingItem || !app.editingItem.id) {
        console.error('Cannot delete: no item selected');
        return;
      }
      
      if (!confirm(`Delete "${app.editingItem.name}"?`)) {
        return;
      }
      
      try {
        await app.db.items.delete(app.editingItem.id);
        console.log(`Deleted item: ${app.editingItem.name}`);
        
        // Reload items and clear editor
        await app.loadItems();
        app.editingItem = null;
        
        // Return to main view
        app.activeTab = 0;
      } catch (error) {
        console.error('Failed to delete item:', error);
        alert(`Failed to delete: ${error.message}`);
      }
    };
    
    // Cancel editing
    app.cancelEdit = function() {
      app.editingItem = null;
      app.activeTab = 0;
    };
    
    // Run current code in editor
    app.runCurrentCode = function() {
      if (!app.editingItem) {
        console.warn('No code to run');
        return;
      }
      
      try {
        app.executeItem({
          ...app.editingItem,
          name: app.editingItem.name || 'Untitled'
        });
      } catch (error) {
        console.error('Error running code:', error);
      }
    };
    
    // Get placeholder text for editor
    app.getPlaceholderText = function(type) {
      const placeholders = {
        js: 'Enter your JavaScript code here...',
        html: 'Enter your HTML content here...',
        json: 'Enter valid JSON data here...',
        text: 'Enter your text content here...'
      };
      return placeholders[type] || placeholders.js;
    };
    
    // Copy item code to clipboard
    app.copyItemCode = function(item) {
      if (!item || !item.code) {
        console.warn('No code to copy');
        return;
      }
      
      // Create temporary button for clipboard.js
      const btn = document.createElement('button');
      const clipboard = new ClipboardJS(btn, {
        text: () => item.code
      });
      
      clipboard.on('success', () => {
        app.copiedId = item.id;
        setTimeout(() => {
          app.copiedId = null;
        }, 1000);
        console.log(`Copied code for: ${item.name}`);
      });
      
      clipboard.on('error', (e) => {
        console.error('Failed to copy:', e);
      });
      
      btn.click();
      clipboard.destroy();
    };
    
    // Helper to get type configuration
    app.getTypeConfig = function(type) {
      return app.cfg.types[type] || {
        badge: 'badge-neutral',
        exec: false
      };
    };
    
    // Now initialize everything
    try {
      await app.initDB();
      await app.loadItems();
      console.log('Main module ready');
    } catch (error) {
      console.error('Main module initialization failed:', error);
      throw error;
    }
  }
})