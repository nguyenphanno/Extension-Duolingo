/**
 * StorageArea.ts — a promise-based, namespaced wrapper over chrome.storage.
 *
 * Falls back to localStorage when the extension APIs are unavailable, which is
 * what makes the standalone `Preview.html` demo work in a normal tab.
 */
export type StorageZone = 'local' | 'session';

function hasChromeStorage(zone: StorageZone): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.[zone]);
}

/** Service workers have no `localStorage`; guard every access. */
function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export async function readRaw<T>(zone: StorageZone, key: string): Promise<T | null> {
  if (hasChromeStorage(zone)) {
    const bag = await chrome.storage[zone].get(key);
    return (bag[key] as T | undefined) ?? null;
  }
  if (!hasLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeRaw<T>(zone: StorageZone, key: string, value: T): Promise<void> {
  if (hasChromeStorage(zone)) {
    await chrome.storage[zone].set({ [key]: value });
    return;
  }
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — nothing sensible to do in preview mode */
  }
}

export async function removeRaw(zone: StorageZone, key: string): Promise<void> {
  if (hasChromeStorage(zone)) {
    await chrome.storage[zone].remove(key);
    return;
  }
  if (!hasLocalStorage()) return;
  localStorage.removeItem(key);
}
