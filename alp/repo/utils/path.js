// utils/path.js - Path parsing and building utilities for multi-db/store paths
// Format: [database/][store:]recordPath
// Examples: bills.jan | data:bills.jan | Work/data:bills.jan | Work/:bills.jan

export const DEFAULT_DB = 'AlpDB';
export const DEFAULT_STORE = 'alp';

export const path = {
  DEFAULT_DB,
  DEFAULT_STORE,
  parse: null,
  build: null,
  buildFull: null,
  display: null,
  getRecord: null,
  equals: null
};

export const parsePath = (input) => {
  if (!input || typeof input !== 'string') {
    return {
      db: DEFAULT_DB,
      store: DEFAULT_STORE,
      record: '',
      full: '',
      isDefaultDb: true,
      isDefaultStore: true
    };
  }

  const trimmed = input.trim();
  let db = DEFAULT_DB;
  let store = DEFAULT_STORE;
  let record = trimmed;

  // Check for database prefix (contains /)
  const slashIdx = trimmed.indexOf('/');
  if (slashIdx !== -1) {
    db = trimmed.slice(0, slashIdx) || DEFAULT_DB;
    record = trimmed.slice(slashIdx + 1);
  }

  // Check for store prefix (contains :)
  const colonIdx = record.indexOf(':');
  if (colonIdx !== -1) {
    store = record.slice(0, colonIdx) || DEFAULT_STORE;
    record = record.slice(colonIdx + 1);
  }

  return {
    db,
    store,
    record,
    full: buildPath(db, store, record),
    isDefaultDb: db === DEFAULT_DB,
    isDefaultStore: store === DEFAULT_STORE
  };
};

export const buildPath = (db, store, record) => {
  const useDefaultDb = !db || db === DEFAULT_DB;
  const useDefaultStore = !store || store === DEFAULT_STORE;

  if (useDefaultDb && useDefaultStore) {
    return record;
  }
  if (useDefaultDb) {
    return `${store}:${record}`;
  }
  if (useDefaultStore) {
    return `${db}/:${record}`;
  }
  return `${db}/${store}:${record}`;
};

export const buildFullPath = (db, store, record) => {
  return `${db || DEFAULT_DB}/${store || DEFAULT_STORE}:${record}`;
};

export const displayPath = (input) => {
  const { db, store, record } = parsePath(input);
  return buildPath(db, store, record);
};

export const getRecordPath = (input) => {
  return parsePath(input).record;
};

export const pathsEqual = (path1, path2) => {
  const p1 = parsePath(path1);
  const p2 = parsePath(path2);
  return p1.db === p2.db && p1.store === p2.store && p1.record === p2.record;
};

path.parse = parsePath;
path.build = buildPath;
path.buildFull = buildFullPath;
path.display = displayPath;
path.getRecord = getRecordPath;
path.equals = pathsEqual;
