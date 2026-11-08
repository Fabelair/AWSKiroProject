// Flappy Kiro: default frontend.
// Draws everything from Core messages. It never decides hit/miss or score.

// THEME-START
const THEME = {
  sky: '#87CEEB',
  cloud: '#ffffff',
  pipe: '#2E7D32',
  pipeCap: '#1B5E20',
  ghost: '#ffffff',
  eye: '#000000',
  text: '#ffffff',
  overlay: 'rgba(0, 0, 0, 0.45)',
};
// THEME-END

const WORLD_WIDTH = 1024;
const WORLD_HEIGHT = 768;
const CAP_HEIGHT = 38;
const CAP_OVERHANG = 6;
const GHOST_DRAW_WIDTH = 46;
const GHOST_DRAW_HEIGHT = 50;
const FLAP_ANIMATION_MS = 160;
const POP_ANIMATION_MS = 600;
const CLOUDS = [
  { x: 150, y: 160, w: 82, h: 62, speed: 14 },
  { x: 150, y: 285, w: 84, h: 50, speed: 18 },
  { x: 330, y: 355, w: 84, h: 52, speed: 22 },
  { x: 495, y: 335, w: 80, h: 44, speed: 12 },
  { x: 880, y: 445, w: 90, h: 50, speed: 16 },
  { x: 700, y: 90, w: 76, h: 42, speed: 20 },
];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let latest = null; // last `tick` payload from the Core
let state = 'READY';
let seed = '';
let muted = false;
let flapStartedAt = -Infinity;
let pops = []; // "+1" popups after a hit
let audioContext = null;

// ---- sound (tiny synthesized beeps, no assets) ---------------------------------------------

function beep(frequency, durationSeconds, type) {
  if (muted) return;
  try {
    audioContext = audioContext || new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + durationSeconds);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + durationSeconds);
  } catch (error) {
    /* audio is optional */
  }
}

// ---- messages from the Core ------------------------------------------------------------------

FK.onMessage((type, payload) => {
  if (type === 'init') seed = payload.seed;
  else if (type === 'state') state = payload.state;
  else if (type === 'tick') {
    latest = payload;
    state = payload.state;
    seed = payload.seed;
  } else if (type === 'press') {
    flapStartedAt = performance.now();
    beep(520, 0.07, 'square');
  } else if (type === 'cueResult') {
    if (payload.result === 'hit') {
      pops.push({ at: performance.now(), text: '+1' });
      beep(880, 0.1, 'triangle');
    } else {
      beep(120, 0.3, 'sawtooth');
    }
  } else if (type === 'settings') muted = payload.muted;
});

// ---- drawing -----------------------------------------------------------------------------------

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

function drawPill(x, y, width, height, color) {
  const radius = Math.min(width, height) / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - width / 2 + radius, y - height / 2);
  ctx.lineTo(x + width / 2 - radius, y - height / 2);
  ctx.arc(x + width / 2 - radius, y, height / 2, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x - width / 2 + radius, y + height / 2);
  ctx.arc(x - width / 2 + radius, y, height / 2, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
  ctx.fill();
}

function drawClouds(timeSeconds) {
  const span = WORLD_WIDTH + 240;
  for (const cloud of CLOUDS) {
    const x = (((cloud.x - timeSeconds * cloud.speed) % span) + span) % span - 120;
    drawPill(x, cloud.y, cloud.w, cloud.h, THEME.cloud);
  }
}

function drawPipe(pipe) {
  const centerX = pipe.x * WORLD_WIDTH;
  const width = pipe.width * WORLD_WIDTH;
  const gapTop = (pipe.gapY - pipe.gapHeight / 2) * WORLD_HEIGHT;
  const gapBottom = (pipe.gapY + pipe.gapHeight / 2) * WORLD_HEIGHT;
  const left = centerX - width / 2;

  ctx.fillStyle = THEME.pipe;
  ctx.fillRect(left, 0, width, gapTop);
  ctx.fillRect(left, gapBottom, width, WORLD_HEIGHT - gapBottom);

  ctx.fillStyle = THEME.pipeCap;
  ctx.fillRect(left - CAP_OVERHANG, gapTop - CAP_HEIGHT, width + CAP_OVERHANG * 2, CAP_HEIGHT);
  ctx.fillRect(left - CAP_OVERHANG, gapBottom, width + CAP_OVERHANG * 2, CAP_HEIGHT);
}

function drawGhost(centerX, centerY, nowMs) {
  const flapProgress = Math.min(1, (nowMs - flapStartedAt) / FLAP_ANIMATION_MS);
  const squash = flapProgress < 1 ? 1 + 0.12 * (1 - flapProgress) : 1;
  const width = GHOST_DRAW_WIDTH * (2 - squash);
  const height = GHOST_DRAW_HEIGHT * squash;
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const waveOffset = Math.sin(nowMs / 90) * 2;

  ctx.fillStyle = THEME.ghost;
  ctx.beginPath();
  ctx.moveTo(left, top + height * 0.5);
  ctx.bezierCurveTo(left, top - height * 0.05, left + width, top - height * 0.05, left + width, top + height * 0.5);
  ctx.lineTo(left + width, top + height);
  // wavy bottom edge: three little bumps
  ctx.lineTo(left + width * 0.8, top + height * 0.82 + waveOffset);
  ctx.lineTo(left + width * 0.6, top + height);
  ctx.lineTo(left + width * 0.4, top + height * 0.82 - waveOffset);
  ctx.lineTo(left + width * 0.2, top + height);
  ctx.lineTo(left, top + height * 0.82 + waveOffset);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = THEME.eye;
  ctx.beginPath();
  ctx.ellipse(centerX + width * 0.12, centerY - height * 0.08, 2.4, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(centerX + width * 0.3, centerY - height * 0.08, 2.4, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawText(text, x, y, size, align = 'center') {
  ctx.font = `bold ${size}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.textAlign = align;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = THEME.text;
  ctx.fillText(text, x, y);
  ctx.shadowColor = 'transparent';
}

function drawOverlay(lines) {
  ctx.fillStyle = THEME.overlay;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  lines.forEach(([text, size], index) => drawText(text, WORLD_WIDTH / 2, 280 + index * 62, size));
}

function render(nowMs) {
  resize();
  ctx.fillStyle = THEME.sky;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  drawClouds(nowMs / 1000);

  if (latest) {
    latest.pipes.forEach(drawPipe);
    const hover = state === 'READY' ? Math.sin(nowMs / 250) * 8 : 0;
    drawGhost(latest.ghost.x * WORLD_WIDTH, latest.ghost.y * WORLD_HEIGHT + hover, nowMs);

    pops = pops.filter((pop) => nowMs - pop.at < POP_ANIMATION_MS);
    for (const pop of pops) {
      const progress = (nowMs - pop.at) / POP_ANIMATION_MS;
      ctx.globalAlpha = 1 - progress;
      drawText(pop.text, latest.ghost.x * WORLD_WIDTH + 50, latest.ghost.y * WORLD_HEIGHT - 30 - progress * 40, 30);
      ctx.globalAlpha = 1;
    }
    drawText(`Score: ${latest.score} | High: ${latest.highScore}`, WORLD_WIDTH / 2, WORLD_HEIGHT - 40, 30);
  }

  if (state === 'READY') {
    drawOverlay([['Flappy Kiro', 54], ['Press Space to start', 32], [`Seed: ${seed}`, 22]]);
  } else if (state === 'PAUSED') {
    drawOverlay([['Paused', 54], ['Press P to resume', 28]]);
  } else if (state === 'GAME_OVER' && latest) {
    const ready = latest.lockoutRemainingMs <= 0;
    drawOverlay([
      ['Game Over', 54],
      [`Score: ${latest.score}   High: ${latest.highScore}`, 32],
      [`Seed: ${seed}`, 22],
      [ready ? 'Press Space to restart' : ' ', 28],
    ]);
  }
  requestAnimationFrame(render);
}

FK.ready({ name: 'Flappy Kiro (default)', version: '1.0.0' });
requestAnimationFrame(render);
