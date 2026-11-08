/**
 * Declines requests that try to change the rules (CHAT-07). The AI is also told to decline,
 * but this check works without any AI call and gives a friendly answer straight away.
 */

const RULE_CHANGE_PATTERNS = [
  /\b(easier|harder|more difficult|less difficult|difficulty)\b/i,
  /\b(bigger|larger|wider|smaller|narrower|taller|shorter)\s+(gap|gaps|hitbox|hit box|window|windows)\b/i,
  /\b(gaps?|hit ?box(es)?|hit windows?|timing windows?)\b.{0,25}\b(bigger|larger|wider|smaller|narrower|taller|shorter|longer)\b/i,
  /\b(bigger|larger|wider|smaller|narrower|longer|shorter)\s+(hit|timing)\s*(box|window)/i,
  /\b(change|increase|decrease|reduce|raise|lower|adjust|tweak|remove)\b.{0,30}\b(gravity|physics|hitbox|hit box|hit window|timing|tolerance|scoring|collision)\b/i,
  /\b(gravity|physics|collision|hitbox|hit window|scoring)\b.{0,30}\b(change|increase|decrease|different|lighter|heavier)\b/i,
  /\b(slower|faster|slow down|speed up)\s+(pipes|scroll|scrolling|game|gameplay)\b/i,
  /\b(invincible|invincibility|god ?mode|no collision|can'?t die|never die|auto ?-?play|cheat|infinite lives|extra lives)\b/i,
  /\b(double|triple|extra|more|less)\s+(points|score)\b/i,
  /\b(different|new|change the)\s+(button|key|input|controls?)\b/i,
];

const SUGGESTION =
  'Gameplay (timing, physics, difficulty, scoring, seeds and input) is protected so every skin plays ' +
  'exactly the same. I can change how the game looks and sounds instead: theme, characters, ' +
  'backgrounds, animations, HUD, effects. What would you like it to look like?';

/**
 * @param {string} prompt
 * @returns {{ declined: boolean, message?: string }}
 */
export function checkRuleChangeRequest(prompt) {
  const text = String(prompt ?? '');
  if (RULE_CHANGE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { declined: true, message: SUGGESTION };
  }
  return { declined: false };
}
