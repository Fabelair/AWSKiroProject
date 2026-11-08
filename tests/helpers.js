import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readBundle(dir, name) {
  const files = {};
  for (const file of ['index.html', 'style.css', 'main.js']) {
    files[file] = readFileSync(path.join(root, dir, file), 'utf8');
  }
  return { name, files };
}

export const defaultBundle = () => readBundle('src/frontend/default', 'Flappy Kiro (default)');
export const guitarBundle = () => readBundle('src/frontend/examples/guitar-hero', 'Guitar Kiro');

/** In-memory Storage double. */
export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    _data: data,
  };
}

/** Plays a complete run through an engine in fixed 8 ms frames. */
export function playTrace(engine, trace, { maxExtraTicks = 700, stopAfterCues } = {}) {
  let next = 0;
  const limit = trace[trace.length - 1] + maxExtraTicks;
  while (engine.state !== 'GAME_OVER' && engine.sim.tick < limit) {
    while (next < trace.length && trace[next] <= engine.sim.tick) {
      engine.press();
      next++;
    }
    engine.update(engine.rules.tickMs);
    if (stopAfterCues !== undefined && engine.sim.cueIndex >= stopAfterCues) break;
  }
  return engine.sim.summary();
}
