{
  name: 'Dexie',
  isCore: true,
  
  async init() {
    console.log('Initializing Dexie core script...');
    
    // Initialize database
    await this.initDB();
    await this.loadConfig();
    
    // Expose core database API to main app
    this.initializeData = async () => {
      await this.loadItems();
      this.executeAutorunItems();
    };
    
    // Core item operations
    this.getItems = async () => {
      return await this.db.items.orderBy('name').toArray();
    };
    
    this.saveItem = async (item) => {
      if (!item?.name) throw new Error('Item name is required');
      
      const data = {
        ...item, 
        tags: typeof item.tags === 'string' 
          ? item.tags.split(',').map(t => t.trim()).filter(Boolean)
          : item.tags || []
      };
      
      if (data.id) {
        await this.db.items.update(data.id, data);
      } else {
        await this.db.items.add(data);
      }
      
      await this.loadItems();
      return data;
    };
    
    this.deleteItem = async (id) => {
      if (!id) throw new Error('Item ID is required');
      await this.db.items.delete(id);
      await this.loadItems();
    };
    
    // Enhanced database utilities
    this.exportItems = async () => {
      const items = await this.db.items.toArray();
      return JSON.stringify(items, null, 2);
    };
    
    this.importItems = async (jsonString) => {
      try {
        const items = JSON.parse(jsonString);
        if (!Array.isArray(items)) {
          throw new Error('Import data must be an array');
        }
        
        // Validate each item has required fields
        for (const item of items) {
          if (!item.name || !item.type || typeof item.code !== 'string') {
            throw new Error('Each item must have name, type, and code properties');
          }
        }
        
        // Clear existing items and import new ones
        await this.db.transaction('rw', this.db.items, async () => {
          await this.db.items.clear();
          await this.db.items.bulkAdd(items);
        });
        
        await this.loadItems();
        return { success: true, count: items.length };
      } catch (error) {
        return { success: false, error: error.message };
      }
    };
    
    this.searchItems = async (query) => {
      if (!query) return await this.getItems();
      
      const lowerQuery = query.toLowerCase();
      return await this.db.items
        .filter(item => 
          item.name.toLowerCase().includes(lowerQuery) ||
          item.code.toLowerCase().includes(lowerQuery) ||
          item.notes?.toLowerCase().includes(lowerQuery) ||
          item.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
        )
        .toArray();
    };
    
    this.getItemsByType = async (type) => {
      return await this.db.items.where('type').equals(type).toArray();
    };
    
    this.getItemsByTag = async (tag) => {
      return await this.db.items.where('tags').equals(tag).toArray();
    };
    
    this.backupDatabase = async () => {
      const items = await this.db.items.toArray();
      const config = await this.db.config.toArray();
      
      return {
        version: 1,
        timestamp: new Date().toISOString(),
        items: items,
        config: config
      };
    };
    
    this.restoreDatabase = async (backup) => {
      if (!backup.version || !backup.items) {
        throw new Error('Invalid backup format');
      }
      
      await this.db.transaction('rw', [this.db.items, this.db.config], async () => {
        // Restore items
        await this.db.items.clear();
        await this.db.items.bulkAdd(backup.items);
        
        // Restore config if present
        if (backup.config && backup.config.length) {
          await this.db.config.clear();
          await this.db.config.bulkAdd(backup.config);
          await this.loadConfig();
        }
      });
      
      await this.loadItems();
      return { success: true, itemCount: backup.items.length };
    };
    
    console.log('Dexie core script initialized successfully');
  },
  
  // Database initialization (moved from main app)
  async initDB() {
    this.db = new Dexie('DataJarDB');
    
    // Version 2: Original schema (for migration)
    this.db.version(2).stores({ 
      items: '++id, name, type, code, autorun, *tags, notes' 
    });
    
    // Version 3: Add config store
    this.db.version(3).stores({ 
      items: '++id, name, type, code, autorun, *tags, notes',
      config: 'key'
    });
    
    // Add hooks for automatic timestamps
    this.db.items.hook('creating', (primKey, obj) => {
      obj.createdAt = new Date();
      obj.updatedAt = new Date();
    });
    
    this.db.items.hook('updating', (modifications) => {
      modifications.updatedAt = new Date();
    });
    
    await this.db.open();
    console.log('Database initialized');
  },
  
  // Configuration management (moved from main app)
  async loadConfig() {
    try {
      const savedConfig = await this.db.config.get('main');
      if (savedConfig) {
        Object.assign(this.cfg, savedConfig.value);
      } else {
        // First run - save default config
        await this.saveConfig();
      }
      console.log('Configuration loaded');
    } catch (e) {
      console.error('Error loading config:', e);
    }
  },
  
  async saveConfig() {
    try {
      await this.db.config.put({ key: 'main', value: this.cfg });
      console.log('Configuration saved');
    } catch (e) {
      console.error('Error saving config:', e);
    }
  },
  
  // Item operations (moved from main app)
  async loadItems() {
    try {
      this.items = await this.db.items.orderBy('name').toArray();
      console.log(`Loaded ${this.items.length} items`);
    } catch (e) {
      console.error('Error loading items:', e);
      this.items = [];
    }
  },
  
  executeAutorunItems() {
    const autorunItems = this.items.filter(i => i.autorun && this.cfg.types[i.type]?.exec);
    console.log(`Executing ${autorunItems.length} autorun items`);
    autorunItems.forEach(item => this.executeItem(item));
  }
}