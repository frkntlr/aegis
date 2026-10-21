import { test } from 'node:test';
import * as assert from 'node:assert';
import { CompoundingErrorChecker } from './compounding-checker.js';

test('CompoundingErrorChecker returns null for normal progression', () => {
  const checker = new CompoundingErrorChecker();
  assert.strictEqual(checker.recordStep({
    step: 1,
    changedFilesCount: 1,
    diffLinesCount: 10,
    failingTestsCount: 1,
    timestamp: new Date().toISOString()
  }), null);

  assert.strictEqual(checker.recordStep({
    step: 2,
    changedFilesCount: 1,
    diffLinesCount: 12,
    failingTestsCount: 0,
    timestamp: new Date().toISOString()
  }), null);

  assert.strictEqual(checker.recordStep({
    step: 3,
    changedFilesCount: 1,
    diffLinesCount: 15,
    failingTestsCount: 0,
    timestamp: new Date().toISOString()
  }), null);
});

test('CompoundingErrorChecker alerts on runaway diff growth', () => {
  const checker = new CompoundingErrorChecker();
  checker.recordStep({ step: 1, changedFilesCount: 1, diffLinesCount: 10, failingTestsCount: 0, timestamp: '' });
  checker.recordStep({ step: 2, changedFilesCount: 2, diffLinesCount: 25, failingTestsCount: 0, timestamp: '' });
  
  // Step 3 diff explodes to 120 lines (> 2.5x of 25)
  const alert = checker.recordStep({ step: 3, changedFilesCount: 6, diffLinesCount: 120, failingTestsCount: 0, timestamp: '' });
  assert.ok(alert);
  assert.strictEqual(alert.alert, 'RUNAWAY_DIFF');
  assert.strictEqual(alert.recommendedRollbackStep, 1);
});

test('CompoundingErrorChecker alerts on cascading test regressions', () => {
  const checker = new CompoundingErrorChecker();
  checker.recordStep({ step: 1, changedFilesCount: 1, diffLinesCount: 10, failingTestsCount: 1, timestamp: '' });
  checker.recordStep({ step: 2, changedFilesCount: 1, diffLinesCount: 15, failingTestsCount: 2, timestamp: '' });
  
  // Step 3 failures climb further
  const alert = checker.recordStep({ step: 3, changedFilesCount: 2, diffLinesCount: 20, failingTestsCount: 5, timestamp: '' });
  assert.ok(alert);
  assert.strictEqual(alert.alert, 'TEST_REGRESSION');
  assert.strictEqual(alert.recommendedRollbackStep, 1);
});
