import test from 'node:test';
import assert from 'node:assert/strict';
import { RULEBOOK } from '../src/core/rulebook.js';
import { Timeline } from '../src/core/timeline.js';
import { Simulation, replay } from '../src/core/simulation.js';
import { passTicks } from '../src/core/physics.js';

const SEEDS = ['kiro', 'a', 'b', '12345', 'Flappy Kiro!', 'seed-with-ünïcode', 'x'.repeat(64)];

test('CORE-TL-01/CORE-SEED-07: same seed => identical timeline, any number of times', () => {
  for (const seed of SEEDS) {
    const first = new Timeline(seed).getCues(80);
    const second = new Timeline(seed).getCues(80);
    assert.deepEqual(first, second);
  }
});

test('CORE-TL-01: lazily generated timeline equals eagerly generated one (order independent)', () => {
  const lazy = new Timeline('lazy');
  lazy.getCue(5);
  lazy.getCue(30);
  const eager = new Timeline('lazy').getCues(31);
  assert.deepEqual(lazy.getCues(31), eager);
});

test('CORE-TL-01: different seeds give different timelines', () => {
  const a = JSON.stringify(new Timeline('one').getCues(10));
  const b = JSON.stringify(new Timeline('two').getCues(10));
  assert.notEqual(a, b);
});

test('CORE-TL-02: cue fields are present and consistent', () => {
  const tl = new Timeline('fields');
  const cue = tl.getCueView(3);
  for (const key of ['id', 'pressTick', 'crossTick', 'gapY', 'targetMs', 'crossMs', 'laneHint', 'openMs', 'closeMs']) {
    assert.ok(key in cue, key);
  }
  assert.equal(cue.id, 3);
  assert.equal(cue.targetMs, cue.pressTick * RULEBOOK.tickMs);
  assert.equal(cue.crossMs, (cue.pressTick + RULEBOOK.pipes.crossDelayTicks) * RULEBOOK.tickMs);
  assert.ok(cue.openMs <= cue.targetMs && cue.targetMs <= cue.closeMs);
  assert.ok(cue.laneHint > 0 && cue.laneHint < 1);
});

test('CORE-TL-03: spacing and gap positions respect the rulebook', () => {
  const t = RULEBOOK.timeline;
  for (const seed of SEEDS) {
    const cues = new Timeline(seed).getCues(150);
    for (let i = 1; i < cues.length; i++) {
      const interval = cues[i].pressTick - cues[i - 1].pressTick;
      assert.ok(interval >= t.minIntervalTicks && interval <= t.maxIntervalTicks, `${seed} cue ${i}: ${interval}`);
    }
    for (const cue of cues) {
      assert.ok(cue.gapY - RULEBOOK.pipes.gapHeight / 2 >= 0, 'gap top inside world');
      assert.ok(cue.gapY + RULEBOOK.pipes.gapHeight / 2 <= RULEBOOK.world.height, 'gap bottom inside world');
    }
  }
});

test('CORE-TL-04: every timeline is reachable (perfect play passes 200 cues, 40 seeds)', () => {
  for (let i = 0; i < 40; i++) {
    const seed = `reach-${i}`;
    const trace = new Timeline(seed).perfectTrace(200);
    const summary = replay(seed, trace, { stopAfterCues: 200 });
    assert.equal(summary.score, 200, `${seed} failed at cue ${summary.failCueId}`);
    assert.equal(summary.failReason, null);
  }
});

test('CORE-TL-05: cues can be produced without running the game', () => {
  const cues = new Timeline('preview').getCues(5);
  assert.equal(cues.length, 5);
});

test('hit windows contain the ideal press and are neither empty nor huge', () => {
  const tl = new Timeline('windows');
  const searchMs = RULEBOOK.timeline.windowSearchTicks * RULEBOOK.tickMs;
  for (let i = 0; i < 60; i++) {
    const view = tl.getCueView(i);
    assert.ok(view.openMs < view.targetMs && view.closeMs > view.targetMs, `cue ${i} window is one-sided`);
    const width = view.closeMs - view.openMs;
    assert.ok(width >= 80, `cue ${i} window too narrow: ${width}`);
    assert.ok(width < searchMs * 2, `cue ${i} window hit the search limit`);
  }
});

test('CORE-IN-03: pressing at the window edges passes; one tick outside fails (cue-local)', () => {
  const seed = 'edges';
  const tl = new Timeline(seed);
  for (const cueId of [0, 1, 2, 7, 15]) {
    const { minOffsetTicks, maxOffsetTicks } = tl.getWindowTicks(cueId);
    const base = tl.perfectTrace(cueId + 1 + RULEBOOK.timeline.followUpCues + 1);
    const pressIndex = cueId + 1;
    const shifted = (delta) => base.map((tick, i) => (i === pressIndex ? tick + delta : tick));
    const stop = cueId + 1 + RULEBOOK.timeline.followUpCues;
    for (const edge of [minOffsetTicks, maxOffsetTicks, 0]) {
      const result = replay(seed, shifted(edge), { stopAfterCues: stop });
      assert.equal(result.failCueId, null, `cue ${cueId} offset ${edge} should pass`);
    }
    for (const edge of [minOffsetTicks - 1, maxOffsetTicks + 1]) {
      const result = replay(seed, shifted(edge), { stopAfterCues: stop });
      assert.notEqual(result.failCueId, null, `cue ${cueId} offset ${edge} should fail`);
    }
  }
});

test('CORE-IN-03: idle, spamming, early and late players fail', () => {
  assert.notEqual(replay('kiro', [0]).failCueId, null, 'idle');
  const spam = replay('kiro', Array.from({ length: 300 }, (_, i) => i * 3));
  assert.notEqual(spam.failCueId, null, 'spam');
  const trace = new Timeline('kiro').perfectTrace(30);
  const late = trace.map((t, i) => (i === 0 ? t : t + 60));
  const early = trace.map((t, i) => (i === 0 ? t : t - 60));
  assert.notEqual(replay('kiro', late, { stopAfterCues: 30 }).failCueId, null, 'late');
  assert.notEqual(replay('kiro', early, { stopAfterCues: 30 }).failCueId, null, 'early');
});

test('score counts passed cues; failure is reported on the cue being attempted', () => {
  const tl = new Timeline('score');
  const trace = tl.perfectTrace(10);
  const summary = replay('score', trace.slice(0, 6)); // stops pressing after cue 4's press
  assert.equal(summary.score, 5);
  assert.equal(summary.failCueId, 5);
  assert.ok(['pipe', 'bounds'].includes(summary.failReason));
});

test('CORE-IN-07: the simulation records its input trace; a held tick counts once', () => {
  const sim = new Simulation('trace');
  sim.press();
  sim.press();
  sim.step();
  sim.press();
  assert.deepEqual(sim.pressTicks, [0, 1]);
});

test('CORE-CF-03: replaying a stored trace reproduces the same summary', () => {
  const trace = new Timeline('replay').perfectTrace(40).map((t, i) => (i % 5 === 3 ? t + 3 : t));
  const first = replay('replay', trace, { stopAfterCues: 40 });
  const second = replay('replay', first.pressTicks, { stopAfterCues: 40 });
  assert.deepEqual(first, second);
});

test('golden run: known seed gives known result (detects accidental physics changes)', () => {
  const tl = new Timeline('golden');
  assert.deepEqual(tl.getCues(3).map((c) => [c.pressTick, Math.round(c.gapY * 1000) / 1000]), [[149, 300.16], [325, 437.018], [449, 347.738]]);
  const summary = replay('golden', tl.perfectTrace(10), { stopAfterCues: 10 });
  assert.equal(summary.score, 10);
  assert.equal(summary.durationMs, 12528);
});

test('cue 0 is previewed at least 1000 ms before its window opens (a run needs a start)', () => {
  const view = new Timeline('lead').getCueView(0);
  assert.ok(view.crossMs - RULEBOOK.tickMs * passTicks(RULEBOOK) > 0);
});

test('finished simulation ignores further input', () => {
  const sim = new Simulation('over');
  sim.press();
  while (!sim.over) sim.step();
  assert.equal(sim.press(), false);
  assert.deepEqual(sim.step(), []);
});
