// Guitar Kiro: a Guitar Hero style skin for Flappy Kiro.
// Cues become notes sliding down a highway; pressing the single button on the target line is
// exactly the same input as pressing at the pipe gap in the default skin.
// All results (hit / miss / score) come from the Core; this file only draws them.

const WORLD_WIDTH = 1024;
const WORLD_HEIGHT = 768;
const LANE_COLORS = ['#2ecc71', '#e74c3c', '#f1c40f', '#3498db', '#e67e22'];
const HIGHWAY_LEFT = 292;
const HIGHWAY_WIDTH = 440;
const LANE_WIDTH = HIGHWAY_WIDTH / LANE_COLORS.length;
const HIGHWAY_TOP = 70;
const TARGET_Y = 640;
const VISIBLE_AHEAD_MS = 2600; // notes appear well before their window opens
const NOTE_RADIUS = 26;
const FEEDBACK_MS = 700;
const PERFECT_MS = 40;

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

let latest = null;
let state = 'READY';
let seed = '';
let muted = false;
let combo = 0;
let bestCombo = 0;
let feedback = null; // { text, color, at }
let missFlash = null; // { lane, at }
const laneById = {}; // remembers each cue's lane, because the cue leaves the list before its result arrives
let strumAt = -Infinity;
let audioContext = null;

function pxPerMs() {
  return (TARGET_Y - HIGHWAY_TOP) / VISIBLE_AHEAD_MS;
}

function laneOf(cue) {
  return Math.min(LANE_COLORS.length - 1, Math.max(0, Math.floor(cue.laneHint * LANE_COLORS.length)));
}

function beep(frequency, seconds, type) {
  if (muted) return;
  try {
    audioContext = audioContext || new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.07, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + seconds);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + seconds);
  } catch (error) {
    /* sound is optional */
  }
}

FK.onMessage((type, payload) => {
  const now = performance.now();
  if (type === 'init') seed = payload.seed;
  else if (type === 'state') {
    state = payload.state;
    if (state === 'READY') combo = 0;
  } else if (type === 'tick') {
    latest = payload;
    state = payload.state;
    seed = payload.seed;
    for (const cue of payload.cues) laneById[cue.id] = laneOf(cue);
  } else if (type === 'press') {
    strumAt = now;
    beep(330, 0.12, 'sawtooth');
    if (payload.cueId === null) feedback = { text: 'STRAY STRUM', color: '#bbbbbb', at: now };
    else if (Math.abs(payload.offsetMs) <= PERFECT_MS) feedback = { text: 'PERFECT', color: '#f9e04b', at: now };
    else if (payload.inWindow) feedback = { text: payload.offsetMs < 0 ? 'GOOD (early)' : 'GOOD (late)', color: '#7bed9f', at: now };
    else feedback = { text: payload.offsetMs < 0 ? 'TOO EARLY' : 'TOO LATE', color: '#ff7675', at: now };
  } else if (type === 'cueResult') {
    if (payload.result === 'hit') {
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
    } else {
      combo = 0;
      missFlash = { lane: laneById[payload.cueId] ?? 2, at: now };
      beep(110, 0.3, 'square');
    }
  } else if (type === 'settings') muted = payload.muted;
});

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(canvas.width / WORLD_WIDTH, 0, 0, canvas.height / WORLD_HEIGHT, 0, 0);
}

function text(value, x, y, size, color = '#ffffff', align = 'center') {
  ctx.font = `bold ${size}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function drawBackground(nowMs) {
  const gradient = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  gradient.addColorStop(0, '#1a0f3c');
  gradient.addColorStop(1, '#0b0714');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  // slow, gentle stage lights (no fast flashing)
  for (let i = 0; i < 3; i++) {
    const x = 160 + i * 350 + Math.sin(nowMs / 2500 + i) * 40;
    ctx.fillStyle = `rgba(255, 255, 255, 0.04)`;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 90, 420);
    ctx.lineTo(x + 90, 420);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHighway(nowMs) {
  ctx.fillStyle = '#14101f';
  ctx.fillRect(HIGHWAY_LEFT, HIGHWAY_TOP, HIGHWAY_WIDTH, WORLD_HEIGHT - HIGHWAY_TOP);
  for (let lane = 0; lane < LANE_COLORS.length; lane++) {
    ctx.fillStyle = `${LANE_COLORS[lane]}18`;
    ctx.fillRect(HIGHWAY_LEFT + lane * LANE_WIDTH, HIGHWAY_TOP, LANE_WIDTH, WORLD_HEIGHT - HIGHWAY_TOP);
    ctx.strokeStyle = '#2a2340';
    ctx.strokeRect(HIGHWAY_LEFT + lane * LANE_WIDTH, HIGHWAY_TOP, LANE_WIDTH, WORLD_HEIGHT - HIGHWAY_TOP);
  }
  // target line
  const strumGlow = Math.max(0, 1 - (nowMs - strumAt) / 160);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + 0.5 * strumGlow})`;
  ctx.fillRect(HIGHWAY_LEFT, TARGET_Y - 3, HIGHWAY_WIDTH, 6);
  for (let lane = 0; lane < LANE_COLORS.length; lane++) {
    const cx = HIGHWAY_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
    ctx.strokeStyle = LANE_COLORS[lane];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, TARGET_Y, NOTE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    if (strumGlow > 0) {
      ctx.fillStyle = `${LANE_COLORS[lane]}55`;
      ctx.fill();
    }
  }
  ctx.lineWidth = 1;
}

function drawNotes(nowMs) {
  if (!latest) return;
  const runMs = latest.runMs;
  for (const cue of latest.cues) {
    const lane = laneOf(cue);
    const cx = HIGHWAY_LEFT + lane * LANE_WIDTH + LANE_WIDTH / 2;
    const y = TARGET_Y - (cue.targetMs - runMs) * pxPerMs();
    const windowTop = TARGET_Y - (cue.closeMs - runMs) * pxPerMs();
    const windowBottom = TARGET_Y - (cue.openMs - runMs) * pxPerMs();
    if (windowBottom < HIGHWAY_TOP - 40 || windowTop > WORLD_HEIGHT) continue;
    // the timing window: press while the note is inside this band
    ctx.fillStyle = `${LANE_COLORS[lane]}30`;
    ctx.fillRect(cx - LANE_WIDTH / 2 + 4, windowTop, LANE_WIDTH - 8, windowBottom - windowTop);
    // the note
    ctx.fillStyle = LANE_COLORS[lane];
    ctx.beginPath();
    ctx.arc(cx, y, NOTE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffffaa';
    ctx.beginPath();
    ctx.arc(cx - 7, y - 7, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (missFlash && nowMs - missFlash.at < 400) {
    ctx.fillStyle = `rgba(255, 70, 70, ${0.35 * (1 - (nowMs - missFlash.at) / 400)})`;
    ctx.fillRect(HIGHWAY_LEFT + missFlash.lane * LANE_WIDTH, HIGHWAY_TOP, LANE_WIDTH, WORLD_HEIGHT - HIGHWAY_TOP);
  }
}

// Meter on the left: shows where the ghost is and where the next gap is. Honest view of the Core's physics.
function drawEnergyMeter() {
  if (!latest) return;
  const x = 120;
  const y0 = HIGHWAY_TOP;
  const height = WORLD_HEIGHT - HIGHWAY_TOP - 60;
  ctx.fillStyle = '#14101f';
  ctx.fillRect(x - 24, y0, 48, height);
  const nextPipe = latest.pipes.find((pipe) => pipe.x + pipe.width / 2 > latest.ghost.x - 0.04);
  if (nextPipe) {
    ctx.fillStyle = '#2ecc7155';
    const gapTop = (nextPipe.gapY - nextPipe.gapHeight / 2) * height;
    ctx.fillRect(x - 24, y0 + gapTop, 48, nextPipe.gapHeight * height);
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y0 + latest.ghost.y * height, 10, 0, Math.PI * 2);
  ctx.fill();
  text('STAGE', x, y0 - 12, 18, '#9b8fd1');
  text('Keep the dot in', x, y0 + height + 24, 15, '#9b8fd1');
  text('the green zone', x, y0 + height + 42, 15, '#9b8fd1');
}

function drawHud(nowMs) {
  if (!latest) return;
  text(`SCORE ${latest.score}`, 820, 130, 34, '#ffffff', 'left');
  text(`HIGH ${latest.highScore}`, 820, 170, 24, '#9b8fd1', 'left');
  text(`COMBO ${combo}`, 820, 230, 30, combo >= 5 ? '#f9e04b' : '#ffffff', 'left');
  text(`SEED ${seed}`, 820, 740, 18, '#6e6490', 'left');
  if (feedback && nowMs - feedback.at < FEEDBACK_MS) {
    ctx.globalAlpha = 1 - (nowMs - feedback.at) / FEEDBACK_MS;
    text(feedback.text, HIGHWAY_LEFT + HIGHWAY_WIDTH / 2, TARGET_Y - 90, 34, feedback.color);
    ctx.globalAlpha = 1;
  }
}

function overlay(lines) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  lines.forEach(([value, size], index) => text(value, WORLD_WIDTH / 2, 270 + index * 62, size));
}

function render(nowMs) {
  resize();
  drawBackground(nowMs);
  drawHighway(nowMs);
  drawNotes(nowMs);
  drawEnergyMeter();
  drawHud(nowMs);
  if (state === 'READY') {
    overlay([['GUITAR KIRO', 56], ['Press Space to start the show', 30], [`Seed: ${seed}`, 22]]);
  } else if (state === 'PAUSED') {
    overlay([['Paused', 54], ['Press P to resume', 28]]);
  } else if (state === 'GAME_OVER' && latest) {
    overlay([
      ['SHOW OVER', 56],
      [`Score ${latest.score}   Best combo ${bestCombo}`, 30],
      [`Seed: ${seed}`, 22],
      [latest.lockoutRemainingMs <= 0 ? 'Press Space for an encore' : ' ', 28],
    ]);
  }
  requestAnimationFrame(render);
}

FK.ready({ name: 'Guitar Kiro', version: '1.0.0' });
requestAnimationFrame(render);
