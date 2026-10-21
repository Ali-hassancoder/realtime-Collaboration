import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventLimiter, createKeyedLimiter } from '../src/sockets/limits.js';

describe('createEventLimiter', () => {
  test('allows up to the limit, then limits, then flags abuse', () => {
    let now = 0;
    const hit = createEventLimiter({ limit: 3, windowMs: 1000, abuseFactor: 2, now: () => now });
    assert.deepEqual([hit(), hit(), hit()], ['ok', 'ok', 'ok']);
    assert.deepEqual([hit(), hit(), hit()], ['limited', 'limited', 'limited']);
    assert.equal(hit(), 'abusive');
  });

  test('a new window resets the count', () => {
    let now = 0;
    const hit = createEventLimiter({ limit: 1, windowMs: 1000, now: () => now });
    assert.equal(hit(), 'ok');
    assert.equal(hit(), 'limited');
    now = 1000;
    assert.equal(hit(), 'ok');
  });

  test('limiters do not share state', () => {
    const a = createEventLimiter({ limit: 1, windowMs: 1000 });
    const b = createEventLimiter({ limit: 1, windowMs: 1000 });
    assert.equal(a(), 'ok');
    assert.equal(a(), 'limited');
    assert.equal(b(), 'ok');
  });
});

describe('createKeyedLimiter', () => {
  test('each key gets its own window', () => {
    const hit = createKeyedLimiter({ limit: 2, windowMs: 1000 });
    assert.deepEqual([hit('a'), hit('a'), hit('a')], ['ok', 'ok', 'limited']);
    assert.equal(hit('b'), 'ok', 'a different key starts fresh');
  });

  test('a new window resets the count for that key', () => {
    let now = 0;
    const hit = createKeyedLimiter({ limit: 1, windowMs: 1000, now: () => now });
    assert.equal(hit('a'), 'ok');
    assert.equal(hit('a'), 'limited');
    now = 1000;
    assert.equal(hit('a'), 'ok');
  });

  test('sweep drops expired windows but keeps live ones', () => {
    let now = 0;
    const hit = createKeyedLimiter({ limit: 1, windowMs: 1000, now: () => now });
    hit('a');
    now = 500;
    hit('b');
    now = 1100; // a's window has expired, b's is still live
    hit.sweep();
    assert.equal(hit('a'), 'ok', 'expired key was swept and starts fresh');
    assert.equal(hit('b'), 'limited', 'live key kept its count');
  });
});