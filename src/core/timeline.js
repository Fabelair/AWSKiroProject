/**
 * Seed -> timeline of cues.
 *
 * The timeline is built from an "ideal" flap schedule: flap times are picked with the seeded
 * RNG, the reference physics is run along that schedule, and a pipe gap is centred on the ghost
 * at the moment it crosses. Therefore every timeline is reachable by construction.
 *
 * A cue is one required press. Its hit window is not guessed: it is measured by re-running the
 * physics with that single press shifted earlier/later (see getWindow).
 */

import { RULEBOOK } from './rulebook.js';
import { createRng } from './rng.js';
import { stepGhost, isOutOfBounds, hitsPipe, passTicks } from './physics.js';

export class Timeline {
  /**
   * @param {string} seed
   * @param {typeof RULEBOOK} [rules]
   */
  constructor(seed, rules = RULEBOOK) {
    this.seed = String(seed);
    this.rules = rules;
    this.rng = createRng(this.seed);
    /** State of the ideal ghost just before each ideal press (press 0 is the launch). */
    this.pressSnaps = [{ tick: 0, y: rules.ghost.startY, vy: 0 }];
    this.cues = [];
    this.windows = new Map();
  }

  /** Runs the ideal ghost: flap at the snapshot, then step `ticks` ticks. */
  #simulateFlap(snap, ticks) {
    const ghost = { y: snap.y, vy: snap.vy };
    for (let i = 0; i < ticks; i++) stepGhost(ghost, i === 0, this.rules);
    return { tick: snap.tick + ticks, y: ghost.y, vy: ghost.vy };
  }

  #pickNextSnap(snap) {
    const t = this.rules.timeline;
    for (let attempt = 0; attempt < t.maxPickAttempts; attempt++) {
      const interval = this.rng.int(t.minIntervalTicks, t.maxIntervalTicks);
      const next = this.#simulateFlap(snap, interval);
      if (next.y >= t.pressYMin && next.y <= t.pressYMax) return next;
    }
    return this.#simulateFlap(snap, t.fallbackIntervalTicks);
  }

  #ensureSnap(index) {
    while (this.pressSnaps.length <= index) {
      this.pressSnaps.push(this.#pickNextSnap(this.pressSnaps[this.pressSnaps.length - 1]));
    }
  }

  /**
   * Cue `index` is satisfied by ideal press `index + 1` (press 0 is the automatic launch).
   * @returns {{id:number, pressTick:number, crossTick:number, gapY:number,
   *            targetMs:number, crossMs:number, laneHint:number}}
   */
  getCue(index) {
    while (this.cues.length <= index) this.#buildCue(this.cues.length);
    return this.cues[index];
  }

  #buildCue(id) {
    const { rules } = this;
    this.#ensureSnap(id + 1);
    const pressSnap = this.pressSnaps[id + 1];
    const atCrossing = this.#simulateFlap(pressSnap, rules.pipes.crossDelayTicks);
    const crossTick = pressSnap.tick + rules.pipes.crossDelayTicks;
    this.cues.push({
      id,
      pressTick: pressSnap.tick,
      crossTick,
      gapY: atCrossing.y,
      targetMs: pressSnap.tick * rules.tickMs,
      crossMs: crossTick * rules.tickMs,
      laneHint: atCrossing.y / rules.world.height,
    });
  }

  /** The first `count` cues, without running the game. */
  getCues(count) {
    return Array.from({ length: count }, (_, i) => this.getCue(i));
  }

  /** Ideal press ticks for a perfect run: launch at 0, then one press per cue. */
  perfectTrace(cueCount) {
    this.getCue(cueCount - 1);
    return [0, ...this.cues.slice(0, cueCount).map((cue) => cue.pressTick)];
  }

  /**
   * Measures the hit window of a cue: how many ticks its press may be early/late while this
   * cue and the next `followUpCues` cues are still passed (all other presses ideal).
   * @returns {{minOffsetTicks:number, maxOffsetTicks:number}}
   */
  getWindowTicks(index) {
    if (this.windows.has(index)) return this.windows.get(index);
    const t = this.rules.timeline;
    let min = 0;
    let max = 0;
    while (min > -t.windowSearchTicks && this.#passesWithShift(index, min - 1)) min--;
    while (max < t.windowSearchTicks && this.#passesWithShift(index, max + 1)) max++;
    const result = { minOffsetTicks: min, maxOffsetTicks: max };
    this.windows.set(index, result);
    return result;
  }

  /** Cue plus its measured window in ms. */
  getCueView(index) {
    const cue = this.getCue(index);
    const { minOffsetTicks, maxOffsetTicks } = this.getWindowTicks(index);
    const { tickMs } = this.rules;
    return {
      ...cue,
      openMs: cue.targetMs + minOffsetTicks * tickMs,
      closeMs: cue.targetMs + maxOffsetTicks * tickMs,
    };
  }

  #passesWithShift(index, shiftTicks) {
    const { rules } = this;
    const lastCueId = index + rules.timeline.followUpCues;
    this.getCue(lastCueId);
    this.#ensureSnap(lastCueId + 1);

    const firstCueId = Math.max(0, index - 1);
    const start = this.pressSnaps[index];
    const flapTicks = new Set();
    for (let press = index; press <= lastCueId + 1; press++) {
      flapTicks.add(this.pressSnaps[press].tick + (press === index + 1 ? shiftTicks : 0));
    }
    const lastCue = this.cues[lastCueId];
    const endTick = lastCue.crossTick + passTicks(rules) + 1;

    const ghost = { y: start.y, vy: start.vy };
    for (let tick = start.tick; tick < endTick; tick++) {
      stepGhost(ghost, flapTicks.has(tick), rules);
      const now = tick + 1;
      if (isOutOfBounds(ghost, rules)) return false;
      for (let id = firstCueId; id <= lastCueId; id++) {
        if (hitsPipe(ghost, this.cues[id], now, rules)) return false;
      }
    }
    return true;
  }
}
