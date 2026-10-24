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

test('ImmutableOracle approves new honest test files without flagging as tampered', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['src/feature.ts', 'tests/feature.test.ts'],
    newTestContents: [
      {
        filePath: 'tests/feature.test.ts',
        content: `
test('genuine test', () => {
  assert.strictEqual(2 + 2, 4);
});
        `.trim()
      }
    ],
    reportedPassedCount: 1,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, false);
  assert.strictEqual(report.verdict, 'APPROVED');
  assert.strictEqual(report.tamperedTestFiles.length, 0);
  assert.strictEqual(report.vacuousAssertionsFound, 0);
});

test('ImmutableOracle prioritizes REJECTED when tests fail or assertions are vacuous even if tests were modified', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['tests/Header.test.ts'],
    reportedPassedCount: 3,
    reportedFailedCount: 1
  });

  assert.strictEqual(report.suspicious, true);
  assert.strictEqual(report.verdict, 'REJECTED');
  assert.deepStrictEqual(report.tamperedTestFiles, ['tests/Header.test.ts']);
  assert.ok(report.details.some(d => d.includes('failing tests')));
});

test('ImmutableOracle flags modified existing tests even when testContents are provided', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['src/api.ts', 'tests/api.test.ts'],
    testContents: [
      {
        filePath: 'tests/api.test.ts',
        content: `test('ok', () => { assert.strictEqual(1 + 1, 2); });`,
        isNew: false
      }
    ],
    reportedPassedCount: 1,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, true);
  assert.strictEqual(report.verdict, 'MANUAL_REVIEW_REQUIRED');
  assert.deepStrictEqual(report.tamperedTestFiles, ['tests/api.test.ts']);
});

test('ImmutableOracle does not falsely trigger vacuous assertion on distinct arguments with non-greedy regex', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['src/calc.ts'],
    newTestContents: [
      {
        filePath: 'tests/calc.test.ts',
        content: `test('different values', () => { expect(a).toBe(b); expect(x).toBe(y); });`
      }
    ],
    reportedPassedCount: 2,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, false);
  assert.strictEqual(report.verdict, 'APPROVED');
  assert.strictEqual(report.vacuousAssertionsFound, 0);
});

test('ImmutableOracle detects GDScript test tampering and vacuous assert_eq/assert_true', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['scripts/player.gd', 'test/test_player.gd'],
    testContents: [
      {
        filePath: 'test/test_player.gd',
        content: `func test_fake():\n    assert_eq(score, score)\n    assert_true(true)\n`
      }
    ],
    reportedPassedCount: 2,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, true);
  assert.strictEqual(report.verdict, 'REJECTED');
  assert.deepStrictEqual(report.tamperedTestFiles, ['test/test_player.gd']);
  assert.strictEqual(report.vacuousAssertionsFound, 2);
});

test('ImmutableOracle detects vacuous assert.ok(true), assert(true) and Python assert True', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['test/test_fake.py'],
    newTestContents: [
      {
        filePath: 'test/test_fake.py',
        content: `def test_tautology():\n    assert.ok(true)\n    assert True\n    assert(true)\n`
      }
    ],
    reportedPassedCount: 1,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, true);
  assert.strictEqual(report.verdict, 'REJECTED');
  assert.strictEqual(report.vacuousAssertionsFound, 3);
});

test('ImmutableOracle detects vacuous assert.deepStrictEqual and assert.deepEqual', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['test/dummy.test.ts'],
    newTestContents: [
      {
        filePath: 'test/dummy.test.ts',
        content: `test('tautology', () => {\n  assert.deepStrictEqual(payload, payload);\n  assert.deepEqual(config, config);\n});`
      }
    ],
    reportedPassedCount: 1,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, true);
  assert.strictEqual(report.verdict, 'REJECTED');
  assert.strictEqual(report.vacuousAssertionsFound, 2);
});
