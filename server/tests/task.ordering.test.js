import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { betweenPosition, MIN_GAP, STEP } from '../src/modules/task/task.ordering.js';

describe('betweenPosition', () => {
  test('returns the midpoint of two positions', () => {
    assert.equal(betweenPosition(0, STEP), STEP / 2);
    assert.equal(betweenPosition(-STEP, STEP), 0);
    assert.equal(betweenPosition(1, 2), 1.5);
  });

  test('returns null when the gap is too small or the order is wrong', () => {
    assert.equal(betweenPosition(1, 1), null);
    assert.equal(betweenPosition(1, 1 + MIN_GAP / 2), null);
    assert.equal(betweenPosition(5, 1), null);
  });

  test('a returned value is always strictly between its neighbours', () => {
    for (const [a, b] of [[0, 1], [1, 3], [-10, -9], [1000, 1000.5]]) {
      const mid = betweenPosition(a, b);
      assert.ok(mid > a && mid < b, `${mid} should be between ${a} and ${b}`);
    }
  });

  test('repeated halving stops before positions collapse', () => {
    let next = STEP;
    let steps = 0;
    for (;;) {
      const mid = betweenPosition(0, next);
      if (mid === null) break;
      next = mid;
      steps += 1;
      assert.ok(steps < 100, 'should terminate');
    }
    assert.ok(next > 0);
    assert.ok(next <= MIN_GAP);
  });
});