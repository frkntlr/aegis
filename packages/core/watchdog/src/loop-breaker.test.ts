import { test } from 'node:test';
import * as assert from 'node:assert';
import { LoopBreaker } from './loop-breaker.js';

test('LoopBreaker tracks failures and triggers blocked state at threshold', () => {
  const breaker = new LoopBreaker({ maxFailures: 3 });

  const r1 = breaker.recordFailure(101, 'SyntaxError: Unexpected token');
  assert.strictEqual(r1.blocked, false);
  assert.strictEqual(r1.attempts, 1);
  assert.strictEqual(breaker.isBlocked(101), false);

  const r2 = breaker.recordFailure(101, 'TypeError: Cannot read properties of undefined');
  assert.strictEqual(r2.blocked, false);
  assert.strictEqual(r2.attempts, 2);
  assert.strictEqual(breaker.isBlocked(101), false);

  const r3 = breaker.recordFailure(101, 'AssertionError: expected true but got false');
  assert.strictEqual(r3.blocked, true);
  assert.strictEqual(r3.attempts, 3);
  assert.strictEqual(breaker.isBlocked(101), true);
  assert.ok(r3.reason?.includes('Repeated failure threshold reached (3/3)'));
});

test('LoopBreaker clears failure count on success', () => {
  const breaker = new LoopBreaker({ maxFailures: 3 });

  breaker.recordFailure(202, 'Flaky network');
  breaker.recordFailure(202, 'Flaky network');
  assert.strictEqual(breaker.isBlocked(202), false);

  breaker.recordSuccess(202);
  assert.strictEqual(breaker.getRecord(202), undefined);

  // New failure starts at 1 attempt
  const r = breaker.recordFailure(202, 'New error');
  assert.strictEqual(r.attempts, 1);
  assert.strictEqual(r.blocked, false);
});

test('LoopBreaker enumerates blocked issues accurately', () => {
  const breaker = new LoopBreaker({ maxFailures: 2 });
  breaker.recordFailure(301, 'Err 1');
  breaker.recordFailure(301, 'Err 2'); // blocked

  breaker.recordFailure(302, 'Err A'); // not blocked

  const blocked = breaker.getBlockedIssues();
  assert.deepStrictEqual(blocked, [301]);

  const allRecords = breaker.getAllRecords();
  assert.strictEqual(allRecords.size, 2);
  assert.strictEqual(allRecords.get(301)?.blocked, true);
  assert.strictEqual(allRecords.get(302)?.blocked, false);
});
