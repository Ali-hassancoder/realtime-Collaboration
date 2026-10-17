import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventLimiter } from '../src/sockets/limits.js';

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