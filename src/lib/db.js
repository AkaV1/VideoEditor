// Almacenamiento local (IndexedDB): proyectos + archivos de medios.
const DB_NAME = 'linecut';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function run(storeName, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const st = tx.objectStore(storeName);
    let out;
    Promise.resolve(fn(st)).then((v) => (out = v), reject);
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const wrap = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

export const blobKey = (pid, mid) => `${pid}:${mid}`;

export const listProjects = () => run('projects', 'readonly', (st) => wrap(st.getAll()));
export const getProject = (id) => run('projects', 'readonly', (st) => wrap(st.get(id)));
export const putProject = (rec) => run('projects', 'readwrite', (st) => wrap(st.put(rec)));
export const putBlob = (pid, mid, blob) => run('blobs', 'readwrite', (st) => wrap(st.put(blob, blobKey(pid, mid))));
export const getBlob = (pid, mid) => run('blobs', 'readonly', (st) => wrap(st.get(blobKey(pid, mid))));

export async function deleteProject(id) {
  await run('projects', 'readwrite', (st) => wrap(st.delete(id)));
  await run('blobs', 'readwrite', (st) => {
    const range = IDBKeyRange.bound(`${id}:`, `${id}:￿`);
    return wrap(st.delete(range));
  });
}

export async function copyBlobs(fromId, toId, mediaIds) {
  for (const mid of mediaIds) {
    const b = await getBlob(fromId, mid);
    if (b) await putBlob(toId, mid, b);
  }
}

export async function requestPersistence() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* no disponible */
  }
}

export async function storageUsage() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null;
  } catch {
    return null;
  }
}
