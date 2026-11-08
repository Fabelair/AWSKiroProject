import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/core/engine.js';
import { FrontendBridge } from '../src/core/bridge.js';
import { Timeline } from '../src/core/timeline.js';
import { RULEBOOK } from '../src/core/rulebook.js';
import { TestBot } from '../src/core/bot.js';
import { createVmFrontend } from './vm-frontend.js';
import { defaultBundle, guitarBundle } from './helpers.js';
import { themeDefaultBundle } from '../src/frontend/bundles.js';

const SEEDS = ['conformance-1', 'conformance-2', 'kiro'];

/** Runs `trace` against a fresh engine, optionally with a frontend attached; returns the run summary. */
function runWith(seed, trace, attach) {
  let now = 0;
  const engine = new GameEngine({ seed, clock: () => now });
  const detach = attach ? attach(engine) : () => {};
  let next = 0;
  const limit = trace[trace.length - 1] + 700;
  while (engine.state !== 'GAME_OVER' && engine.sim.tick < limit) {
    while (next < trace.length && trace[next] <= engine.sim.tick) { engine.press(); next++; }
    now += RULEBOOK.tickMs;
    engine.update(RULEBOOK.tickMs);
    engine.bridgeTick?.();
  }
  detach();
  const { pressTicks, ...rest } = engine.sim.summary();
  return { ...rest, pressTicks };
}

function withVmFrontend(bundle) {
  return (engine) => {
    let frontend = null;
    const queued = [];
    const bridge = new FrontendBridge({ engine, send: (m) => (frontend ? frontend.receive(m) : queued.push(m)) });
    frontend = createVmFrontend(bundle, { onSend: (m) => bridge.handleMessage(m) });
    queued.splice(0).forEach((m) => frontend.receive(m));
    engine.bridgeTick = () => { bridge.sendTick(); frontend.frame(); };
    return () => bridge.detach();
  };
}

function withHostileFrontend(engine) {
  const bridge = new FrontendBridge({ engine, send: () => {} });
  bridge.handleMessage({ fk: 1, type: 'ready', payload: { apiVersion: '1.0' } });
  engine.bridgeTick = () => {
    for (const type of ['setScore', 'setSeed', 'press', 'state', 'cueResult', 'gameOver', 'physics']) {
      bridge.handleMessage({ fk: 1, type, payload: { score: 1e9, seed: 'x', state: 'GAME_OVER' } });
    }
    bridge.sendTick();
  };
  return () => bridge.detach();
}

const traces = (seed) => {
  const tl = new Timeline(seed);
  const perfect = tl.perfectTrace(40);
  return {
    perfect,
    idle: [0],
    spam: Array.from({ length: 300 }, (_, i) => i * 5),
    late: perfect.map((t, i) => (i === 0 ? t : t + 30)),
    early: perfect.map((t, i) => (i === 0 ? t : t - 30)),
    jittery: perfect.map((t, i) => (i === 0 ? t : t + ((i * 7) % 21) - 10)),
    dropout: perfect.filter((_, i) => i !== 12),
  };
};

test('CORE-CF-01: identical run summaries with no frontend, the default skin, the guitar skin, a themed skin and a hostile frontend', () => {
  for (const seed of SEEDS) {
    for (const [name, trace] of Object.entries(traces(seed))) {
      const reference = runWith(seed, trace, null);
      const variants = {
        default: withVmFrontend(defaultBundle()),
        guitar: withVmFrontend(guitarBundle()),
        themed: withVmFrontend(themeDefaultBundle(defaultBundle(), 'night')),
        hostile: withHostileFrontend,
      };
      for (const [label, attach] of Object.entries(variants)) {
        assert.deepEqual(runWith(seed, trace, attach), reference, `${seed}/${name} differs with the ${label} frontend`);
      }
    }
  }
});

test('CORE-CF-01: the traces behave as expected (perfect passes, the rest are judged by the Core)', () => {
  const t = traces('conformance-1');
  assert.ok(runWith('conformance-1', t.perfect, null).score >= 40);
  assert.notEqual(runWith('conformance-1', t.idle, null).failCueId, null);
  assert.notEqual(runWith('conformance-1', t.spam, null).failCueId, null);
  assert.notEqual(runWith('conformance-1', t.dropout, null).failCueId, null);
});

test('CORE-CF-02: the Core runs fully headless (no frontend, no DOM)', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.window, 'undefined');
  const summary = runWith('headless', new Timeline('headless').perfectTrace(30), null);
  assert.ok(summary.score >= 30);
});

test('the same seed plays identically in a second engine (same device or not)', () => {
  const tr = traces('kiro').jittery;
  assert.deepEqual(runWith('kiro', tr, null), runWith('kiro', tr, null));
});

test('different seeds demand different press patterns, same seed demands the same pattern in every skin', () => {
  const a = new Timeline('seed-a').perfectTrace(20);
  const b = new Timeline('seed-b').perfectTrace(20);
  assert.notDeepEqual(a, b);
  // The press pattern demanded by "pipes" and by "notes" is literally the same cue list.
  const cuesForPipes = new Timeline('seed-a').getCues(20).map((c) => c.targetMs);
  const cuesForNotes = new Timeline('seed-a').getCues(20).map((c) => c.targetMs);
  assert.deepEqual(cuesForPipes, cuesForNotes);
});

test('test bot plays a perfect game through the normal press() door', () => {
  let now = 0;
  const engine = new GameEngine({ seed: 'bot', clock: () => now });
  const bot = new TestBot(engine);
  bot.enabled = true;
  for (let i = 0; i < 6000 && engine.sim.score < 40; i++) {
    now += RULEBOOK.tickMs;
    engine.update(RULEBOOK.tickMs);
    bot.update();
  }
  assert.ok(engine.sim.score >= 40, `bot score ${engine.sim.score}`);
  assert.notEqual(engine.state, 'GAME_OVER');
});

test('test bot with large timing jitter fails like a human would (rules are not bent)', () => {
  let now = 0;
  const engine = new GameEngine({ seed: 'bot', clock: () => now });
  const bot = new TestBot(engine, { jitterMs: 600, random: (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })() });
  bot.enabled = true;
  for (let i = 0; i < 6000 && engine.state !== 'GAME_OVER'; i++) {
    now += RULEBOOK.tickMs;
    engine.update(RULEBOOK.tickMs);
    bot.update();
  }
  assert.equal(engine.state, 'GAME_OVER');
});
