import { test } from 'node:test';
import * as assert from 'node:assert';
import { RTKTokenKiller } from './token-killer.js';

test('RTKTokenKiller strips ANSI escape codes and progress noise', () => {
  const noisy = '\u001b[32m✔\u001b[39m Test passed\n• Packages in scope: 14\ncache hit, replaying logs\nActual content';
  const res = RTKTokenKiller.compress(noisy);
  assert.ok(!res.compressedText.includes('\u001b[32m'));
  assert.ok(!res.compressedText.includes('Packages in scope'));
  assert.ok(res.compressedText.includes('Actual content'));
});

test('RTKTokenKiller prunes node:internal stack frames while preserving user frames', () => {
  const stack = `
AssertionError [ERR_ASSERTION]: Expected true
    at TestContext.<anonymous> (packages/test/service.test.ts:42:10)
    at Test.runInAsyncScope (node:async_hooks:212:14)
    at Test.run (node:internal/test_runner/test:1109:25)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
`.trim();

  const res = RTKTokenKiller.compress(stack);
  assert.ok(res.compressedText.includes('service.test.ts:42:10'));
  assert.ok(!res.compressedText.includes('node:internal'));
  assert.ok(!res.compressedText.includes('node:async_hooks'));
});

test('RTKTokenKiller collapses passing tests and isolates failure diagnostics', () => {
  const testOutput = [
    '✔ test 1 (1ms)',
    '✔ test 2 (2ms)',
    '✔ test 3 (3ms)',
    '✖ test 4 (5ms)',
    '  AssertionError: 1 !== 2',
    '    actual: 1',
    '    expected: 2',
    'error TS2322: Type "number" is not assignable to type "string".'
  ].join('\n');

  const res = RTKTokenKiller.compress(testOutput);
  assert.strictEqual(res.passCount, 3);
  assert.strictEqual(res.failCount, 2);
  assert.strictEqual(res.errorCount, 1);
  assert.ok(res.compressedText.includes('[RTK Summary] ✔ 3 passing test(s) collapsed cleanly.'));
  assert.ok(res.compressedText.includes('✖ test 4'));
  assert.ok(res.compressedText.includes('AssertionError: 1 !== 2'));
  assert.ok(res.compressedText.includes('error TS2322'));
  assert.ok(res.tokenSavingsPercent >= 0);

  const formatted = RTKTokenKiller.formatSummary(res);
  assert.ok(formatted.includes('RTK Token Compression'));
  assert.ok(formatted.includes('Token Savings:'));
});
