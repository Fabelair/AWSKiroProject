import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/core/engine.js';
import { FrontendBridge } from '../src/core/bridge.js';
import { API_VERSION, parseFrontendMessage, isApiVersionSupported, createMessage } from '../src/core/api.js';
import { Watchdog } from '../src/core/watchdog.js';
import { RULEBOOK } from '../src/core/rulebook.js';

function setup() {
  const sent = [];
  const events = { ready: [], rejected: [], errors: [], beats: 0 };
  const engine = new GameEngine({ seed: 'bridge', clock: () => 0 });
  const bridge = new FrontendBridge({
    engine,
    send: (m) => sent.push(m),
    onReady: (i) => events.ready.push(i),
    onRejected: (r) => events.rejected.push(r),
    onError: (e) => events.errors.push(e),
    onHeartbeat: () => events.beats++,
  });
  const ready = (apiVersion = API_VERSION) =>
    bridge.handleMessage({ fk: 1, type: 'ready', payload: { apiVersion, name: 'Test', version: '1' } });
  return { engine, bridge, sent, events, ready };
}

test('CORE-API-02: only ready / error / heartbeat are understood; everything else is ignored', () => {
  for (const type of ['press', 'tick', 'setScore', 'state', 'setSeed', 'gameOver', 'cueResult', '__proto__', 'constructor']) {
    assert.equal(parseFrontendMessage({ fk: 1, type, payload: { score: 99 } }), null, type);
  }
  assert.equal(parseFrontendMessage(null), null);
  assert.equal(parseFrontendMessage('hello'), null);
  assert.equal(parseFrontendMessage({ type: 'ready' }), null, 'missing marker');
  assert.equal(parseFrontendMessage({ fk: 2, type: 'ready' }), null, 'wrong marker');
  assert.equal(parseFrontendMessage({ fk: 1, type: 'heartbeat' }).type, 'heartbeat');
});

test('CORE-API-02: a hostile frontend cannot change seed, score, state or input', () => {
  const { engine, bridge, ready } = setup();
  ready();
  const before = JSON.stringify([engine.seed, engine.state, engine.sim.summary()]);
  for (const type of ['setSeed', 'setScore', 'press', 'state', 'physics', 'gameOver']) {
    bridge.handleMessage({ fk: 1, type, payload: { seed: 'hax', score: 999, state: 'GAME_OVER' } });
  }
  assert.equal(JSON.stringify([engine.seed, engine.state, engine.sim.summary()]), before);
});

test('error payloads are trimmed and typed', () => {
  const { bridge, events, ready } = setup();
  ready();
  bridge.handleMessage({ fk: 1, type: 'error', payload: { message: 'x'.repeat(5000) } });
  assert.equal(events.errors[0].length, 500);
  bridge.handleMessage({ fk: 1, type: 'error', payload: null });
  assert.equal(events.errors[1], '');
});

test('init handshake: ready -> init + settings + state; nothing is sent before ready', () => {
  const { engine, bridge, sent, ready } = setup();
  bridge.sendTick();
  engine.press();
  assert.equal(sent.length, 0, 'silent before ready');
  ready();
  assert.deepEqual(sent.map((m) => m.type), ['init', 'settings', 'state']);
  const init = sent[0].payload;
  assert.equal(init.apiVersion, API_VERSION);
  assert.equal(init.rulebookVersion, RULEBOOK.version);
  assert.equal(init.seed, 'bridge');
  assert.deepEqual(init.canvas, { width: 1024, height: 768 });
});

test('CORE-API-03: unsupported API versions are rejected with a clear message', () => {
  const { bridge, events, sent, ready } = setup();
  ready('2.0');
  assert.equal(events.rejected.length, 1);
  assert.match(events.rejected[0], /needs API 2\.0/);
  assert.equal(sent.length, 0);
  bridge.sendTick();
  assert.equal(sent.length, 0, 'rejected frontends get nothing');
  assert.equal(isApiVersionSupported('1.7'), true);
  assert.equal(isApiVersionSupported('1.0'), true);
  assert.equal(isApiVersionSupported(''), false);
  assert.equal(isApiVersionSupported(undefined), false);
});

test('events are forwarded after ready: state, press, cueResult, gameOver, tick', () => {
  const { engine, bridge, sent, ready } = setup();
  ready();
  sent.length = 0;
  engine.press();
  bridge.sendTick();
  while (engine.state === 'PLAYING') engine.update(8);
  const types = new Set(sent.map((m) => m.type));
  for (const type of ['state', 'press', 'tick', 'cueResult', 'gameOver']) assert.ok(types.has(type), type);
  for (const message of sent) {
    assert.equal(message.fk, 1);
    assert.doesNotThrow(() => structuredClone(message), 'postMessage-safe');
  }
});

test('CORE-API-04: times in payloads are run-relative ms (no wall clock)', () => {
  const { engine, bridge, sent, ready } = setup();
  ready();
  engine.press();
  engine.update(40);
  bridge.sendTick();
  const tick = sent.filter((m) => m.type === 'tick').pop().payload;
  assert.ok(tick.runMs >= 0 && tick.runMs < 1000);
  assert.ok(tick.cues.every((c) => c.targetMs < 1e6 && c.targetMs >= 0));
});

test('sound setting reaches the frontend', () => {
  const { bridge, sent, ready } = setup();
  ready();
  sent.length = 0;
  bridge.setMuted(true);
  assert.deepEqual(sent[0], createMessage('settings', { muted: true }));
});

test('detach stops all forwarding', () => {
  const { engine, bridge, sent, ready } = setup();
  ready();
  bridge.detach();
  sent.length = 0;
  engine.press();
  bridge.sendTick();
  assert.equal(sent.length, 0);
});

test('CORE-SBX-06: watchdog detects a frontend that never starts or stops responding', () => {
  let now = 0;
  const dog = new Watchdog({ timeoutMs: 3000, now: () => now });
  assert.equal(dog.check(), null);
  now = 3001;
  assert.equal(dog.check(), 'no-ready');
  dog.reset();
  dog.markReady();
  now += 2000; dog.beat();
  now += 2000;
  assert.equal(dog.check(), null, 'heartbeat keeps it alive');
  now += 3001;
  assert.equal(dog.check(), 'unresponsive');
});
