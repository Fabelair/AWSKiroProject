import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBundle, LIMITS } from '../src/core/validator.js';
import { buildSrcdoc, CSP, SHIM } from '../src/core/sandbox.js';
import { defaultBundle, guitarBundle } from './helpers.js';

const bundleWith = (js, html) => ({
  name: 't',
  files: {
    'index.html': html ?? '<!doctype html><html><head></head><body><script src="main.js"></script></body></html>',
    'main.js': `FK.ready({name:'t'});\n${js}`,
  },
});
const errorsOf = (js, html) => validateBundle(bundleWith(js, html)).errors.join(' | ');

test('shipped frontends pass validation', () => {
  assert.deepEqual(validateBundle(defaultBundle()), { ok: true, errors: [] });
  assert.deepEqual(validateBundle(guitarBundle()), { ok: true, errors: [] });
});

test('CORE-SBX-03: network access is rejected', () => {
  for (const code of [
    'fetch("/x")', 'new XMLHttpRequest()', 'new WebSocket("ws://x")', 'new EventSource("/e")',
    'navigator.sendBeacon("/b")', 'importScripts("a.js")', 'new Worker("w.js")',
  ]) assert.match(errorsOf(code), /network|Worker|importScripts/, code);
});

test('CORE-SBX-03: code execution tricks, storage and parent access are rejected', () => {
  const cases = {
    'eval("1")': /eval/,
    'new Function("return 1")': /Function/,
    'import("x.js")': /import/,
    'localStorage.setItem("a","b")': /storage/,
    'document.cookie = "a=b"': /storage/,
    'window.parent.postMessage(1, "*")': /parent/,
    'top.location = "x"': /parent|location/,
    'parent.document': /parent/,
    'location.href = "x"': /location/,
    'document.write("x")': /document.write/,
  };
  for (const [code, pattern] of Object.entries(cases)) assert.match(errorsOf(code), pattern, code);
});

test('CORE-SBX-03: external URLs, iframes, forms and @import are rejected', () => {
  assert.match(errorsOf('const u = "https://evil.example/x.png";'), /external URLs/);
  assert.match(errorsOf('var s = "//cdn.example.com/lib.js";'), /external URLs/);
  assert.match(errorsOf('', '<html><head></head><body><iframe src="data:text/html,x"></iframe><script src="main.js"></script></body></html>'), /forbidden HTML/);
  assert.match(errorsOf('', '<html><body><form action="x"></form><script src="main.js"></script></body></html>'), /forbidden HTML/);
  const css = { name: 't', files: { ...bundleWith('').files, 'style.css': '@import url(x.css); body{background:url(http://x/y.png)}' } };
  assert.match(validateBundle(css).errors.join(' '), /@import/);
});

test('harmless things are not rejected: SVG namespace, lowercase function, comments', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const ok = validateBundle(bundleWith('const f = function () { return 1; }; // a regular comment', `<html><body>${svg}<script src="main.js"></script></body></html>`));
  assert.deepEqual(ok.errors, []);
});

test('CORE-SBX-03: structure, file names and size limits', () => {
  assert.equal(validateBundle(null).ok, false);
  assert.equal(validateBundle({}).ok, false);
  assert.equal(validateBundle({ files: [] }).ok, false);
  assert.match(validateBundle({ files: { 'main.js': 'FK.ready()' } }).errors.join(' '), /Missing entry file/);
  for (const name of ['../evil.js', 'a/b.js', 'x.php', 'noext', '.hidden.js', 'a b.js']) {
    const bundle = bundleWith('');
    bundle.files[name] = 'x';
    assert.match(validateBundle(bundle).errors.join(' '), /not allowed/, name);
  }
  const big = bundleWith('');
  big.files['big.js'] = 'a'.repeat(LIMITS.maxTotalBytes + 1);
  assert.match(validateBundle(big).errors.join(' '), /limit/);
  const nonText = bundleWith('');
  nonText.files['x.js'] = 42;
  assert.match(validateBundle(nonText).errors.join(' '), /must be text/);
});

test('bundles must call FK.ready and reference only files they contain', () => {
  const noReady = { name: 't', files: { 'index.html': '<html><body></body></html>' } };
  assert.match(validateBundle(noReady).errors.join(' '), /FK\.ready/);
  const missing = { name: 't', files: { 'index.html': '<html><body><script src="gone.js"></script></body></html>', 'main.js': 'FK.ready()' } };
  assert.match(validateBundle(missing).errors.join(' '), /gone\.js/);
});

test('CORE-SBX-02: srcdoc carries the CSP (no network) and the FK shim before any frontend code', () => {
  assert.match(CSP, /connect-src 'none'/);
  assert.match(CSP, /default-src 'none'/);
  const doc = buildSrcdoc(defaultBundle());
  assert.ok(doc.includes(CSP));
  assert.ok(doc.indexOf(CSP) < doc.indexOf('FK.onMessage'), 'CSP first');
  assert.ok(doc.indexOf('window.FK') < doc.indexOf('FK.onMessage('), 'shim before frontend code');
  assert.ok(!/<script[^>]+src=/.test(doc), 'scripts are inlined');
  assert.ok(!/<link\b/.test(doc), 'stylesheets are inlined');
  assert.ok(doc.includes('<style>'));
});

test('srcdoc inlining survives "</script>" inside frontend code', () => {
  const bundle = bundleWith('const s = "</script><b>";');
  const doc = buildSrcdoc(bundle);
  assert.equal((doc.match(/<\/script>/g) ?? []).length, 2, 'only the shim and main script close');
});

test('the shim only offers FK.send/onMessage/ready and heartbeats', () => {
  assert.match(SHIM, /heartbeat/);
  assert.match(SHIM, /event\.source !== window\.parent/);
  assert.doesNotMatch(SHIM, /localStorage|fetch/);
});

test('srcdoc is built even for an html without <head>', () => {
  const bundle = bundleWith('', '<body><canvas></canvas><script src="main.js"></script></body>');
  const doc = buildSrcdoc(bundle);
  assert.ok(doc.includes(CSP));
});
