import { test } from 'node:test';
import * as assert from 'node:assert';
import { LineBudgetRadar } from './line-budget-radar.js';

test('LineBudgetRadar: classifies short file as SAFE', () => {
  const content = 'console.log("hello");\n'.repeat(50);
  const res = LineBudgetRadar.analyze('test.ts', content, 300, 40);

  assert.strictEqual(res.status, 'SAFE');
  assert.strictEqual(res.fileLines, 51);
  assert.strictEqual(res.fileQuotaRemaining, 249);
  assert.strictEqual(res.advice, undefined);
  assert.ok(res.formattedReport.includes('SAFE'));
});

test('LineBudgetRadar: classifies 260 lines as WARNING and suggests guard clauses', () => {
  const content = 'console.log("line");\n'.repeat(259);
  const res = LineBudgetRadar.analyze('service.ts', content, 300, 40);

  assert.strictEqual(res.status, 'WARNING');
  assert.strictEqual(res.fileLines, 260);
  assert.strictEqual(res.fileQuotaRemaining, 40);
  assert.strictEqual(res.advice?.pattern, 'GUARD_CLAUSE_FLATTEN');
  assert.ok(res.formattedReport.includes('WARNING'));
});

test('LineBudgetRadar: classifies 285 lines as CRITICAL_QUOTA and suggests Facade delegation', () => {
  const content = 'console.log("line");\n'.repeat(284);
  const res = LineBudgetRadar.analyze('controller.ts', content, 300, 40);

  assert.strictEqual(res.status, 'CRITICAL_QUOTA');
  assert.strictEqual(res.fileLines, 285);
  assert.strictEqual(res.fileQuotaRemaining, 15);
  assert.strictEqual(res.advice?.pattern, 'FACADE_DELEGATION');
  assert.ok(res.advice?.title.includes('Cephe (Facade)'));
  assert.ok(res.formattedReport.includes('CRITICAL_QUOTA'));
});

test('LineBudgetRadar: classifies 310 lines as EXCEEDED', () => {
  const content = 'console.log("line");\n'.repeat(309);
  const res = LineBudgetRadar.analyze('monolith.ts', content, 300, 40);

  assert.strictEqual(res.status, 'EXCEEDED');
  assert.strictEqual(res.fileLines, 310);
  assert.strictEqual(res.fileQuotaRemaining, 0);
  assert.strictEqual(res.advice?.pattern, 'FACADE_DELEGATION');
  assert.ok(res.formattedReport.includes('EXCEEDED'));
});
