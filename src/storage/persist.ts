// Storage durability. By default Chrome may evict an extension's IndexedDB
// under disk pressure — silently destroying the hand history. Requesting
// persistent storage opts out of eviction; the estimate surfaces usage to the UI.

export interface StorageInfo {
  persisted: boolean;   // true → IndexedDB is exempt from eviction
  usage?:    number;    // bytes used by this origin
  quota?:    number;    // bytes available to this origin
}

// Request persistent storage (idempotent) and report the resulting status.
// Safe to call from any context that exposes navigator.storage.
export async function ensurePersistentStorage(): Promise<StorageInfo> {
  const storage = navigator.storage;
  if (!storage) return { persisted: false };

  let persisted = false;
  try {
    persisted = (await storage.persisted?.()) ?? false;
    if (!persisted && storage.persist) {
      persisted = await storage.persist();
    }
  } catch {
    persisted = false;
  }

  let usage: number | undefined;
  let quota: number | undefined;
  try {
    const est = await storage.estimate?.();
    usage = est?.usage;
    quota = est?.quota;
  } catch {
    // estimate is best-effort; leave undefined
  }

  return { persisted, usage, quota };
}
