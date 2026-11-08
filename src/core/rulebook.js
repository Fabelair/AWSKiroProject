/**
 * Rulebook constants: the single source of truth for gameplay.
 * Nothing in here may be changed by a frontend, by the chat, or by an AI.
 * Any change MUST bump RULEBOOK_VERSION (a unit test enforces this).
 */

export const RULEBOOK_VERSION = '1.0.0';

function deepFreeze(object) {
  for (const value of Object.values(object)) {
    if (value && typeof value === 'object') deepFreeze(value);
  }
  return Object.freeze(object);
}

export const RULEBOOK = deepFreeze({
  version: RULEBOOK_VERSION,
  /** Fixed simulation step in ms (125 Hz). All gameplay time is a whole number of ticks. */
  tickMs: 8,
  world: { width: 1024, height: 768 },
  ghost: {
    x: 256, // px, fixed horizontal position
    startY: 460, // px
    halfWidth: 18, // px, forgiving hitbox
    halfHeight: 18, // px
    gravity: 900, // px/s^2
    flapSpeed: 540, // px/s, upward speed set by a flap
  },
  pipes: {
    width: 76, // px
    speed: 200, // px/s
    gapHeight: 220, // px
    crossDelayTicks: 75, // ticks between a cue's ideal press and its pipe crossing the ghost
  },
  timeline: {
    minIntervalTicks: 112, // 896 ms between ideal presses
    maxIntervalTicks: 188, // 1504 ms
    fallbackIntervalTicks: 150, // 1200 ms, always keeps the ghost in bounds
    pressYMin: 300, // px, allowed ghost height at each ideal press
    pressYMax: 620, // px
    maxPickAttempts: 8,
    windowSearchTicks: 60, // how far a press may be shifted when computing a hit window
    followUpCues: 2, // cues after the shifted one that must still pass
  },
  scoring: { pointsPerCue: 1 },
  input: { gameOverLockoutMs: 400 },
  api: {
    lookaheadMs: 4000, // upcoming cues sent to the frontend (requirement: at least 3000)
    maxDeltaMs: 50, // clamp for a single frame's delta time
  },
});
