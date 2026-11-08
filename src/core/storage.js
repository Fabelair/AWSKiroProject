/** Defensive storage helpers: storage can be missing, full or blocked (private mode). */

/** Wraps a Storage-like backend; every call is safe and never throws. */
export function createSafeStore(backend) {
  return {
    get(key) {
      try {
        return backend ? backend.getItem(key) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (!backend) return false;
        backend.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        if (backend) backend.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/** The browser's localStorage if reachable, otherwise null. */
export function browserLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Parses a stored score; anything invalid becomes 0. */
export function parseScore(raw) {
  if (typeof raw !== 'string' || !/^\d{1,15}$/.test(raw)) return 0;
  return Number.parseInt(raw, 10);
}

/**
 * High scores per (rulebookVersion, seed) plus an overall best.
 * @param {ReturnType<typeof createSafeStore>} store
 */
export function createScoreBoard(store) {
  const seedKey = (version, seed) => `fk.high.${version}.${seed}`;
  const overallKey = 'fk.best';
  return {
    getHigh: (version, seed) => parseScore(store.get(seedKey(version, seed))),
    getBest: () => parseScore(store.get(overallKey)),
    /** Records a finished run; returns the updated bests. */
    record(version, seed, score) {
      const previousHigh = parseScore(store.get(seedKey(version, seed)));
      const previousBest = parseScore(store.get(overallKey));
      const high = Math.max(previousHigh, score);
      const best = Math.max(previousBest, score);
      if (high !== previousHigh) store.set(seedKey(version, seed), String(high));
      if (best !== previousBest) store.set(overallKey, String(best));
      return { high, best, isNewHigh: score > previousHigh };
    },
  };
}
