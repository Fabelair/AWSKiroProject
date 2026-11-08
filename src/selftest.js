/**
 * In-browser self-test: proves the main guarantees on the live page (determinism, reachability,
 * frontend independence, validator, sandbox load). The same checks also run under `npm test`.
 */

import { Timeline } from './core/timeline.js';
import { replay } from './core/simulation.js';
import { GameEngine } from './core/engine.js';
import { FrontendBridge } from './core/bridge.js';
import { validateBundle } from './core/validator.js';
import { runLoadTest } from './core/loadtest.js';
import { RULEBOOK } from './core/rulebook.js';

const SEEDS = ['kiro', 'selftest-1', 'selftest-2', '12345'];
const CUES = 60;

function check(results, name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: detail === undefined || detail === true || typeof detail === 'string', detail: typeof detail === 'string' ? detail : '' });
  } catch (error) {
    results.push({ name, ok: false, detail: String(error?.message ?? error) });
  }
}

/** Runs one engine with the perfect trace, optionally with a hostile "frontend" attached. */
function runEngineWithTrace(seed, trace, hostile) {
  let now = 0;
  const engine = new GameEngine({ seed, clock: () => now });
  let bridge = null;
  if (hostile) {
    bridge = new FrontendBridge({ engine, send: () => {} });
    bridge.handleMessage({ fk: 1, type: 'ready', payload: { apiVersion: '1.0', name: 'hostile' } });
  }
  let next = 0;
  while (engine.state !== 'GAME_OVER' && engine.sim.tick < trace[trace.length - 1] + 700) {
    while (next < trace.length && trace[next] <= engine.sim.tick) {
      engine.press();
      next++;
    }
    if (bridge) {
      // everything a hostile frontend might try; all must be ignored
      for (const type of ['press', 'setScore', 'setSeed', 'setState', 'physics', 'tick']) {
        bridge.handleMessage({ fk: 1, type, payload: { score: 9999, seed: 'hax', state: 'GAME_OVER' } });
      }
      bridge.sendTick();
    }
    engine.update(RULEBOOK.tickMs);
    now += RULEBOOK.tickMs;
    if (engine.sim.cueIndex >= CUES) break;
  }
  return engine.sim.summary();
}

/**
 * @param {{ bundles: Record<string, object> }} options bundles to validate and load-test
 * @returns {Promise<Array<{name:string, ok:boolean, detail:string}>>}
 */
export async function runSelfTest({ bundles }) {
  const results = [];

  check(results, 'Same seed gives the same timeline (twice)', () => {
    for (const seed of SEEDS) {
      const a = JSON.stringify(new Timeline(seed).getCues(CUES));
      const b = JSON.stringify(new Timeline(seed).getCues(CUES));
      if (a !== b) throw new Error(`timeline differs for seed ${seed}`);
    }
    return `${SEEDS.length} seeds x ${CUES} cues`;
  });

  check(results, 'Different seeds give different timelines', () => {
    const a = JSON.stringify(new Timeline('alpha').getCues(10));
    const b = JSON.stringify(new Timeline('beta').getCues(10));
    if (a === b) throw new Error('timelines are identical');
  });

  check(results, `A perfect player passes ${CUES} cues on every seed`, () => {
    for (const seed of SEEDS) {
      const trace = new Timeline(seed).perfectTrace(CUES);
      const summary = replay(seed, trace, { stopAfterCues: CUES });
      if (summary.score !== CUES) throw new Error(`seed ${seed}: score ${summary.score}`);
    }
  });

  check(results, 'Idle and spamming players fail', () => {
    const idle = replay('kiro', [0]);
    const spam = replay('kiro', Array.from({ length: 200 }, (_, i) => i * 4));
    if (idle.failCueId === null) throw new Error('idle did not fail');
    if (spam.failCueId === null) throw new Error('spam did not fail');
    return `idle failed at cue ${idle.failCueId}, spam at cue ${spam.failCueId}`;
  });

  check(results, 'Replaying a stored trace reproduces the same summary', () => {
    const trace = new Timeline('kiro').perfectTrace(20);
    const first = JSON.stringify(replay('kiro', trace, { stopAfterCues: 20 }));
    const second = JSON.stringify(replay('kiro', trace, { stopAfterCues: 20 }));
    if (first !== second) throw new Error('summaries differ');
  });

  check(results, 'A hostile frontend cannot change the outcome', () => {
    const trace = new Timeline('kiro').perfectTrace(CUES);
    const clean = JSON.stringify(runEngineWithTrace('kiro', trace, false));
    const hostile = JSON.stringify(runEngineWithTrace('kiro', trace, true));
    if (clean !== hostile) throw new Error('summaries differ');
  });

  check(results, 'Validator rejects network, eval and parent access', () => {
    const evil = {
      name: 'evil',
      files: {
        'index.html': '<script src="main.js"></script>',
        'main.js': 'FK.ready({}); fetch("https://evil.example"); eval("1"); parent.document.title = "x";',
      },
    };
    const { ok, errors } = validateBundle(evil);
    if (ok || errors.length < 3) throw new Error('evil bundle was not rejected');
    return `${errors.length} problems found`;
  });

  for (const [label, bundle] of Object.entries(bundles)) {
    check(results, `Validator accepts "${label}"`, () => {
      const { ok, errors } = validateBundle(bundle);
      if (!ok) throw new Error(errors.join('; '));
    });
  }
  for (const [label, bundle] of Object.entries(bundles)) {
    const problems = await runLoadTest(bundle);
    results.push({
      name: `"${label}" loads in the sandbox and runs a scripted game`,
      ok: problems.length === 0,
      detail: problems.join('; '),
    });
  }
  return results;
}
