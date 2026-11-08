import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine, STATES } from '../src/core/engine.js';
import { RULEBOOK } from '../src/core/rulebook.js';
import { Timeline } from '../src/core/timeline.js';
import { createScoreBoard, createSafeStore, parseScore } from '../src/core/storage.js';
import { memoryStorage, playTrace } from './helpers.js';

function makeEngine(options = {}) {
  const clock = { now: 0 };
  const engine = new GameEngine({ seed: 'engine', clock: () => clock.now, ...options });
  return { engine, clock };
}

function killPlayer(engine, clock) {
  engine.press();
  let guard = 0;
  while (engine.state === STATES.PLAYING && guard++ < 10000) {
    clock.now += RULEBOOK.tickMs;
    engine.update(RULEBOOK.tickMs);
  }
}

test('CORE-ST-01: READY -> PLAYING -> GAME_OVER -> READY', () => {
  const { engine, clock } = makeEngine();
  const seen = [];
  engine.on('state', ({ state }) => seen.push(state));
  assert.equal(engine.state, STATES.READY);
  killPlayer(engine, clock);
  assert.equal(engine.state, STATES.GAME_OVER);
  clock.now += RULEBOOK.input.gameOverLockoutMs;
  engine.press();
  assert.equal(engine.state, STATES.READY);
  assert.deepEqual(seen, ['PLAYING', 'GAME_OVER', 'READY']);
});

test('CORE-ST-01: invalid transitions are ignored', () => {
  const { engine } = makeEngine();
  engine.pause(); // READY cannot pause
  assert.equal(engine.state, STATES.READY);
  engine.resume();
  assert.equal(engine.state, STATES.READY);
  engine.update(1000); // no time passes in READY
  assert.equal(engine.sim.tick, 0);
});

test('CORE-IN-06: restart is locked out briefly after game over', () => {
  const { engine, clock } = makeEngine();
  killPlayer(engine, clock);
  assert.equal(engine.press(), false);
  assert.equal(engine.state, STATES.GAME_OVER);
  clock.now += RULEBOOK.input.gameOverLockoutMs - 1;
  assert.equal(engine.press(), false);
  assert.equal(engine.state, STATES.GAME_OVER);
  clock.now += 1;
  engine.press();
  assert.equal(engine.state, STATES.READY);
});

test('CORE-SEED-05: seed can only change between runs', () => {
  const { engine, clock } = makeEngine();
  assert.equal(engine.setSeed('new-seed').ok, true);
  assert.equal(engine.seed, 'new-seed');
  engine.press();
  const denied = engine.setSeed('while-playing');
  assert.equal(denied.ok, false);
  assert.equal(engine.seed, 'new-seed');
  engine.pause();
  assert.equal(engine.setSeed('while-paused').ok, false);
  engine.resume();
  while (engine.state === STATES.PLAYING) { engine.update(8); clock.now += 8; }
  assert.equal(engine.setSeed('after-game').ok, true);
  assert.equal(engine.state, STATES.READY);
  assert.equal(engine.setSeed('   ').ok, false);
});

test('CORE-SEED-02: no seed given => a random seed is generated', () => {
  const engine = new GameEngine();
  assert.match(engine.seed, /^kiro-/);
});

test('CORE-PHYS-01: fixed timestep, frame rate independent', () => {
  const run = (frameMs) => {
    const { engine } = makeEngine();
    engine.press();
    for (let elapsed = 0; elapsed < 400; elapsed += frameMs) engine.update(frameMs);
    return engine.sim.tick;
  };
  const at60 = run(16);
  const at30 = run(32);
  const at144 = run(8);
  assert.ok(Math.abs(at60 - at30) <= 2, `${at60} vs ${at30}`);
  assert.ok(Math.abs(at60 - at144) <= 2, `${at60} vs ${at144}`);
});

test('CORE-PHYS-06: huge frame deltas are clamped', () => {
  const { engine } = makeEngine();
  engine.press();
  engine.update(60_000); // e.g. the tab was frozen
  assert.ok(engine.sim.tick <= RULEBOOK.api.maxDeltaMs / RULEBOOK.tickMs + 1);
});

test('CORE-ST-02: pause freezes the run and resume continues exactly', () => {
  const { engine } = makeEngine();
  engine.press();
  engine.update(40);
  const before = JSON.stringify(engine.sim.summary());
  engine.pause();
  assert.equal(engine.state, STATES.PAUSED);
  engine.update(1000);
  assert.equal(JSON.stringify(engine.sim.summary()), before);
  assert.equal(engine.press(), false); // a press while paused only resumes
  assert.equal(engine.state, STATES.PLAYING);
  engine.update(8);
  assert.equal(engine.sim.tick, JSON.parse(before).ticks + 1);
});

test('CORE-IN-07 / CORE-SC-04: run summary has everything needed to replay', () => {
  const { engine, clock } = makeEngine();
  let summary = null;
  engine.on('gameOver', (s) => (summary = s));
  killPlayer(engine, clock);
  for (const key of ['seed', 'rulebookVersion', 'score', 'failCueId', 'failReason', 'durationMs', 'pressTicks']) {
    assert.ok(key in summary, key);
  }
  assert.equal(summary.seed, 'engine');
  assert.equal(summary.rulebookVersion, RULEBOOK.version);
  assert.deepEqual(summary.pressTicks, [0]);
});

test('CORE-SC-01: score = cues passed, reported through cueResult events', () => {
  const { engine } = makeEngine();
  const results = [];
  engine.on('cueResult', (r) => results.push(r));
  const trace = new Timeline('engine').perfectTrace(12);
  playTrace(engine, trace, { stopAfterCues: 12 });
  assert.equal(engine.sim.score, 12);
  assert.equal(results.filter((r) => r.result === 'hit').length, 12);
  assert.ok(results.every((r) => r.offsetMs === 0));
});

test('CORE-SC-03: high score per (version, seed) and overall best, persisted', () => {
  const backend = memoryStorage();
  const board = createScoreBoard(createSafeStore(backend));
  const a = makeEngine({ scoreBoard: board });
  const trace = new Timeline('engine').perfectTrace(6);
  playTrace(a.engine, trace.slice(0, 5)); // dies after a few cues
  const score = a.engine.lastSummary.score;
  assert.ok(score > 0);
  assert.equal(board.getHigh(RULEBOOK.version, 'engine'), score);
  assert.equal(board.getBest(), score);
  // a different seed has its own high score but shares the overall best
  assert.equal(board.getHigh(RULEBOOK.version, 'another'), 0);
  // survives "reload": a new board over the same backend
  const reloaded = createScoreBoard(createSafeStore(backend));
  assert.equal(reloaded.getHigh(RULEBOOK.version, 'engine'), score);
  // a worse run does not lower it
  reloaded.record(RULEBOOK.version, 'engine', 0);
  assert.equal(reloaded.getHigh(RULEBOOK.version, 'engine'), score);
});

test('CORE-SC-03: storage failures fall back to 0 and never throw', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('blocked'); },
  };
  const board = createScoreBoard(createSafeStore(broken));
  assert.equal(board.getHigh('1', 's'), 0);
  assert.doesNotThrow(() => board.record('1', 's', 5));
  const none = createScoreBoard(createSafeStore(null));
  assert.equal(none.getBest(), 0);
  assert.doesNotThrow(() => none.record('1', 's', 5));
});

test('CORE-SC-03: corrupt stored values are ignored', () => {
  assert.equal(parseScore('42'), 42);
  for (const raw of ['abc', '-5', '1e99', '', null, undefined, 'NaN', '3.7x']) {
    assert.equal(parseScore(raw), 0, String(raw));
  }
});

test('CORE-API-01 / CORE-CF-04: every cue is announced >= 1000 ms before its window opens', () => {
  const { engine } = makeEngine();
  const first = engine.snapshot();
  assert.equal(first.state, STATES.READY);
  assert.equal(first.cues[0].id, 0, 'cue 0 is already previewed in READY');
  assert.ok(RULEBOOK.api.lookaheadMs >= 3000);

  const firstSeenMs = new Map(first.cues.map((cue) => [cue.id, 0]));
  const trace = new Timeline('engine').perfectTrace(25);
  let next = 0;
  while (engine.state !== STATES.GAME_OVER && engine.sim.cueIndex < 25) {
    while (next < trace.length && trace[next] <= engine.sim.tick) { engine.press(); next++; }
    engine.update(8);
    const snap = engine.snapshot();
    for (const cue of snap.cues) if (!firstSeenMs.has(cue.id)) firstSeenMs.set(cue.id, snap.runMs);
  }
  assert.equal(engine.sim.score, 25);
  for (let id = 1; id < 24; id++) { // cue 0 is shown in READY for as long as the player wishes
    const view = engine.sim.timeline.getCueView(id);
    assert.ok(firstSeenMs.has(id), `cue ${id} was never announced`);
    assert.ok(view.openMs - firstSeenMs.get(id) >= 1000, `cue ${id} announced only ${view.openMs - firstSeenMs.get(id)} ms ahead`);
  }
});

test('snapshot data is normalized and read-only friendly (plain JSON)', () => {
  const { engine } = makeEngine();
  engine.press();
  engine.update(200);
  const snap = engine.snapshot();
  assert.doesNotThrow(() => structuredClone(snap)); // postMessage safe
  assert.ok(snap.ghost.y > 0 && snap.ghost.y < 1);
  for (const pipe of snap.pipes) {
    assert.ok(pipe.gapY > 0 && pipe.gapY < 1);
    assert.ok(pipe.gapHeight > 0 && pipe.width > 0);
  }
});

test('press event carries timing hint for rhythm-style skins', () => {
  const { engine } = makeEngine();
  const presses = [];
  engine.on('press', (p) => presses.push(p));
  engine.press(); // launch
  const cue = engine.sim.timeline.getCueView(0);
  while (engine.sim.tick * RULEBOOK.tickMs < cue.targetMs) engine.update(8);
  engine.press();
  const info = presses[presses.length - 1];
  assert.equal(info.cueId, 0);
  assert.equal(info.offsetMs, 0);
  assert.equal(info.inWindow, true);
});
