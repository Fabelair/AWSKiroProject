/**
 * Seeded random numbers. Only integer maths plus one exact division, so results are
 * identical on every JavaScript engine. Math.random() must never be used for the timeline.
 */

/** xmur3 string hash: turns any seed string into a 32-bit number. */
export function hashSeed(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * mulberry32 generator.
 * @param {string} seed
 * @returns {{ next: () => number, int: (min: number, max: number) => number }}
 */
export function createRng(seed) {
  let state = hashSeed(String(seed));
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Integer in [min, max], inclusive. */
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  return { next, int };
}
