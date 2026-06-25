function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("media-server", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("prefs")) {
        db.createObjectStore("prefs");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbPromise = open();

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
