/**
 * The tiny slice of storage the save system needs, as an interface so tests (and any future
 * backend) can substitute their own without touching save logic or faking `window`.
 */
export interface SaveStorage {
  read(): string | null;
  write(data: string): void;
  clear(): void;
}

export const SAVE_KEY = 'rogueout:save';

/**
 * The key used before the game was renamed from "roguelite" to "rogueout".
 *
 * Read as a fallback so a run already in progress survives the rename — losing someone's saved
 * run to a cosmetic change would be the exact failure the permadeath save exists to avoid. The
 * next write lands on the new key and drops this one, so it matters for exactly one load per
 * browser. Safe to delete once nobody could still be carrying a pre-rename save.
 */
const LEGACY_SAVE_KEY = 'roguelite:save';

/**
 * localStorage, with every call wrapped: it throws on quota exhaustion and is entirely absent in
 * some privacy modes. A save that can't be written must never take the game down with it — the
 * run is still playable, it just won't survive a reload.
 */
export function createLocalStorageAdapter(key: string = SAVE_KEY): SaveStorage {
  return {
    read() {
      try {
        return window.localStorage.getItem(key) ?? window.localStorage.getItem(LEGACY_SAVE_KEY);
      } catch {
        return null;
      }
    },
    write(data: string) {
      try {
        window.localStorage.setItem(key, data);
        window.localStorage.removeItem(LEGACY_SAVE_KEY);
      } catch {
        /* out of quota, or storage blocked — the run continues, unsaved. */
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(key);
        window.localStorage.removeItem(LEGACY_SAVE_KEY);
      } catch {
        /* nothing we can do, and nothing worth crashing over. */
      }
    },
  };
}

/** An in-memory stand-in, for tests and for when localStorage is unavailable. */
export function createMemoryStorage(initial: string | null = null): SaveStorage {
  let data = initial;
  return {
    read: () => data,
    write: (next) => {
      data = next;
    },
    clear: () => {
      data = null;
    },
  };
}
