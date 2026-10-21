import { test } from 'node:test';
import * as assert from 'node:assert';
import { ImmutableOracle } from './immutable-oracle.js';

test('ImmutableOracle approves clean, honest changes without test tampering', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['src/Header.tsx', 'src/Navbar.tsx'],
    reportedPassedCount: 5,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, false);
  assert.strictEqual(report.verdict, 'APPROVED');
  assert.strictEqual(report.tamperedTestFiles.length, 0);
});

test('ImmutableOracle flags modified existing test files as suspicious requiring human review', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['src/Header.tsx', 'tests/Header.test.ts'],
    reportedPassedCount: 5,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, true);
  assert.strictEqual(report.verdict, 'MANUAL_REVIEW_REQUIRED');
  assert.deepStrictEqual(report.tamperedTestFiles, ['tests/Header.test.ts']);
});

test('ImmutableOracle rejects vacuous assertions', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['src/utils.ts'],
    newTestContents: [
      {
        filePath: 'tests/utils.test.ts',
        content: `
test('fake test', () => {
  expect(val).toBe(val);
});
        `.trim()
      }
    ],
    reportedPassedCount: 1,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, true);
  assert.strictEqual(report.verdict, 'REJECTED');
  assert.strictEqual(report.vacuousAssertionsFound, 1);
});
