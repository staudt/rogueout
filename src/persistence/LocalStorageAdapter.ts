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
 * localStorage, with reads and clears wrapped: it throws on quota exhaustion and is entirely
 * absent in some privacy modes. A save that can't be written must never take the game down with
 * it — the run is still playable, it just won't survive a reload.
 *
 * `write` deliberately does **not** swallow its error. It used to, and the result was worse than
 * the failure it was hiding: `saveGame` reported success for a write that never happened, and
 * "Save and quit" told the player their run was safe before discarding it. Failing loudly here
 * lets `saveGame` return an honest `false` and the caller decide — which is still "keep playing",
 * just with the player told the truth.
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
      window.localStorage.setItem(key, data);
      // Only once the real write has succeeded, so a failure can't cost the previous save too.
      try {
        window.localStorage.removeItem(LEGACY_SAVE_KEY);
      } catch {
        /* the new key holds the run; the stale one is untidy, not dangerous. */
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
