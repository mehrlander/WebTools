// utils/db-manager.js - Multi-database management for Alp

import { DEFAULT_DB, DEFAULT_STORE } from './path.js';
import { MemoryDb } from './memory-db.js';

const databases = new Map();
const storeRegistry = new Map();
let persistentMode = true;

const createDb = async (name, storeNames = [DEFAULT_STORE]) => {
  if (databases.has(name)) throw new Error(`Database '${name}' already exists. Use getDb('${name}') to access it.`);
  if (!storeNames.length) storeNames = [DEFAULT_STORE];

  const storeSchema = {};
  for (const store of storeNames) storeSchema[store] = 'name';

  let db;
  if (persistentMode) {
    db = new Dexie(name);
    db.version(1).stores(storeSchema);
    await db.open();
  } else {
    db = new MemoryDb(name);
    db.version(1).stores(storeSchema);
    await db.open();
  }

  databases.set(name, db);
  storeRegistry.set(name, new Set(storeNames));

  const modeLabel = persistentMode ? '' : ' (memory)';
  console.log(`📦 Created database '${name}' with stores: ${storeNames.join(', ')}${modeLabel}`);
  return db;
};

const createStore = async (dbName, storeName) => {
  const db = databases.get(dbName);
  if (!db) throw new Error(`Database '${dbName}' not found. Use alp.createDb('${dbName}', ['${storeName}']) to create it.`);

  const stores = storeRegistry.get(dbName);
  if (stores.has(storeName)) throw new Error(`Store '${storeName}' already exists in database '${dbName}'.`);

  const storeSchema = {};
  for (const store of stores) storeSchema[store] = 'name';
  storeSchema[storeName] = 'name';

  let newDb;
  if (db instanceof MemoryDb) {
    const v = db.verno + 1;
    db.version(v).stores({ [storeName]: 'name' });
    newDb = db;
    stores.add(storeName);
    console.log(`📦 Added store '${storeName}' to database '${dbName}' (v${v}, memory)`);
  } else {
    db.close();
    const v = db.verno + 1;
    newDb = new Dexie(dbName);
    newDb.version(v).stores(storeSchema);
    await newDb.open();
    databases.set(dbName, newDb);
    stores.add(storeName);
    console.log(`📦 Added store '${storeName}' to database '${dbName}' (v${v})`);
  }

  return newDb;
};

const registerDb = (name, db, storeNames = [DEFAULT_STORE]) => {
  databases.set(name, db);
  storeRegistry.set(name, new Set(storeNames));
};

const getDb = (name) => {
  const db = databases.get(name);
  if (!db) throw new Error(`Database '${name}' not found. Use alp.createDb('${name}', ['storeName']) to create it.`);
  return db;
};

const getStore = (dbName, storeName) => {
  const db = getDb(dbName);
  const stores = storeRegistry.get(dbName);
  if (!stores || !stores.has(storeName)) {
    throw new Error(`Store '${storeName}' not found in database '${dbName}'. Use alp.createStore('${dbName}', '${storeName}') to create it.`);
  }
  return db[storeName];
};

const hasDb = (name) => databases.has(name);

const hasStore = (dbName, storeName) => {
  const stores = storeRegistry.get(dbName);
  return stores ? stores.has(storeName) : false;
};

const has = (dbName, storeName) => hasDb(dbName) && hasStore(dbName, storeName);

const listDbs = () => Array.from(databases.keys());

const listStores = (dbName) => {
  const stores = storeRegistry.get(dbName);
  return stores ? Array.from(stores) : [];
};

const closeDb = (name) => {
  const db = databases.get(name);
  if (db) {
    db.close();
    databases.delete(name);
    storeRegistry.delete(name);
    console.log(`📦 Closed database '${name}'`);
  }
};

const deleteDb = async (name) => {
  const db = databases.get(name);
  const isMemory = db instanceof MemoryDb;
  closeDb(name);
  if (!isMemory) await Dexie.delete(name);
  console.log(`🗑️ Deleted database '${name}'${isMemory ? ' (memory)' : ''}`);
};

const setPersistent = (persistent) => { persistentMode = persistent; };
const isPersistent = () => persistentMode;

export const dbManager = {
  createDb,
  createStore,
  registerDb,
  getDb,
  getStore,
  hasDb,
  hasStore,
  has,
  listDbs,
  listStores,
  closeDb,
  deleteDb,
  setPersistent,
  isPersistent
};
