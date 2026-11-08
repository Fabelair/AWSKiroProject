import test from 'node:test';
import assert from 'node:assert/strict';
import { RULEBOOK, RULEBOOK_VERSION } from '../src/core/rulebook.js';
import { createRng, hashSeed } from '../src/core/rng.js';
import { normalizeSeed, randomSeed, seedFromSearch, buildShareLink, MAX_SEED_LENGTH } from '../src/core/seed.js';

// NFR-CORE-02: if any constant changes, this fails until the version is bumped AND the hash is updated.
const fnv = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};

test('CORE-PHYS-03: rulebook is deeply frozen', () => {
  assert.ok(Object.isFrozen(RULEBOOK));
  assert.ok(Object.isFrozen(RULEBOOK.ghost));
  assert.throws(() => { 'use strict'; RULEBOOK.ghost.gravity = 1; }, TypeError);
});

test('NFR-CORE-02: constants only change together with a rulebook version bump', () => {
  assert.equal(RULEBOOK_VERSION, '1.0.0');
  assert.equal(fnv(JSON.stringify(RULEBOOK)), 1196134323,
    'Rulebook constants changed: bump RULEBOOK_VERSION and update this hash on purpose.');
});

test('API lookahead is at least 3 seconds (CORE-API-01)', () => {
  assert.ok(RULEBOOK.api.lookaheadMs >= 3000);
});

test('CORE-SEED-06: same seed gives same random sequence, different seeds differ', () => {
  const a = createRng('kiro');
  const b = createRng('kiro');
  const c = createRng('other');
  const seqA = Array.from({ length: 20 }, () => a.next());
  assert.deepEqual(seqA, Array.from({ length: 20 }, () => b.next()));
  assert.notDeepEqual(seqA, Array.from({ length: 20 }, () => c.next()));
  assert.ok(seqA.every((n) => n >= 0 && n < 1));
});

test('hash and rng produce fixed known values (cross-engine determinism guard)', () => {
  assert.equal(hashSeed('kiro'), 175070886);
  const rng = createRng('golden');
  assert.deepEqual([rng.int(0, 1000), rng.int(0, 1000), rng.int(0, 1000)], [922, 487, 836]);
});

test('rng.int stays within inclusive bounds', () => {
  const rng = createRng('bounds');
  for (let i = 0; i < 2000; i++) {
    const n = rng.int(5, 9);
    assert.ok(n >= 5 && n <= 9 && Number.isInteger(n));
  }
});

test('CORE-SEED-01/02: seed validation and random seeds', () => {
  assert.deepEqual(normalizeSeed('  abc '), { ok: true, seed: 'abc' });
  assert.deepEqual(normalizeSeed(12345), { ok: true, seed: '12345' });
  assert.equal(normalizeSeed('').ok, false);
  assert.equal(normalizeSeed('   ').ok, false);
  assert.equal(normalizeSeed('x'.repeat(MAX_SEED_LENGTH)).ok, true);
  assert.equal(normalizeSeed('x'.repeat(MAX_SEED_LENGTH + 1)).ok, false);
  assert.match(randomSeed(), /^kiro-[0-9a-z]{6}$/);
  assert.notEqual(randomSeed(() => 0.1), randomSeed(() => 0.9));
});

test('CORE-SEED-04/08: URL parameter and share link', () => {
  assert.equal(seedFromSearch('?seed=my-seed'), 'my-seed');
  assert.equal(seedFromSearch('?other=1'), null);
  assert.equal(seedFromSearch('?seed='), null);
  const link = buildShareLink('http://localhost/index.html?old=1#x', 'abc def', '1.0.0');
  const url = new URL(link);
  assert.equal(url.searchParams.get('seed'), 'abc def');
  assert.equal(url.searchParams.get('rb'), '1.0.0');
  assert.equal(url.searchParams.get('old'), null);
});
