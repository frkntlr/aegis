import { test } from 'node:test';
import * as assert from 'node:assert';
import { LineBudgetRadar } from './line-budget-radar.js';

test('LineBudgetRadar: classifies short file as SAFE', () => {
  const content = 'console.log("hello");\n'.repeat(50);
  const res = LineBudgetRadar.analyze('test.ts', content, 300, 40);

  assert.strictEqual(res.status, 'SAFE');
  assert.strictEqual(res.fileLines, 50);
  assert.strictEqual(res.fileQuotaRemaining, 250);
  assert.strictEqual(res.advice, undefined);
  assert.ok(res.formattedReport.includes('SAFE'));
});

test('LineBudgetRadar: classifies 260 lines as WARNING and suggests guard clauses', () => {
  const content = 'console.log("line");\n'.repeat(260);
  const res = LineBudgetRadar.analyze('service.ts', content, 300, 40);

  assert.strictEqual(res.status, 'WARNING');
  assert.strictEqual(res.fileLines, 260);
  assert.strictEqual(res.fileQuotaRemaining, 40);
  assert.strictEqual(res.advice?.pattern, 'GUARD_CLAUSE_FLATTEN');
  assert.ok(res.formattedReport.includes('WARNING'));
});

test('LineBudgetRadar: classifies 285, 299, and 300 LF lines as CRITICAL_QUOTA', () => {
  const res285 = LineBudgetRadar.analyze('controller.ts', 'console.log("line");\n'.repeat(285), 300, 40);
  assert.strictEqual(res285.status, 'CRITICAL_QUOTA');
  assert.strictEqual(res285.fileLines, 285);
  assert.strictEqual(res285.fileQuotaRemaining, 15);
  assert.strictEqual(res285.advice?.pattern, 'FACADE_DELEGATION');
  assert.ok(res285.advice?.title.includes('Cephe (Facade)'));
  assert.ok(res285.formattedReport.includes('CRITICAL_QUOTA'));

  const res299 = LineBudgetRadar.analyze('b299.ts', 'console.log("line");\n'.repeat(299), 300, 40);
  assert.strictEqual(res299.status, 'CRITICAL_QUOTA');
  assert.strictEqual(res299.fileLines, 299);

  const res300 = LineBudgetRadar.analyze('b300.ts', 'console.log("line");\n'.repeat(300), 300, 40);
  assert.strictEqual(res300.status, 'CRITICAL_QUOTA');
  assert.strictEqual(res300.fileLines, 300);
});

test('LineBudgetRadar: classifies 301 and 310 lines as EXCEEDED', () => {
  const res301 = LineBudgetRadar.analyze('edge.ts', 'console.log("line");\n'.repeat(301), 300, 40);
  assert.strictEqual(res301.status, 'EXCEEDED');
  assert.strictEqual(res301.fileLines, 301);

  const res = LineBudgetRadar.analyze('monolith.ts', 'console.log("line");\n'.repeat(310), 300, 40);
  assert.strictEqual(res.status, 'EXCEEDED');
  assert.strictEqual(res.fileLines, 310);
  assert.strictEqual(res.fileQuotaRemaining, 0);
  assert.strictEqual(res.advice?.pattern, 'FACADE_DELEGATION');
  assert.ok(res.formattedReport.includes('EXCEEDED'));
});
