// utils/kits/dexie.js - Dexie kit for IndexedDB operations
// Provides standalone database operations independent of core.js

// Create a database instance with a simple key-value store
const createDb = (name = 'AlpKitDB', storeName = 'records') => {
  const db = new Dexie(name);
  db.version(1).stores({ [storeName]: 'key' });
  const store = db[storeName];

  return {
    db,
    storeName,

    // Save a record
    async put(key, data) {
      await store.put({ key, data, updatedAt: Date.now() });
      return data;
    },

    // Get a record by key
    async get(key) {
      const r = await store.get(key);
      return r?.data;
    },

    // Delete a record
    async del(key) {
      await store.delete(key);
    },

    // Check if key exists
    async has(key) {
      return !!(await store.get(key));
    },

    // Get all records
    async all() {
      return store.toArray();
    },

    // Get all keys
    async keys() {
      return store.toCollection().primaryKeys();
    },

    // Get records matching a prefix (for namespaced keys like "bills.2023")
    async prefix(p) {
      return store.where('key').startsWith(p).toArray();
    },

    // Count records
    async count() {
      return store.count();
    },

    // Clear all records
    async clear() {
      await store.clear();
    },

    // Bulk put multiple records
    async bulkPut(records) {
      const items = records.map(([key, data]) => ({ key, data, updatedAt: Date.now() }));
      await store.bulkPut(items);
    },

    // Bulk get multiple records
    async bulkGet(keys) {
      const results = await store.bulkGet(keys);
      return results.map(r => r?.data);
    },

    // Bulk delete multiple records
    async bulkDel(keys) {
      await store.bulkDelete(keys);
    },

    // Group records by namespace (first segment of key)
    async grouped() {
      const records = await store.toArray();
      return records.reduce((m, { key, data }) => {
        const [ns, ...rest] = key.split('.');
        (m[ns] ||= []).push({ key, sig: rest.join('.'), data });
        return m;
      }, {});
    },

    // Iterate with callback
    async each(fn) {
      await store.each(r => fn(r.key, r.data));
    },

    // Export all data as JSON
    async export() {
      const records = await store.toArray();
      return JSON.stringify(records, null, 2);
    },

    // Import data from JSON
    async import(json) {
      const records = typeof json === 'string' ? JSON.parse(json) : json;
      await store.bulkPut(records);
    }
  };
};

// Default database instance (lazy-created)
let defaultDb;
const getDefault = () => defaultDb ||= createDb();

// Main dexie kit export
const dexie = {
  // Create a new database instance
  create: createDb,

  // Default database operations
  put: (key, data) => getDefault().put(key, data),
  get: key => getDefault().get(key),
  del: key => getDefault().del(key),
  has: key => getDefault().has(key),
  all: () => getDefault().all(),
  keys: () => getDefault().keys(),
  prefix: p => getDefault().prefix(p),
  count: () => getDefault().count(),
  clear: () => getDefault().clear(),
  bulkPut: records => getDefault().bulkPut(records),
  bulkGet: keys => getDefault().bulkGet(keys),
  bulkDel: keys => getDefault().bulkDel(keys),
  grouped: () => getDefault().grouped(),
  each: fn => getDefault().each(fn),
  export: () => getDefault().export(),
  import: json => getDefault().import(json),

  // Access default db instance
  get db() { return getDefault(); }
};

export { dexie };
