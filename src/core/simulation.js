/**
 * Headless run simulation: the authority for pass/fail and score.
 * It never touches the DOM or the clock; it only counts ticks.
 */

import { RULEBOOK } from './rulebook.js';
import { Timeline } from './timeline.js';
import { createGhost, stepGhost, evaluateTick } from './physics.js';

export class Simulation {
  /**
   * @param {string} seed
   * @param {typeof RULEBOOK} [rules]
   * @param {Timeline} [timeline] reuse an existing timeline for the same seed
   */
  constructor(seed, rules = RULEBOOK, timeline = new Timeline(seed, rules)) {
    this.seed = String(seed);
    this.rules = rules;
    this.timeline = timeline;
    this.tick = 0;
    this.ghost = createGhost(rules);
    this.score = 0;
    /** Index of the next cue that has not been passed yet. */
    this.cueIndex = 0;
    this.over = false;
    /** @type {null | {reason:'bounds'|'pipe', cueId:number}} */
    this.failure = null;
    this.pendingFlap = false;
    /** Ticks at which a press was applied (the input trace). */
    this.pressTicks = [];
  }

  /** Registers a press that will be applied on the next tick. */
  press() {
    if (this.over) return false;
    this.pendingFlap = true;
    if (this.pressTicks[this.pressTicks.length - 1] !== this.tick) this.pressTicks.push(this.tick);
    return true;
  }

  /**
   * Advances one tick.
   * @returns {Array<{type:'cueResult', cueId:number, result:'hit'|'miss', offsetMs:number|null}>}
   */
  step() {
    if (this.over) return [];
    stepGhost(this.ghost, this.pendingFlap, this.rules);
    this.pendingFlap = false;
    this.tick += 1;

    const cue = this.timeline.getCue(this.cueIndex);
    const verdict = evaluateTick(this.ghost, cue, this.tick, this.rules);
    if (verdict === 'passed') {
      this.score += this.rules.scoring.pointsPerCue;
      this.cueIndex += 1;
      return [this.#cueResult(cue, 'hit')];
    }
    if (verdict === 'bounds' || verdict === 'pipe') {
      this.over = true;
      this.failure = { reason: verdict, cueId: cue.id };
      return [this.#cueResult(cue, 'miss')];
    }
    return [];
  }

  #cueResult(cue, result) {
    return { type: 'cueResult', cueId: cue.id, result, offsetMs: this.offsetFor(cue) };
  }

  /** Offset (ms) of the player's press closest to the cue's ideal press, or null if none is near. */
  offsetFor(cue) {
    const search = this.rules.timeline.windowSearchTicks;
    let best = null;
    for (const tick of this.pressTicks) {
      const diff = tick - cue.pressTick;
      if (Math.abs(diff) <= search && (best === null || Math.abs(diff) < Math.abs(best))) best = diff;
    }
    return best === null ? null : best * this.rules.tickMs;
  }

  summary() {
    return {
      seed: this.seed,
      rulebookVersion: this.rules.version,
      score: this.score,
      failCueId: this.failure ? this.failure.cueId : null,
      failReason: this.failure ? this.failure.reason : null,
      durationMs: this.tick * this.rules.tickMs,
      ticks: this.tick,
      pressTicks: [...this.pressTicks],
    };
  }
}

/**
 * Replays an input trace headlessly (used by tests, conformance checks and replays).
 * @param {string} seed
 * @param {number[]} pressTicks ascending tick numbers at which a press happens
 * @param {{rules?: typeof RULEBOOK, stopAfterCues?: number, extraTicks?: number}} [options]
 */
export function replay(seed, pressTicks, options = {}) {
  const rules = options.rules ?? RULEBOOK;
  const sim = new Simulation(seed, rules);
  const last = pressTicks.length ? pressTicks[pressTicks.length - 1] : 0;
  const maxTicks = last + (options.extraTicks ?? 600);
  let next = 0;
  while (!sim.over && sim.tick < maxTicks) {
    while (next < pressTicks.length && pressTicks[next] <= sim.tick) {
      sim.press();
      next++;
    }
    sim.step();
    if (options.stopAfterCues !== undefined && sim.cueIndex >= options.stopAfterCues) break;
  }
  return sim.summary();
}
