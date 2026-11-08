/** Detects a frontend that never starts or stops responding (CORE-SBX-06). */
export class Watchdog {
  constructor({ timeoutMs = 3000, now = () => Date.now() } = {}) {
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.reset();
  }

  /** Start watching a freshly mounted frontend. */
  reset() {
    this.armedAt = this.now();
    this.readyAt = null;
    this.lastBeat = null;
  }

  markReady() {
    this.readyAt = this.now();
    this.lastBeat = this.readyAt;
  }

  beat() {
    this.lastBeat = this.now();
  }

  /** @returns {'no-ready'|'unresponsive'|null} */
  check() {
    const now = this.now();
    if (this.readyAt === null) return now - this.armedAt > this.timeoutMs ? 'no-ready' : null;
    return now - this.lastBeat > this.timeoutMs ? 'unresponsive' : null;
  }
}
