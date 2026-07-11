const DB_NAME = "media-server";
const DB_VERSION = 2;
export const MAX_CACHE_BYTES = 5 * 1024 * 1024 * 1024;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        if (!db.objectStoreNames.contains("prefs")) {
          db.createObjectStore("prefs");
        }
      }
      if (e.oldVersion < 2) {
        if (!db.objectStoreNames.contains("apiCache")) {
          db.createObjectStore("apiCache");
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbPromise = open();

// ── Prefs (original) ────────────────────────────────────────────────

export async function getPref(key, fallback) {
  try {
    const db = await dbPromise;
    return await new Promise((resolve) => {
      const tx = db.transaction("prefs", "readonly");
      const req = tx.objectStore("prefs").get(key);
      req.onsuccess = () => resolve(req.result ?? fallback);
      req.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

export async function setPref(key, value) {
  try {
    const db = await dbPromise;
    const tx = db.transaction("prefs", "readwrite");
    tx.objectStore("prefs").put(value, key);
  } catch {}
}

export async function clearAllPrefs() {
  try {
    const db = await dbPromise;
    const tx = db.transaction("prefs", "readwrite");
    tx.objectStore("prefs").clear();
  } catch {}
}

// ── API data cache ──────────────────────────────────────────────────

export async function cacheApiData(url, data) {
  try {
    const db = await dbPromise;
    const tx = db.transaction("apiCache", "readwrite");
    tx.objectStore("apiCache").put({ data, ts: Date.now() }, url);
  } catch {}
}

export async function getCachedApiData(url) {
  try {
    const db = await dbPromise;
    return await new Promise((resolve) => {
      const tx = db.transaction("apiCache", "readonly");
      const req = tx.objectStore("apiCache").get(url);
      req.onsuccess = () => resolve(req.result?.data ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearApiCache() {
  try {
    const db = await dbPromise;
    const tx = db.transaction("apiCache", "readwrite");
    tx.objectStore("apiCache").clear();
  } catch {}
}

export async function evictOldestApiEntries(count = 50) {
  try {
    const db = await dbPromise;
    const tx = db.transaction("apiCache", "readwrite");
    const store = tx.objectStore("apiCache");
    const req = store.openCursor();
    let deleted = 0;
    await new Promise((resolve) => {
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && deleted < count) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch {}
}

// ── Storage estimation ──────────────────────────────────────────────

export async function getStorageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) {
    return { used: 0, quota: MAX_CACHE_BYTES, percent: 0 };
  }
  try {
    const { usage, quota } = await navigator.storage.estimate();
    const u = usage || 0;
    const q = quota || MAX_CACHE_BYTES;
    return { used: u, quota: q, percent: Math.round((u / q) * 100) };
  } catch {
    return { used: 0, quota: MAX_CACHE_BYTES, percent: 0 };
  }
}

export async function hasStorageRoom(neededBytes = 0) {
  const { used } = await getStorageEstimate();
  return used + neededBytes < MAX_CACHE_BYTES;
}

export async function clearAllDataCache() {
  await clearApiCache();
  if ("caches" in self) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}
