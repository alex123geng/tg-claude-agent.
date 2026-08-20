// IndexedDB storage layer for the WB unit-economics dashboard.
// Everything lives in the browser (no backend). Chosen over localStorage
// because localStorage is capped (~5-10MB) and too small for months of
// accumulated weekly-report rows.

const DB_NAME = 'wb-unit-dashboard';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('costRef')) {
        db.createObjectStore('costRef', { keyPath: 'article' });
      }
      if (!db.objectStoreNames.contains('weeklyOps')) {
        const store = db.createObjectStore('weeklyOps', { keyPath: 'id' });
        store.createIndex('article', 'article', { unique: false });
        store.createIndex('saleDate', 'saleDate', { unique: false });
      }
      if (!db.objectStoreNames.contains('uploadsLog')) {
        db.createObjectStore('uploadsLog', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeNames, mode) {
  return openDb().then((db) => db.transaction(storeNames, mode));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  async getAll(storeName) {
    const t = await tx([storeName], 'readonly');
    return reqToPromise(t.objectStore(storeName).getAll());
  },

  async get(storeName, key) {
    const t = await tx([storeName], 'readonly');
    return reqToPromise(t.objectStore(storeName).get(key));
  },

  async getAllKeys(storeName) {
    const t = await tx([storeName], 'readonly');
    return reqToPromise(t.objectStore(storeName).getAllKeys());
  },

  async put(storeName, value) {
    const t = await tx([storeName], 'readwrite');
    const store = t.objectStore(storeName);
    store.put(value);
    await txDone(t);
    return value;
  },

  // Only inserts records whose key is not already present (dedup).
  // Reads existing keys first (one pass), then writes new ones in a
  // single transaction — avoids awaiting per-row inside a live IDB
  // transaction, which some browsers auto-commit early.
  async putManyDedup(storeName, records) {
    const existingKeys = new Set(await this.getAllKeys(storeName));
    const toAdd = records.filter((r) => !existingKeys.has(r.id));

    const t = await tx([storeName], 'readwrite');
    const store = t.objectStore(storeName);
    for (const rec of toAdd) {
      store.add(rec);
    }
    await txDone(t);

    return {
      added: toAdd.length,
      duplicates: records.length - toAdd.length,
      addedIds: toAdd.map((r) => r.id),
    };
  },

  async putMany(storeName, records) {
    const t = await tx([storeName], 'readwrite');
    const store = t.objectStore(storeName);
    for (const rec of records) {
      store.put(rec);
    }
    await txDone(t);
  },

  async delete(storeName, key) {
    const t = await tx([storeName], 'readwrite');
    return reqToPromise(t.objectStore(storeName).delete(key));
  },

  async deleteMany(storeName, keys) {
    const t = await tx([storeName], 'readwrite');
    const store = t.objectStore(storeName);
    for (const key of keys) {
      store.delete(key);
    }
    await txDone(t);
  },

  async clear(storeName) {
    const t = await tx([storeName], 'readwrite');
    return reqToPromise(t.objectStore(storeName).clear());
  },

  async count(storeName) {
    const t = await tx([storeName], 'readonly');
    return reqToPromise(t.objectStore(storeName).count());
  },
};

export async function getSetting(key, fallback) {
  const rec = await db.get('settings', key);
  return rec ? rec.value : fallback;
}

export async function setSetting(key, value) {
  return db.put('settings', { key, value });
}

export async function exportAllData() {
  const [costRef, weeklyOps, uploadsLog, settingsRows] = await Promise.all([
    db.getAll('costRef'),
    db.getAll('weeklyOps'),
    db.getAll('uploadsLog'),
    db.getAll('settings'),
  ]);
  return {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    costRef,
    weeklyOps,
    uploadsLog,
    settings: settingsRows,
  };
}

export async function importAllData(dump) {
  if (!dump || typeof dump !== 'object') {
    throw new Error('Некорректный файл импорта');
  }
  const costRef = Array.isArray(dump.costRef) ? dump.costRef : [];
  const weeklyOps = Array.isArray(dump.weeklyOps) ? dump.weeklyOps : [];
  const uploadsLog = Array.isArray(dump.uploadsLog) ? dump.uploadsLog : [];
  const settingsRows = Array.isArray(dump.settings) ? dump.settings : [];

  await db.putMany('costRef', costRef);
  const opsResult = await db.putManyDedup('weeklyOps', weeklyOps);
  await db.putMany('uploadsLog', uploadsLog);
  await db.putMany('settings', settingsRows);

  return {
    costRefCount: costRef.length,
    opsAdded: opsResult.added,
    opsDuplicates: opsResult.duplicates,
    uploadsCount: uploadsLog.length,
  };
}
