{
  name: 'Dexie',
  async init() {
    // Extend with common database operations
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
          if (!item.name || !item.type || !item.code) {
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
      const backup = {
        version: 1,
        timestamp: new Date().toISOString(),
        items: items
      };
      return backup;
    };
    
    this.restoreDatabase = async (backup) => {
      if (!backup.version || !backup.items) {
        throw new Error('Invalid backup format');
      }
      return await this.importItems(JSON.stringify(backup.items));
    };
  }
}
