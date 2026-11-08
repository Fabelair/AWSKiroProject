/**
 * Test bot: presses at the ideal moments so anyone can watch a skin run without playing.
 * It only calls engine.press(), exactly like a human, so it cannot bend any rule.
 */

import { STATES } from './engine.js';

export class TestBot {
  /**
   * @param {import('./engine.js').GameEngine} engine
   * @param {{ jitterMs?: number, random?: () => number }} [options] jitterMs shifts presses to simulate imperfect timing
   */
  constructor(engine, { jitterMs = 0, random = Math.random } = {}) {
    this.engine = engine;
    this.jitterMs = jitterMs;
    this.random = random;
    this.enabled = false;
    this.nextCueId = 0;
    this.nextPressMs = null;
  }

  /** Call every frame after engine.update. */
  update() {
    const { engine } = this;
    if (!this.enabled) return;
    if (engine.state === STATES.READY) {
      this.nextCueId = 0;
      this.nextPressMs = null;
      engine.press(); // start the run
      return;
    }
    if (engine.state === STATES.GAME_OVER) {
      this.nextPressMs = null;
      engine.press(); // ignored during the lockout, restarts afterwards
      return;
    }
    if (engine.state !== STATES.PLAYING) return;
    const runMs = engine.sim.tick * engine.rules.tickMs;
    if (this.nextPressMs === null) this.#schedule(engine.sim.cueIndex);
    if (runMs >= this.nextPressMs) {
      engine.press();
      this.#schedule(this.nextCueId + 1);
    }
  }

  #schedule(cueId) {
    this.nextCueId = cueId;
    const target = this.engine.sim.timeline.getCue(cueId).targetMs;
    const jitter = this.jitterMs ? (this.random() * 2 - 1) * this.jitterMs : 0;
    this.nextPressMs = target + jitter;
  }
}
