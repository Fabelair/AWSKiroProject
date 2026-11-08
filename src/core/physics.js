/**
 * Reference physics. Pure functions, no DOM, deterministic (only + - * / and comparisons).
 * Time is counted in ticks (RULEBOOK.tickMs each).
 */

/** Creates the ghost state at the start of a run. */
export function createGhost(rules) {
  return { y: rules.ghost.startY, vy: 0 };
}

/**
 * Advances the ghost by one tick. A flap replaces the vertical speed with the flap speed.
 * @param {{y:number, vy:number}} ghost mutated in place
 * @param {boolean} flap
 */
export function stepGhost(ghost, flap, rules) {
  const dt = rules.tickMs / 1000;
  if (flap) ghost.vy = -rules.ghost.flapSpeed;
  ghost.vy += rules.ghost.gravity * dt;
  ghost.y += ghost.vy * dt;
}

/** True when the ghost box leaves the world (ceiling or floor). */
export function isOutOfBounds(ghost, rules) {
  return (
    ghost.y - rules.ghost.halfHeight < 0 ||
    ghost.y + rules.ghost.halfHeight > rules.world.height
  );
}

/** Horizontal centre of a pipe at a given tick. */
export function pipeCenterX(crossTick, tick, rules) {
  return rules.ghost.x + (crossTick - tick) * (rules.tickMs / 1000) * rules.pipes.speed;
}

/** True while the pipe column horizontally overlaps the ghost box. */
export function overlapsPipeColumn(crossTick, tick, rules) {
  const reach = rules.pipes.width / 2 + rules.ghost.halfWidth;
  return Math.abs(pipeCenterX(crossTick, tick, rules) - rules.ghost.x) < reach;
}

/** True once the pipe is completely behind the ghost. */
export function hasPassedPipe(crossTick, tick, rules) {
  const reach = rules.pipes.width / 2 + rules.ghost.halfWidth;
  return pipeCenterX(crossTick, tick, rules) < rules.ghost.x - reach;
}

/** True when the ghost box touches the solid part of the pipe pair. */
export function hitsPipe(ghost, cue, tick, rules) {
  if (!overlapsPipeColumn(cue.crossTick, tick, rules)) return false;
  const gapTop = cue.gapY - rules.pipes.gapHeight / 2;
  const gapBottom = cue.gapY + rules.pipes.gapHeight / 2;
  return (
    ghost.y - rules.ghost.halfHeight < gapTop || ghost.y + rules.ghost.halfHeight > gapBottom
  );
}

/**
 * Judges the world after a tick. Shared by the live simulation and the window computation
 * so both always agree.
 * @returns {'ok'|'bounds'|'pipe'|'passed'}
 */
export function evaluateTick(ghost, cue, tick, rules) {
  if (isOutOfBounds(ghost, rules)) return 'bounds';
  if (cue) {
    if (hitsPipe(ghost, cue, tick, rules)) return 'pipe';
    if (hasPassedPipe(cue.crossTick, tick, rules)) return 'passed';
  }
  return 'ok';
}

/** Number of ticks a pipe overlaps the ghost column on each side of its crossing. */
export function passTicks(rules) {
  const reach = rules.pipes.width / 2 + rules.ghost.halfWidth;
  return Math.floor(reach / ((rules.tickMs / 1000) * rules.pipes.speed));
}
