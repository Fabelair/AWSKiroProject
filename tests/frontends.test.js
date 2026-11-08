import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/core/engine.js';
import { FrontendBridge } from '../src/core/bridge.js';
import { Timeline } from '../src/core/timeline.js';
import { RULEBOOK } from '../src/core/rulebook.js';
import { createVmFrontend } from './vm-frontend.js';
import { defaultBundle, guitarBundle } from './helpers.js';
import { themeDefaultBundle } from '../src/frontend/bundles.js';

/** Connects a vm frontend to a real engine through a real bridge. */
function connect(bundle, seed = 'frontend-test') {
  let now = 0;
  const engine = new GameEngine({ seed, clock: () => now });
  let frontend = null;
  const queued = []; // the frontend says `ready` while its script is still loading
  const bridge = new FrontendBridge({
    engine,
    send: (message) => (frontend ? frontend.receive(message) : queued.push(message)),
  });
  frontend = createVmFrontend(bundle, { onSend: (message) => bridge.handleMessage(message) });
  queued.splice(0).forEach((message) => frontend.receive(message));
  const advance = (ticks) => {
    for (let i = 0; i < ticks; i++) {
      now += RULEBOOK.tickMs;
      engine.update(RULEBOOK.tickMs);
      if (i % 2 === 0) { bridge.sendTick(); frontend.frame(); }
    }
  };
  return { engine, bridge, frontend, advance, setNow: (v) => (now = v), getNow: () => now };
}

for (const [label, make] of [['default', defaultBundle], ['guitar-hero', guitarBundle]]) {
  test(`FE-TECH-02 (${label}): sends ready on load and renders once the Core talks to it`, () => {
    const { bridge, frontend } = connect(make());
    assert.equal(bridge.ready, true, 'bridge saw ready');
    bridge.sendTick();
    assert.doesNotThrow(() => frontend.frame());
    assert.ok(frontend.calls.length > 20, 'something was drawn');
  });

  test(`FE-SCR-01 (${label}): READY screen shows the start prompt and the seed`, () => {
    const { bridge, frontend } = connect(make());
    bridge.sendTick();
    frontend.frame();
    assert.ok(frontend.texts.some((t) => /Press Space/i.test(t)), frontend.texts.join('|'));
    assert.ok(frontend.texts.some((t) => t.includes('frontend-test')), 'seed shown');
  });

  test(`FE-PLAY-03 (${label}): the score is always visible while playing`, () => {
    const { engine, frontend, advance } = connect(make());
    engine.press();
    advance(40);
    assert.ok(frontend.texts.some((t) => /score/i.test(t)));
  });

  test(`FE-SCR-03 (${label}): PAUSED screen`, () => {
    const { engine, frontend, advance } = connect(make());
    engine.press();
    advance(10);
    engine.pause();
    frontend.clearRecords();
    advance(4);
    assert.ok(frontend.texts.some((t) => /paused/i.test(t)));
  });

  test(`FE-SCR-04 (${label}): GAME_OVER shows final score, seed and the restart prompt after the lockout`, () => {
    const { engine, frontend, advance, getNow, setNow } = connect(make());
    engine.press();
    while (engine.state === 'PLAYING') advance(2);
    frontend.clearRecords();
    advance(2);
    assert.ok(frontend.texts.some((t) => /over|encore|show over/i.test(t)));
    assert.ok(frontend.texts.some((t) => t.includes('frontend-test')));
    assert.ok(!frontend.texts.some((t) => /restart|encore/i.test(t)), 'no restart prompt during the lockout');
    setNow(getNow() + RULEBOOK.input.gameOverLockoutMs);
    frontend.clearRecords();
    advance(2);
    assert.ok(frontend.texts.some((t) => /restart|encore/i.test(t)), 'restart prompt after the lockout');
  });

  test(`FE-TECH-03 (${label}): unknown messages and missing optional fields are tolerated`, () => {
    const { frontend, bridge } = connect(make());
    assert.doesNotThrow(() => {
      frontend.receive({ type: 'brand-new-message', payload: { x: 1 } });
      frontend.receive({ type: 'tick', payload: { state: 'PLAYING', seed: 's', runMs: 0, score: 0, highScore: 0, ghost: { x: 0.25, y: 0.5 }, pipes: [], cues: [], lockoutRemainingMs: 0 } });
      frontend.receive({ type: 'press', payload: { cueId: null, offsetMs: null, inWindow: false } });
      frontend.receive({ type: 'cueResult', payload: { cueId: 99, result: 'miss' } });
      frontend.receive({ type: 'settings', payload: { muted: true } });
      frontend.frame();
    });
    assert.ok(bridge.ready);
  });

  test(`FE-RULE-02 (${label}): a full perfect run is rendered with a clean 25-cue score`, () => {
    const { engine, frontend, advance } = connect(make());
    const trace = new Timeline('frontend-test').perfectTrace(25);
    let next = 0;
    while (engine.state !== 'GAME_OVER' && engine.sim.cueIndex < 25) {
      while (next < trace.length && trace[next] <= engine.sim.tick) { engine.press(); next++; }
      advance(1);
    }
    advance(2);
    assert.equal(engine.sim.score, 25);
    assert.ok(frontend.texts.some((t) => t.includes('25')), 'score of 25 displayed');
  });
}

test('FE-VIS-06: default HUD text follows "Score: N | High: N"', () => {
  const { engine, frontend, advance } = connect(defaultBundle());
  engine.press();
  advance(10);
  assert.ok(frontend.texts.some((t) => /^Score: \d+ \| High: \d+$/.test(t)), frontend.texts.join('|'));
});

test('FE-VIS-02/03/04/05: default skin draws sky, clouds, pipes with caps and a ghost with two eyes', () => {
  const { engine, frontend, advance } = connect(defaultBundle());
  engine.press();
  advance(20);
  const fills = frontend.calls.filter((c) => c[0] === 'fillRect').length;
  assert.ok(fills >= 5, 'sky + pipe bodies + caps');
  assert.ok(frontend.calls.filter((c) => c[0] === 'arc').length >= 4, 'cloud pills');
  const eyeCalls = frontend.calls.filter((c) => c[0] === 'ellipse').length;
  assert.ok(eyeCalls >= 2 && eyeCalls % 2 === 0, 'two eyes per drawn frame');
  assert.ok(frontend.calls.some((c) => c[0] === 'bezierCurveTo'), 'ghost body');
});

test('FE-VIS-07: the default frontend needs no external assets', () => {
  const files = defaultBundle().files;
  for (const content of Object.values(files)) {
    assert.doesNotMatch(content, /https?:\/\//);
    assert.doesNotMatch(content, /new Image|\.src\s*=/);
  }
});

test('FE-SCR-05: a hit pops "+1" in the default skin', () => {
  const { engine, frontend, advance } = connect(defaultBundle());
  const trace = new Timeline('frontend-test').perfectTrace(3);
  let next = 0;
  while (engine.sim.score < 1) {
    while (next < trace.length && trace[next] <= engine.sim.tick) { engine.press(); next++; }
    advance(1);
  }
  frontend.clearRecords();
  frontend.frame(frontend.nowMs + 16);
  assert.ok(frontend.texts.some((t) => t === '+1'));
});

test('FE-PLAY-04: guitar skin judges presses immediately and outcomes on cueResult', () => {
  const { engine, frontend, advance } = connect(guitarBundle());
  const trace = new Timeline('frontend-test').perfectTrace(2);
  engine.press();
  while (engine.sim.tick < trace[1]) advance(1);
  engine.press();
  advance(2);
  assert.ok(frontend.texts.includes('PERFECT'));
});

test('FE-PLAY-01 (guitar): notes are drawn from the cues before the target moment', () => {
  const { engine, frontend, advance } = connect(guitarBundle());
  engine.press();
  advance(4);
  const circles = frontend.calls.filter((c) => c[0] === 'arc').length;
  assert.ok(circles >= 4, 'note circles are visible');
});

test('CHAT: the offline themed demo keeps the skin working and changes only colours', () => {
  const themed = themeDefaultBundle(defaultBundle(), 'night');
  assert.notEqual(themed.files['main.js'], defaultBundle().files['main.js']);
  const { bridge, frontend } = connect(themed);
  bridge.sendTick();
  assert.doesNotThrow(() => frontend.frame());
  const stripTheme = (s) => s.replace(/const THEME = \{[\s\S]*?\};/, '');
  assert.equal(stripTheme(themed.files['main.js']), stripTheme(defaultBundle().files['main.js']));
});
