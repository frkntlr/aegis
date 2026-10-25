import { test } from 'node:test';
import * as assert from 'node:assert';
import { PreEmptiveDiffBudgeting } from './index.js';

test('PreEmptiveDiffBudgeting: calculates remaining quota under limits accurately', () => {
  const budget = PreEmptiveDiffBudgeting.calculateBudget(274, 27);
  assert.strictEqual(budget.fileLines, 274);
  assert.strictEqual(budget.fileQuotaRemaining, 26);
  assert.strictEqual(budget.fileExceeded, false);
  assert.strictEqual(budget.funcLines, 27);
  assert.strictEqual(budget.funcQuotaRemaining, 13);
  assert.strictEqual(budget.funcExceeded, false);
  assert.strictEqual(budget.isExceeded, false);
  assert.strictEqual(budget.directive, undefined);

  assert.ok(budget.formattedWarning.includes('Hedef Dosya: 274 satır (Azami Tavan: 300) -> Bu dosyaya EN FAZLA 26 satır'));
  assert.ok(budget.formattedWarning.includes('Hedef Fonksiyon: 27 satır (Azami Tavan: 40) -> Bu fonksiyona EN FAZLA 13 satır'));
});

test('PreEmptiveDiffBudgeting: detects quota exhaustion and issues mandatory refactor directive', () => {
  const overBudget = PreEmptiveDiffBudgeting.calculateBudget(305, 10);
  assert.strictEqual(overBudget.fileQuotaRemaining, 0);
  assert.strictEqual(overBudget.fileExceeded, true);
  assert.strictEqual(overBudget.isExceeded, true);
  assert.ok(overBudget.directive?.includes('KOTA DOLDU: Dosya 305/300 satır sınırına ulaştı'));
  assert.ok(overBudget.directive?.includes('yeni bir yardımcı modüle refactor etmeniz zorunludur'));

  const funcOver = PreEmptiveDiffBudgeting.calculateBudget(150, 42);
  assert.strictEqual(funcOver.funcQuotaRemaining, 0);
  assert.strictEqual(funcOver.funcExceeded, true);
  assert.strictEqual(funcOver.isExceeded, true);
  assert.ok(funcOver.directive?.includes('KOTA DOLDU: Fonksiyon 42/40 satır sınırına ulaştı'));
});

test('PreEmptiveDiffBudgeting: formatWarningForSlice formats comments for TS and GDScript', () => {
  const tsWarning = PreEmptiveDiffBudgeting.formatWarningForSlice(250, 20, '//');
  assert.ok(tsWarning.startsWith('// 🛡️ Demir Kafes Proaktif Kotası:'));
  assert.ok(tsWarning.includes('//    - Hedef Dosya: 250 satır'));

  const gdWarning = PreEmptiveDiffBudgeting.formatWarningForSlice(280, 35, '#');
  assert.ok(gdWarning.startsWith('# 🛡️ Demir Kafes Proaktif Kotası:'));
  assert.ok(gdWarning.includes('#    - Hedef Dosya: 280 satır'));
});

test('PreEmptiveDiffBudgeting: assessProposedDiff validates diff headroom against limits', () => {
  const passCheck = PreEmptiveDiffBudgeting.assessProposedDiff(280, 15, 5, 20, 10, 2);
  assert.strictEqual(passCheck.allowed, true);
  assert.strictEqual(passCheck.newFileLines, 290);
  assert.strictEqual(passCheck.newFuncLines, 28);

  const failCheck = PreEmptiveDiffBudgeting.assessProposedDiff(290, 20, 0, 35, 10, 0);
  assert.strictEqual(failCheck.allowed, false);
  assert.strictEqual(failCheck.fileAllowed, false);
  assert.strictEqual(failCheck.funcAllowed, false);
  assert.ok(failCheck.reason?.includes('Diff exceeds Demir Kafes'));
});
