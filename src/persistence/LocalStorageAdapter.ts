/**
 * The tiny slice of storage the save system needs, as an interface so tests (and any future
 * backend) can substitute their own without touching save logic or faking `window`.
 */
export interface SaveStorage {
  read(): string | null;
  write(data: string): void;
  clear(): void;
}

export const SAVE_KEY = 'roguelite:save';

/**
 * localStorage, with every call wrapped: it throws on quota exhaustion and is entirely absent in
 * some privacy modes. A save that can't be written must never take the game down with it — the
 * run is still playable, it just won't survive a reload.
 */
export function createLocalStorageAdapter(key: string = SAVE_KEY): SaveStorage {
  return {
    read() {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(data: string) {
      try {
        window.localStorage.setItem(key, data);
      } catch {
        /* out of quota, or storage blocked — the run continues, unsaved. */
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(key);
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
