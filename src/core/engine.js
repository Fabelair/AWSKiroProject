/**
 * Game engine: state machine, fixed-timestep loop, seed handling, scoring and events.
 * Independent of the DOM so it can run headless in Node.
 *
 * States: READY -> PLAYING -> GAME_OVER -> READY.  PLAYING <-> PAUSED.
 */

import { RULEBOOK } from './rulebook.js';
import { Simulation } from './simulation.js';
import { normalizeSeed, randomSeed } from './seed.js';
import { pipeCenterX } from './physics.js';

export const STATES = Object.freeze({
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
});

export class GameEngine {
  /**
   * @param {object} options
   * @param {string} [options.seed]
   * @param {ReturnType<import('./storage.js').createScoreBoard>} [options.scoreBoard]
   * @param {() => number} [options.clock] milliseconds
   * @param {typeof RULEBOOK} [options.rules]
   */
  constructor({ seed, scoreBoard = null, clock = () => Date.now(), rules = RULEBOOK } = {}) {
    this.rules = rules;
    this.scoreBoard = scoreBoard;
    this.clock = clock;
    this.listeners = new Map();
    this.state = STATES.READY;
    this.seed = seed ? normalizeSeed(seed).seed ?? randomSeed() : randomSeed();
    this.accumulatorMs = 0;
    this.gameOverAt = 0;
    this.lastSummary = null;
    this.sim = new Simulation(this.seed, rules);
  }

  // ---- events -------------------------------------------------------------------------------

  on(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  #emit(type, payload) {
    for (const listener of this.listeners.get(type) ?? []) listener(payload);
  }

  #setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.#emit('state', { state: next });
  }

  // ---- seed ---------------------------------------------------------------------------------

  /** Changes the seed; only allowed outside a run. */
  setSeed(input) {
    if (this.state !== STATES.READY && this.state !== STATES.GAME_OVER) {
      return { ok: false, error: 'The seed can only be changed between runs.' };
    }
    const result = normalizeSeed(input);
    if (!result.ok) return result;
    this.seed = result.seed;
    this.#resetRun();
    this.#setState(STATES.READY);
    this.#emit('seed', { seed: this.seed });
    return { ok: true, seed: this.seed };
  }

  #resetRun() {
    this.sim = new Simulation(this.seed, this.rules);
    this.accumulatorMs = 0;
    this.lastSummary = null;
  }

  // ---- input --------------------------------------------------------------------------------

  /** The only gameplay input. Returns true when the press had an effect. */
  press() {
    switch (this.state) {
      case STATES.READY:
        this.sim.press(); // the launch press, tick 0
        this.#setState(STATES.PLAYING);
        this.#emit('press', this.#pressInfo());
        return true;
      case STATES.PLAYING:
        if (!this.sim.press()) return false;
        this.#emit('press', this.#pressInfo());
        return true;
      case STATES.GAME_OVER:
        if (this.clock() - this.gameOverAt < this.rules.input.gameOverLockoutMs) return false;
        this.#resetRun();
        this.#setState(STATES.READY);
        return true;
      case STATES.PAUSED:
        this.resume(); // a press only resumes; it does not flap
        return false;
      default:
        return false;
    }
  }

  #pressInfo() {
    const { sim } = this;
    const tickMs = this.rules.tickMs;
    const nearestId = this.#nearestCueId(sim.tick);
    let info = { timestampMs: sim.tick * tickMs, cueId: null, offsetMs: null, inWindow: false };
    if (nearestId !== null) {
      const view = sim.timeline.getCueView(nearestId);
      const offsetMs = sim.tick * tickMs - view.targetMs;
      info = {
        timestampMs: sim.tick * tickMs,
        cueId: nearestId,
        offsetMs,
        inWindow: sim.tick * tickMs >= view.openMs && sim.tick * tickMs <= view.closeMs,
      };
    }
    return info;
  }

  /** Cue whose ideal press is closest to a tick, among the current and next cue. */
  #nearestCueId(tick) {
    const first = this.sim.cueIndex;
    let best = null;
    let bestDistance = Infinity;
    for (let id = Math.max(0, first - 1); id <= first + 1; id++) {
      const distance = Math.abs(this.sim.timeline.getCue(id).pressTick - tick);
      if (distance < bestDistance) {
        best = id;
        bestDistance = distance;
      }
    }
    return bestDistance <= this.rules.timeline.windowSearchTicks ? best : null;
  }

  pause() {
    if (this.state === STATES.PLAYING) this.#setState(STATES.PAUSED);
  }

  resume() {
    if (this.state === STATES.PAUSED) this.#setState(STATES.PLAYING);
  }

  // ---- loop ---------------------------------------------------------------------------------

  /** Feed real elapsed time; the simulation advances in whole fixed ticks. */
  update(deltaMs) {
    if (this.state !== STATES.PLAYING) return;
    this.accumulatorMs += Math.min(Math.max(deltaMs, 0), this.rules.api.maxDeltaMs);
    while (this.accumulatorMs >= this.rules.tickMs && this.state === STATES.PLAYING) {
      this.accumulatorMs -= this.rules.tickMs;
      for (const event of this.sim.step()) this.#emit('cueResult', event);
      if (this.sim.over) this.#finishRun();
    }
  }

  #finishRun() {
    this.gameOverAt = this.clock();
    const summary = this.sim.summary();
    if (this.scoreBoard) {
      const record = this.scoreBoard.record(this.rules.version, this.seed, summary.score);
      summary.highScore = record.high;
      summary.isNewHigh = record.isNewHigh;
    }
    this.lastSummary = summary;
    this.#setState(STATES.GAME_OVER);
    this.#emit('gameOver', summary);
  }

  // ---- read-only views for the frontend ---------------------------------------------------

  highScore() {
    return this.scoreBoard ? this.scoreBoard.getHigh(this.rules.version, this.seed) : 0;
  }

  /** Current-frame data sent to the frontend as a `tick` message. */
  snapshot() {
    const { rules, sim } = this;
    const { width, height } = rules.world;
    const runMs = sim.tick * rules.tickMs;
    const pipeSpan = rules.pipes.width / 2;

    const pipes = [];
    for (let id = Math.max(0, sim.cueIndex - 1); ; id++) {
      const cue = sim.timeline.getCue(id);
      const x = pipeCenterX(cue.crossTick, sim.tick, rules);
      if (x - pipeSpan > width) break;
      if (x + pipeSpan < 0) continue;
      pipes.push({
        id,
        x: x / width,
        gapY: cue.gapY / height,
        gapHeight: rules.pipes.gapHeight / height,
        width: rules.pipes.width / width,
      });
    }

    const cues = [];
    for (let id = Math.max(0, sim.cueIndex - 1); ; id++) {
      const view = sim.timeline.getCueView(id);
      if (view.openMs > runMs + rules.api.lookaheadMs) break;
      if (view.closeMs < runMs - 300) continue;
      cues.push({
        id,
        targetMs: view.targetMs,
        openMs: view.openMs,
        closeMs: view.closeMs,
        crossMs: view.crossMs,
        laneHint: view.laneHint,
      });
    }

    const lockoutRemainingMs =
      this.state === STATES.GAME_OVER
        ? Math.max(0, rules.input.gameOverLockoutMs - (this.clock() - this.gameOverAt))
        : 0;

    return {
      state: this.state,
      seed: this.seed,
      runMs,
      score: sim.score,
      highScore: Math.max(this.highScore(), sim.score),
      bestOverall: this.scoreBoard ? this.scoreBoard.getBest() : 0,
      ghost: { x: rules.ghost.x / width, y: sim.ghost.y / height, vy: sim.ghost.vy / height },
      pipes,
      cues,
      lockoutRemainingMs,
    };
  }
}
