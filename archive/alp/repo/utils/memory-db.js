// utils/memory-db.js - In-memory database fallback when IndexedDB is unavailable

export const isIndexedDBAvailable = async () => {
  if (typeof indexedDB === 'undefined' || !indexedDB) return false;

  // Try to actually open a test database (catches Safari data URL restrictions)
  try {
    const testName = '__alp_indexeddb_test__';
    const request = indexedDB.open(testName, 1);

    return new Promise((resolve) => {
      request.onerror = () => {
        resolve(false);
      };

      request.onsuccess = () => {
        request.result.close();
        indexedDB.deleteDatabase(testName);
        resolve(true);
      };

      request.onblocked = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
};

class WhereClause {
  constructor(table, field) {
    this.table = table;
    this.field = field;
  }

  startsWith(prefix) {
    return {
      toArray: async () => {
        const results = [];
        for (const record of this.table._data.values()) {
          const fieldValue = record[this.field];
          if (typeof fieldValue === 'string' && fieldValue.startsWith(prefix)) {
            results.push(record);
          }
        }
        return results;
      }
    };
  }
}

class MemoryTable {
  constructor(name) {
    this.name = name;
    this._data = new Map();
  }

  async get(key) {
    return this._data.get(key);
  }

  async put(record) {
    if (!record || typeof record.name === 'undefined') {
      throw new Error('Record must have a "name" property');
    }
    this._data.set(record.name, { ...record });
    return record.name;
  }

  async delete(key) {
    this._data.delete(key);
  }

  async toArray() {
    return Array.from(this._data.values());
  }

  where(field) {
    return new WhereClause(this, field);
  }

  async clear() {
    this._data.clear();
  }

  async count() {
    return this._data.size;
  }
}

export class MemoryDb {
  constructor(name) {
    this.name = name;
    this._tables = new Map();
    this._version = 1;
    this._isOpen = false;
  }

  get verno() {
    return this._version;
  }

  version(version) {
    this._version = version;
    return {
      stores: (schema) => {
        for (const storeName of Object.keys(schema)) {
          if (!this._tables.has(storeName)) {
            const table = new MemoryTable(storeName);
            this._tables.set(storeName, table);
            this[storeName] = table;
          }
        }
        return this;
      }
    };
  }

  async open() {
    this._isOpen = true;
    return this;
  }

  close() {
    this._isOpen = false;
  }

  isOpen() {
    return this._isOpen;
  }

  static async delete(name) {
    // No-op for memory databases - they don't persist
  }
}
