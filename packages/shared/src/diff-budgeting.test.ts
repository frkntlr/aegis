import test from 'node:test';
import * as assert from 'node:assert/strict';
import { PreEmptiveDiffBudgeting } from './diff-budgeting.js';

test('PreEmptiveDiffBudgeting.calculateBudget computes remaining quotas and threshold exceedance', () => {
  const ok = PreEmptiveDiffBudgeting.calculateBudget(120, 20);
  assert.equal(ok.fileQuotaRemaining, 180);
  assert.equal(ok.funcQuotaRemaining, 20);
  assert.equal(ok.isExceeded, false);
  assert.equal(ok.directive, undefined);

  const fileFull = PreEmptiveDiffBudgeting.calculateBudget(300, 10);
  assert.equal(fileFull.fileExceeded, true);
  assert.equal(fileFull.isExceeded, true);
  assert.match(fileFull.directive ?? '', /300\/300/);

  const funcFull = PreEmptiveDiffBudgeting.calculateBudget(100, 40, { maxFileLines: 250, maxFunctionLines: 40 });
  assert.equal(funcFull.funcExceeded, true);
  assert.equal(funcFull.isExceeded, true);
  assert.match(funcFull.directive ?? '', /40\/40/);
});

test('PreEmptiveDiffBudgeting.formatWarningForSlice prefixes every warning line', () => {
  const formatted = PreEmptiveDiffBudgeting.formatWarningForSlice(50, 15, '#');
  const lines = formatted.split('\n');
  assert.ok(lines.length >= 3);
  assert.equal(lines.every((line) => line.startsWith('# ')), true);
});

test('PreEmptiveDiffBudgeting.assessProposedDiff validates file and function deltas', () => {
  const allowed = PreEmptiveDiffBudgeting.assessProposedDiff(280, 15, 5, 30, 5, 0);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.newFileLines, 290);
  assert.equal(allowed.newFuncLines, 35);

  const fileBlocked = PreEmptiveDiffBudgeting.assessProposedDiff(295, 10, 0);
  assert.equal(fileBlocked.allowed, false);
  assert.equal(fileBlocked.fileAllowed, false);
  assert.match(fileBlocked.reason ?? '', /file=305\/300/);

  const customBlocked = PreEmptiveDiffBudgeting.assessProposedDiff(40, 5, 0, 18, 5, 0, {
    maxFileLines: 50,
    maxFunctionLines: 20
  });
  assert.equal(customBlocked.allowed, false);
  assert.equal(customBlocked.funcAllowed, false);
  assert.match(customBlocked.reason ?? '', /func=23\/20/);
});
