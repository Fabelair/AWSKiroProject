/**
 * Core host page: wires engine, input, sandboxed frontend, seed UI, side chat and versions.
 * Everything here is protected Core code; AI output only ever becomes a sandboxed frontend.
 */

import { GameEngine, STATES } from './core/engine.js';
import { RULEBOOK } from './core/rulebook.js';
import { FrontendBridge } from './core/bridge.js';
import { createFrontendIframe } from './core/sandbox.js';
import { Watchdog } from './core/watchdog.js';
import { TestBot } from './core/bot.js';
import { runLoadTest } from './core/loadtest.js';
import { createSafeStore, browserLocalStorage, createScoreBoard } from './core/storage.js';
import { VersionStore, DEFAULT_VERSION_ID } from './core/versions.js';
import { buildShareLink, randomSeed, seedFromSearch } from './core/seed.js';
import { attachInput } from './input.js';
import { runSelfTest } from './selftest.js';
import { loadDefaultBundle, loadGuitarHeroBundle, themeDefaultBundle } from './frontend/bundles.js';
import { generateFrontend } from './chat/controller.js';
import {
  createAnthropicProvider,
  createDemoProvider,
  createOpenAiCompatibleProvider,
} from './chat/providers.js';

const $ = (id) => document.getElementById(id);
const store = createSafeStore(browserLocalStorage());
const sessionStore = createSafeStore((() => { try { return globalThis.sessionStorage; } catch { return null; } })());

// ---- bootstrap ---------------------------------------------------------------------------------

const [defaultBundle, guitarBundle] = await Promise.all([loadDefaultBundle(), loadGuitarHeroBundle()]);
const versions = new VersionStore(store, defaultBundle);
const engine = new GameEngine({
  seed: seedFromSearch(location.search) ?? undefined,
  scoreBoard: createScoreBoard(store),
  clock: () => performance.now(),
});
const bot = new TestBot(engine);
const watchdog = new Watchdog({ now: () => performance.now() });

let bridge = null;
let iframe = null;
let mountedBundle = null;
let lastGoodBundle = defaultBundle;
let previewing = null; // { bundle, prompt } while a generated frontend is being previewed

function setStatus(message, warn = false) {
  const line = $('status-line');
  line.textContent = message;
  line.classList.toggle('warn', warn);
}

// ---- frontend mounting -------------------------------------------------------------------------

function mountFrontend(bundle) {
  bridge?.detach();
  iframe?.remove();
  mountedBundle = bundle;
  iframe = createFrontendIframe(bundle);
  const thisFrame = iframe;
  bridge = new FrontendBridge({
    engine,
    send: (message) => thisFrame.contentWindow?.postMessage(message, '*'),
    onReady: (info) => {
      watchdog.markReady();
      lastGoodBundle = bundle;
      setStatus(`Frontend: ${info.name}`);
    },
    onRejected: (reason) => fallBack(reason),
    onError: (message) => setStatus(`Frontend error: ${message}`, true),
    onHeartbeat: () => watchdog.beat(),
  });
  bridge.setMuted(!soundOn);
  watchdog.reset();
  $('mount').appendChild(iframe);
}

window.addEventListener('message', (event) => {
  if (iframe && event.source === iframe.contentWindow) bridge?.handleMessage(event.data);
});

function fallBack(reason) {
  const target = mountedBundle === lastGoodBundle ? defaultBundle : lastGoodBundle;
  setStatus(`${reason} Switched back to ${target.name}.`, true);
  if (previewing) clearPreview();
  mountFrontend(target);
}

setInterval(() => {
  if (document.hidden) return;
  const problem = watchdog.check();
  if (problem === 'no-ready') fallBack('The frontend never started.');
  else if (problem === 'unresponsive') fallBack('The frontend stopped responding.');
}, 1000);

// ---- game loop -----------------------------------------------------------------------------------

let lastFrame = performance.now();
function frame(now) {
  engine.update(now - lastFrame);
  lastFrame = now;
  bot.update();
  bridge?.sendTick();
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) engine.pause();
  lastFrame = performance.now();
});

attachInput({
  overlay: $('input-overlay'),
  onPress: () => engine.press(),
  onTogglePause: () => togglePause(),
});

function togglePause() {
  if (engine.state === STATES.PLAYING) engine.pause();
  else if (engine.state === STATES.PAUSED) engine.resume();
}

// ---- seed UI -------------------------------------------------------------------------------------

function showSeed() {
  $('seed-input').value = engine.seed;
}

function applySeed(seed) {
  const result = engine.setSeed(seed);
  $('seed-message').textContent = result.ok ? '' : result.error;
  if (result.ok) {
    showSeed();
    bridge?.sendInit();
    history.replaceState(null, '', buildShareLink(location.href, engine.seed, RULEBOOK.version));
  }
}

$('seed-form').addEventListener('submit', (event) => {
  event.preventDefault();
  applySeed($('seed-input').value);
});
$('seed-random').addEventListener('click', () => applySeed(randomSeed()));
$('seed-copy').addEventListener('click', async () => {
  const link = buildShareLink(location.href, engine.seed, RULEBOOK.version);
  try {
    await navigator.clipboard.writeText(link);
    $('seed-message').textContent = 'Link copied.';
  } catch {
    $('seed-message').textContent = link;
  }
});
engine.on('state', () => {
  const locked = engine.state === STATES.PLAYING || engine.state === STATES.PAUSED;
  $('seed-set').disabled = locked;
  $('seed-random').disabled = locked;
  $('seed-input').readOnly = locked;
  $('btn-pause').textContent = engine.state === STATES.PAUSED ? 'Resume' : 'Pause';
});
showSeed();

// ---- toolbar -------------------------------------------------------------------------------------

let soundOn = true;
$('btn-pause').addEventListener('click', togglePause);
$('btn-sound').addEventListener('click', () => {
  soundOn = !soundOn;
  $('btn-sound').textContent = `Sound: ${soundOn ? 'on' : 'off'}`;
  $('btn-sound').setAttribute('aria-pressed', String(soundOn));
  bridge?.setMuted(!soundOn);
});
$('btn-bot').addEventListener('click', () => {
  bot.enabled = !bot.enabled;
  $('btn-bot').textContent = `Test bot: ${bot.enabled ? 'on' : 'off'}`;
  $('btn-bot').setAttribute('aria-pressed', String(bot.enabled));
});
$('btn-restore').addEventListener('click', () => {
  clearPreview();
  versions.setActive(DEFAULT_VERSION_ID);
  mountFrontend(defaultBundle);
  renderVersions();
  setStatus('Restored the default Flappy Kiro frontend.');
});
$('btn-selftest').addEventListener('click', async () => {
  const list = $('selftest-results');
  list.innerHTML = '';
  const loading = document.createElement('li');
  loading.textContent = 'Running...';
  list.appendChild(loading);
  $('selftest-dialog').showModal();
  const results = await runSelfTest({ bundles: { 'Flappy Kiro (default)': defaultBundle, 'Guitar Kiro': guitarBundle } });
  list.innerHTML = '';
  for (const result of results) {
    const li = document.createElement('li');
    li.className = result.ok ? 'pass' : 'fail';
    li.textContent = result.name;
    if (result.detail) {
      const detail = document.createElement('div');
      detail.className = 'detail';
      detail.textContent = result.detail;
      li.appendChild(detail);
    }
    list.appendChild(li);
  }
});

// ---- versions ------------------------------------------------------------------------------------

function renderVersions() {
  const list = $('version-list');
  list.innerHTML = '';
  const activeId = versions.getActiveId();
  for (const version of versions.list()) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = version.name;
    name.title = version.prompt || version.name;
    li.appendChild(name);
    if (version.id === activeId) {
      const tag = document.createElement('span');
      tag.className = 'active';
      tag.textContent = 'active';
      li.appendChild(tag);
    } else {
      li.appendChild(button('Use', () => activate(version.id)));
    }
    li.appendChild(button('Export', () => exportVersion(version)));
    if (!version.builtin) {
      li.appendChild(button('Rename', () => {
        const next = prompt('New name', version.name);
        if (next) { versions.rename(version.id, next); renderVersions(); }
      }));
      li.appendChild(button('Delete', () => {
        const wasActive = version.id === versions.getActiveId();
        versions.remove(version.id);
        if (wasActive) mountFrontend(versions.getActive().bundle);
        renderVersions();
      }));
    }
    list.appendChild(li);
  }
}

function button(label, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  el.addEventListener('click', onClick);
  return el;
}

function activate(id) {
  clearPreview();
  versions.setActive(id);
  mountFrontend(versions.getActive().bundle);
  renderVersions();
}

function exportVersion(version) {
  const text = versions.exportVersion(version.id);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${version.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'frontend'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

$('version-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const result = versions.importVersion(await file.text());
  $('version-message').textContent = result.ok ? `Imported "${result.version.name}".` : result.error;
  renderVersions();
});

// ---- preview (keep / discard) --------------------------------------------------------------------

function showPreview(bundle, prompt) {
  previewing = { bundle, prompt };
  $('preview-text').textContent = `Previewing "${bundle.name}". Play it, then keep or discard.`;
  $('preview-bar').hidden = false;
  mountFrontend(bundle);
}

function clearPreview() {
  previewing = null;
  $('preview-bar').hidden = true;
}

$('preview-keep').addEventListener('click', () => {
  if (!previewing) return;
  const result = versions.add({ name: previewing.bundle.name, prompt: previewing.prompt, bundle: previewing.bundle });
  if (!result.ok) {
    logChat('error', result.error);
    return;
  }
  versions.setActive(result.version.id);
  clearPreview();
  renderVersions();
  logChat('system', `Saved as a new version: "${result.version.name}".`);
});
$('preview-discard').addEventListener('click', () => {
  clearPreview();
  mountFrontend(versions.getActive().bundle);
  logChat('system', 'Discarded. Back to your active frontend.');
});

// ---- side chat -----------------------------------------------------------------------------------

const providers = {
  demo: createDemoProvider({
    guitarHero: guitarBundle,
    themed: (prompt) => themeDefaultBundle(defaultBundle, prompt),
  }),
  anthropic: createAnthropicProvider(),
  openai: createOpenAiCompatibleProvider(),
  openrouter: createOpenAiCompatibleProvider({
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4.5',
  }),
};

const providerSelect = $('provider-select');
for (const provider of Object.values(providers)) {
  const option = document.createElement('option');
  option.value = provider.id;
  option.textContent = provider.label;
  providerSelect.appendChild(option);
}

const KEY_STORAGE = 'fk.apikey';
function currentProvider() {
  return providers[providerSelect.value];
}
function syncProviderFields() {
  const provider = currentProvider();
  $('key-row').hidden = !provider.needsKey;
  $('model-input').value = provider.defaultModel;
  $('model-input').disabled = !provider.needsKey;
  $('key-input').value = sessionStore.get(`${KEY_STORAGE}.${provider.id}`) ?? store.get(`${KEY_STORAGE}.${provider.id}`) ?? '';
}
providerSelect.addEventListener('change', syncProviderFields);
$('key-input').addEventListener('change', () => {
  const id = currentProvider().id;
  const key = $('key-input').value.trim();
  sessionStore.set(`${KEY_STORAGE}.${id}`, key);
  if ($('key-remember').checked) store.set(`${KEY_STORAGE}.${id}`, key);
  else store.remove(`${KEY_STORAGE}.${id}`);
});
syncProviderFields();

const EXAMPLE_PROMPTS = ['Make it a Guitar Hero style game', 'Night theme with a moon', 'Underwater with fish', 'Warm sunset desert'];
for (const example of EXAMPLE_PROMPTS) {
  $('chips').appendChild(button(example, () => { $('chat-input').value = example; $('chat-input').focus(); }));
}

function logChat(kind, text) {
  const log = $('chat-log');
  const p = document.createElement('p');
  p.className = `msg ${kind}`;
  p.textContent = text; // never innerHTML: AI text is untrusted
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}
logChat('system', 'Tip: pick "Demo (offline)" to try the whole flow without an API key. Gameplay (timing, physics, difficulty, scoring) is protected and cannot be changed from here.');

let abortController = null;
$('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = $('chat-input').value.trim();
  if (!prompt || abortController) return;
  logChat('user', prompt);
  $('chat-input').value = '';
  abortController = new AbortController();
  $('chat-send').disabled = true;
  $('chat-cancel').hidden = false;
  const provider = currentProvider();
  const result = await generateFrontend({
    prompt,
    currentBundle: versions.getActive()?.bundle ?? null,
    provider,
    apiKey: $('key-input').value.trim(),
    model: $('model-input').value.trim(),
    signal: abortController.signal,
    dynamicValidate: (bundle) => runLoadTest(bundle),
    onProgress: (message) => { $('chat-progress').textContent = message; },
  });
  abortController = null;
  $('chat-send').disabled = false;
  $('chat-cancel').hidden = true;
  $('chat-progress').textContent = '';

  if (result.status === 'ok') {
    logChat('ai', `Created "${result.bundle.name}" (${result.attempts} attempt${result.attempts > 1 ? 's' : ''}). It passed all checks. Try it in the preview, then Keep or Discard.`);
    showPreview(result.bundle, prompt);
  } else if (result.status === 'declined') {
    logChat('system', result.message);
  } else if (result.status === 'invalid') {
    logChat('error', `${result.message}\n- ${result.errors.join('\n- ')}`);
  } else {
    logChat('error', result.message);
  }
});
$('chat-cancel').addEventListener('click', () => abortController?.abort());

// ---- go ------------------------------------------------------------------------------------------

mountFrontend(versions.getActive().bundle);
renderVersions();
requestAnimationFrame(frame);

// Handy for debugging and for automated checks.
window.__flappyKiro = { engine, bot, versions, mountFrontend, get bridge() { return bridge; } };
