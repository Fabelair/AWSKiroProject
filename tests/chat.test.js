import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRuleChangeRequest } from '../src/chat/guard.js';
import { parseAiResponse, formatBundle } from '../src/chat/parser.js';
import { buildSystemPrompt, buildUserMessage } from '../src/chat/prompt.js';
import { generateFrontend, MAX_RETRIES } from '../src/chat/controller.js';
import {
  createAnthropicProvider,
  createOpenAiCompatibleProvider,
  createDemoProvider,
} from '../src/chat/providers.js';
import { themeDefaultBundle } from '../src/frontend/bundles.js';
import { validateBundle } from '../src/core/validator.js';
import { RULEBOOK } from '../src/core/rulebook.js';
import { defaultBundle, guitarBundle } from './helpers.js';

const goodText = () => formatBundle(guitarBundle());

test('CHAT-07: requests to change rules are declined with a visual alternative', () => {
  const rejected = [
    'make it easier', 'make the game harder', 'increase the difficulty', 'make the gaps bigger',
    'wider gap please', 'change the gravity', 'reduce the speed of the physics', 'slower pipes',
    'make me invincible', 'enable god mode', 'add autoplay', 'give me double points',
    'change the controls', 'use a different button', 'make the hitbox smaller', 'a longer hit window',
  ];
  for (const prompt of rejected) {
    const verdict = checkRuleChangeRequest(prompt);
    assert.equal(verdict.declined, true, prompt);
    assert.match(verdict.message, /look|style|theme/i);
  }
});

test('CHAT-07: visual requests are not declined', () => {
  for (const prompt of [
    'Make it a Guitar Hero style game', 'night theme with stars', 'underwater with fish',
    'make the ghost a cat', 'change the score font to something retro', 'bigger clouds',
    'add a rainbow', 'add confetti when I score',
  ]) assert.equal(checkRuleChangeRequest(prompt).declined, false, prompt);
});

test('CHAT-06: parser reads the strict file format and ignores everything else', () => {
  const text = `Sure! Here you go\n=== NAME: Cool Skin ===\n=== FILE: index.html ===\n<html></html>\n=== END FILE ===\nrandom words\n=== FILE: main.js ===\nFK.ready();\nline2\n=== END FILE ===`;
  const parsed = parseAiResponse(text);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.bundle.name, 'Cool Skin');
  assert.deepEqual(Object.keys(parsed.bundle.files), ['index.html', 'main.js']);
  assert.equal(parsed.bundle.files['main.js'], 'FK.ready();\nline2');
});

test('CHAT-06: parser handles refusals, garbage and Windows line endings', () => {
  assert.equal(parseAiResponse('=== DECLINED: I cannot change difficulty, but I can restyle it. ===').declined, 'I cannot change difficulty, but I can restyle it.');
  assert.ok(parseAiResponse('just some prose').errors.length > 0);
  assert.ok(parseAiResponse('').errors.length > 0);
  assert.ok(parseAiResponse(null).errors.length > 0);
  const crlf = '=== FILE: index.html ===\r\n<p>hi</p>\r\n=== END FILE ===';
  assert.equal(parseAiResponse(crlf).bundle.files['index.html'], '<p>hi</p>');
});

test('formatBundle <-> parseAiResponse round trip keeps every file', () => {
  const original = guitarBundle();
  const parsed = parseAiResponse(formatBundle(original));
  assert.deepEqual(parsed.bundle.files, original.files);
});

test('CHAT-05: system prompt contains rulebook facts, the API, limits and the output format', () => {
  const prompt = buildSystemPrompt();
  for (const needle of [
    `Rulebook v${RULEBOOK.version}`, 'FK.ready', '"tick"', '"cueResult"', '=== FILE:', '=== DECLINED:',
    'at least 1000 ms', 'fetch', 'never', `${RULEBOOK.world.width}x${RULEBOOK.world.height}`,
  ]) assert.ok(prompt.includes(needle), needle);
  assert.ok(!/\bapi.?key\b/i.test(prompt));
});

test('CHAT-10: iterating sends the current frontend with the request', () => {
  assert.equal(buildUserMessage('hello', null), 'hello');
  const withBundle = buildUserMessage('bigger notes', defaultBundle());
  assert.ok(withBundle.startsWith('bigger notes'));
  assert.ok(withBundle.includes('=== FILE: main.js ==='));
});

function fakeProvider(replies, { needsKey = false } = {}) {
  const calls = [];
  return {
    id: 'fake', label: 'fake', needsKey, defaultModel: 'm', calls,
    async generate(args) {
      calls.push(args);
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
}

test('CHAT-08: valid answer => ok with a bundle that passes validation', async () => {
  const provider = fakeProvider([goodText()]);
  const result = await generateFrontend({ prompt: 'guitar hero please', provider });
  assert.equal(result.status, 'ok');
  assert.equal(result.attempts, 1);
  assert.equal(validateBundle(result.bundle).ok, true);
});

test('CHAT-07: guard declines before any AI call is made', async () => {
  const provider = fakeProvider([goodText()]);
  const result = await generateFrontend({ prompt: 'make it easier', provider });
  assert.equal(result.status, 'declined');
  assert.equal(provider.calls.length, 0);
});

test('CHAT-07: an AI-side refusal is passed through as declined', async () => {
  const provider = fakeProvider(['=== DECLINED: Timing is fixed, but I can change the look. ===']);
  const result = await generateFrontend({ prompt: 'surprise me', provider });
  assert.equal(result.status, 'declined');
  assert.match(result.message, /Timing is fixed/);
});

test('CHAT-09: validation errors are sent back; the AI gets up to 2 automatic retries', async () => {
  const bad = '=== FILE: index.html ===\n<script src="main.js"></script>\n=== END FILE ===\n=== FILE: main.js ===\nFK.ready(); fetch("/x");\n=== END FILE ===';
  const provider = fakeProvider([bad, bad, goodText()]);
  const result = await generateFrontend({ prompt: 'a skin', provider });
  assert.equal(result.status, 'ok');
  assert.equal(result.attempts, 3);
  assert.equal(provider.calls.length, 3);
  const retryMessage = provider.calls[1].messages.at(-1).content;
  assert.match(retryMessage, /fetch/);
  assert.match(retryMessage, /rejected/);
});

test('CHAT-09: after the retries the failure is shown to the user', async () => {
  const bad = 'I am just chatting';
  const provider = fakeProvider([bad]);
  const result = await generateFrontend({ prompt: 'a skin', provider });
  assert.equal(result.status, 'invalid');
  assert.equal(provider.calls.length, MAX_RETRIES + 1);
  assert.ok(result.errors.length > 0);
});

test('dynamic validation failures also trigger a retry', async () => {
  const provider = fakeProvider([goodText(), goodText()]);
  let runs = 0;
  const result = await generateFrontend({
    prompt: 'a skin',
    provider,
    dynamicValidate: async () => (++runs === 1 ? ['Runtime error: boom'] : []),
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.attempts, 2);
  assert.match(provider.calls[1].messages.at(-1).content, /boom/);
});

test('CHAT-11: provider errors and missing keys are reported clearly', async () => {
  const noKey = await generateFrontend({ prompt: 'a skin', provider: fakeProvider(['x'], { needsKey: true }) });
  assert.equal(noKey.status, 'error');
  assert.match(noKey.message, /API key/);
  const failing = await generateFrontend({ prompt: 'a skin', provider: fakeProvider([new Error('Rate limit reached.')]), apiKey: 'k' });
  assert.equal(failing.status, 'error');
  assert.match(failing.message, /Rate limit/);
  const abort = Object.assign(new Error('x'), { name: 'AbortError' });
  const cancelled = await generateFrontend({ prompt: 'a skin', provider: fakeProvider([abort]), apiKey: 'k' });
  assert.equal(cancelled.message, 'Cancelled.');
});

test('CHAT-11: progress callback is used', async () => {
  const messages = [];
  await generateFrontend({ prompt: 'a skin', provider: fakeProvider([goodText()]), onProgress: (m) => messages.push(m) });
  assert.ok(messages.length >= 2);
});

function fakeFetch(status, body, record) {
  return async (url, init) => {
    record.url = url;
    record.init = init;
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
}

test('CHAT-02/03: Anthropic provider sends the key only to the Anthropic API', async () => {
  const record = {};
  const provider = createAnthropicProvider(fakeFetch(200, { content: [{ type: 'text', text: 'hi ' }, { type: 'text', text: 'there' }] }, record));
  const text = await provider.generate({ apiKey: 'sk-secret', model: 'm1', system: 'SYS', messages: [{ role: 'user', content: 'U' }] });
  assert.equal(text, 'hi there');
  assert.equal(new URL(record.url).host, 'api.anthropic.com');
  assert.equal(record.init.headers['x-api-key'], 'sk-secret');
  const body = JSON.parse(record.init.body);
  assert.equal(body.system, 'SYS');
  assert.equal(body.model, 'm1');
  assert.ok(!record.init.body.includes('sk-secret'), 'the key is not in the body');
});

test('CHAT-02: OpenAI-compatible provider supports other base URLs (e.g. OpenRouter)', async () => {
  const record = {};
  const provider = createOpenAiCompatibleProvider({
    id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1/', fetchImpl: fakeFetch(200, { choices: [{ message: { content: 'ok' } }] }, record),
  });
  assert.equal(await provider.generate({ apiKey: 'k', system: 'S', messages: [{ role: 'user', content: 'U' }] }), 'ok');
  assert.equal(record.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(record.init.headers.authorization, 'Bearer k');
  assert.equal(JSON.parse(record.init.body).messages[0].role, 'system');
});

test('CHAT-11: HTTP errors become friendly messages', async () => {
  for (const [status, pattern] of [[401, /key was rejected/], [429, /Rate limit/], [503, /having problems/], [400, /error \(400\)/]]) {
    const provider = createAnthropicProvider(fakeFetch(status, { error: 'x' }, {}));
    await assert.rejects(provider.generate({ apiKey: 'k', system: '', messages: [] }), pattern);
  }
  const offline = createAnthropicProvider(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(offline.generate({ apiKey: 'k', system: '', messages: [] }), /Network error/);
});

test('CHAT-04: the offline demo provider needs no key and returns valid bundles', async () => {
  const demo = createDemoProvider({ guitarHero: guitarBundle(), themed: (p) => themeDefaultBundle(defaultBundle(), p) });
  assert.equal(demo.needsKey, false);
  const guitar = await generateFrontend({ prompt: 'make it a guitar hero style game', provider: demo });
  assert.equal(guitar.status, 'ok');
  assert.equal(guitar.bundle.name, 'Guitar Kiro');
  const night = await generateFrontend({ prompt: 'a night theme', provider: demo, currentBundle: defaultBundle() });
  assert.equal(night.status, 'ok');
  assert.match(night.bundle.files['main.js'], /#0b1233/);
  const sea = await generateFrontend({ prompt: 'underwater with fish', provider: demo });
  assert.match(sea.bundle.files['main.js'], /#0f6c8c/);
});
