import test from 'node:test';
import assert from 'node:assert/strict';
import { VersionStore, DEFAULT_VERSION_ID } from '../src/core/versions.js';
import { createSafeStore } from '../src/core/storage.js';
import { defaultBundle, guitarBundle, memoryStorage } from './helpers.js';

function makeStore(backend = memoryStorage()) {
  let clock = 1000;
  return { backend, versions: new VersionStore(createSafeStore(backend), defaultBundle(), () => (clock += 10)) };
}

test('CORE-VER-03: the default is always first, built in, and cannot be deleted or renamed', () => {
  const { versions } = makeStore();
  assert.equal(versions.list()[0].id, DEFAULT_VERSION_ID);
  assert.equal(versions.remove(DEFAULT_VERSION_ID).ok, false);
  assert.equal(versions.rename(DEFAULT_VERSION_ID, 'x').ok, false);
  assert.equal(versions.getActiveId(), DEFAULT_VERSION_ID);
  assert.equal(versions.list().length, 1);
});

test('CORE-VER-01: accepted frontends are stored with id, time, prompt and bundle', () => {
  const { versions } = makeStore();
  const result = versions.add({ name: 'Guitar', prompt: 'make it guitar hero', bundle: guitarBundle() });
  assert.equal(result.ok, true);
  const saved = versions.get(result.version.id);
  assert.equal(saved.name, 'Guitar');
  assert.equal(saved.prompt, 'make it guitar hero');
  assert.ok(saved.createdAt > 0);
  assert.ok(saved.bundle.files['main.js']);
  assert.equal(versions.list().length, 2);
});

test('CORE-VER-01: invalid bundles are never stored', () => {
  const { versions } = makeStore();
  const evil = { name: 'evil', files: { 'index.html': '<script>FK.ready()</script>', 'main.js': 'fetch("x")' } };
  const result = versions.add({ name: 'evil', bundle: evil });
  assert.equal(result.ok, false);
  assert.equal(versions.list().length, 1);
});

test('CORE-VER-02: list newest first, activate, rename, delete (and fall back to default)', () => {
  const { versions } = makeStore();
  const a = versions.add({ name: 'A', bundle: guitarBundle() }).version;
  const b = versions.add({ name: 'B', bundle: guitarBundle() }).version;
  assert.deepEqual(versions.list().map((v) => v.name).slice(1), ['B', 'A']);
  assert.equal(versions.setActive(a.id).ok, true);
  assert.equal(versions.getActive().id, a.id);
  assert.equal(versions.rename(a.id, '  Renamed  ').ok, true);
  assert.equal(versions.get(a.id).name, 'Renamed');
  assert.equal(versions.remove(a.id).ok, true);
  assert.equal(versions.getActiveId(), DEFAULT_VERSION_ID, 'deleting the active version restores the default');
  assert.equal(versions.get(a.id), null);
  assert.equal(versions.get(b.id).name, 'B');
  assert.equal(versions.setActive('nope').ok, false);
  assert.equal(versions.remove('nope').ok, false);
});

test('versions persist across reloads', () => {
  const { versions, backend } = makeStore();
  const v = versions.add({ name: 'Keep me', bundle: guitarBundle() }).version;
  versions.setActive(v.id);
  const reloaded = new VersionStore(createSafeStore(backend), defaultBundle());
  assert.equal(reloaded.getActive().name, 'Keep me');
});

test('active id pointing at a missing version falls back to the default', () => {
  const backend = memoryStorage({ 'fk.active.v1': 'ghost-id' });
  const { versions } = makeStore(backend);
  assert.equal(versions.getActiveId(), DEFAULT_VERSION_ID);
});

test('corrupt stored data is ignored', () => {
  const { versions } = makeStore(memoryStorage({ 'fk.versions.v1': '{not json' }));
  assert.equal(versions.list().length, 1);
  const { versions: v2 } = makeStore(memoryStorage({ 'fk.versions.v1': '"string"' }));
  assert.equal(v2.list().length, 1);
});

test('CORE-VER-04: storage quota errors are reported, not thrown', () => {
  const full = memoryStorage();
  full.setItem = () => { throw new Error('QuotaExceededError'); };
  const { versions } = makeStore(full);
  const result = versions.add({ name: 'x', bundle: guitarBundle() });
  assert.equal(result.ok, false);
  assert.match(result.error, /storage is full/);
});

test('CORE-VER-02: export / import round trip, imports are validated, no secrets included', () => {
  const { versions } = makeStore();
  const v = versions.add({ name: 'Share me', prompt: 'p', bundle: guitarBundle() }).version;
  const text = versions.exportVersion(v.id);
  assert.ok(!/api.?key/i.test(text));
  const { versions: other } = makeStore();
  const imported = other.importVersion(text);
  assert.equal(imported.ok, true);
  assert.equal(imported.version.name, 'Share me');

  assert.equal(other.importVersion('not json').ok, false);
  assert.equal(other.importVersion('{"format":"other"}').ok, false);
  const tampered = JSON.parse(text);
  tampered.bundle.files['main.js'] += '\nfetch("https://evil.example")';
  assert.equal(other.importVersion(JSON.stringify(tampered)).ok, false);
  assert.equal(versions.exportVersion('missing'), null);
  assert.ok(versions.exportVersion(DEFAULT_VERSION_ID), 'the default can be exported');
});
