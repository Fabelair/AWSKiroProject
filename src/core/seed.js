/** Seed validation and creation. */

export const MAX_SEED_LENGTH = 64;

/**
 * @param {unknown} input
 * @returns {{ ok: true, seed: string } | { ok: false, error: string }}
 */
export function normalizeSeed(input) {
  const seed = String(input ?? '').trim();
  if (seed.length === 0) return { ok: false, error: 'Seed cannot be empty.' };
  if (seed.length > MAX_SEED_LENGTH) {
    return { ok: false, error: `Seed must be at most ${MAX_SEED_LENGTH} characters.` };
  }
  return { ok: true, seed };
}

/** Random seed for the "new seed" button. This does not affect the timeline's determinism. */
export function randomSeed(random = Math.random) {
  return `kiro-${Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')}`;
}

/** Reads ?seed=... from a URL search string. Returns null when absent or invalid. */
export function seedFromSearch(search) {
  const value = new URLSearchParams(search).get('seed');
  if (value === null) return null;
  const result = normalizeSeed(value);
  return result.ok ? result.seed : null;
}

/** Builds a share link carrying seed and rulebook version. */
export function buildShareLink(baseUrl, seed, rulebookVersion) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('seed', seed);
  url.searchParams.set('rb', rulebookVersion);
  return url.toString();
}
