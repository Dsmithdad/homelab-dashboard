// Keeps one uploaded wallpaper (a JPEG blob) in IndexedDB, since it is too big for localStorage.
// Every function resolves quietly (null / false) if IndexedDB is unavailable, e.g. in a private window.

const DB_NAME = 'homelab-dashboard';
const STORE = 'wallpapers';
const KEY = 'custom';
const MAX_WIDTH = 2560;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const openDb = () => new Promise((resolve, reject) => {
  if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
  const req = window.indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const run = async (mode, fn) => {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
};

export const loadCustomWallpaper = () => run('readonly', (s) => s.get(KEY)).catch(() => null);
export const clearCustomWallpaper = () => run('readwrite', (s) => s.delete(KEY)).then(() => true).catch(() => false);

// Shrinks the picked image to at most 2560px wide and re-encodes it as JPEG, then stores it.
// Rejects with a short message that is safe to show the user.
export async function saveCustomWallpaper(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('That file is not an image.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Image is too big (25 MB max).');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    throw new Error('Could not read that image.');
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Could not process that image.');
  try {
    await run('readwrite', (s) => s.put(blob, KEY));
  } catch (e) {
    throw new Error('Could not save the image in this browser.');
  }
  return blob;
}
