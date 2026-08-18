import {
  createJSONStorage,
  type PersistStorage,
  type StateStorage,
} from "zustand/middleware";

/**
 * Browser storage that never lets quota/privacy failures break a user action.
 *
 * Zustand writes state before persistence. A raw localStorage exception would
 * therefore leave the UI updated and then throw through the click handler.
 * The in-memory mirror preserves predictable behavior for the current page
 * lifecycle when durable storage is unavailable.
 */
export function createSafeJsonStorage<State>(): PersistStorage<State> {
  const memory = new Map<string, string>();

  const storage: StateStorage = {
    getItem(name) {
      if (typeof window !== "undefined") {
        try {
          const value = window.localStorage.getItem(name);
          if (value !== null) {
            memory.set(name, value);
            return value;
          }
        } catch {
          // Fall through to the lifecycle-local copy.
        }
      }
      return memory.get(name) ?? null;
    },
    setItem(name, value) {
      memory.set(name, value);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(name, value);
        } catch {
          // State remains usable in memory when durable storage is unavailable.
        }
      }
    },
    removeItem(name) {
      memory.delete(name);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(name);
        } catch {
          // Removing an unavailable durable value is already a successful no-op.
        }
      }
    },
  };

  // `storage` is always available, so the undefined branch in Zustand's helper
  // is unreachable here.
  return createJSONStorage<State>(() => storage)!;
}
