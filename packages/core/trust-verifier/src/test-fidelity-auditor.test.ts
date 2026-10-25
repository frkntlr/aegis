import { test } from 'node:test';
import * as assert from 'node:assert';
import { TestFidelityAuditor } from './test-fidelity-auditor.js';
import { ImmutableOracle } from './immutable-oracle.js';

test('TestFidelityAuditor detects vacuous assertions on string/number/boolean literals (#208)', () => {
  const result = TestFidelityAuditor.audit([
    {
      filePath: 'tests/vacuous.test.ts',
      content: `
it('fake literal assertion', () => {
  expect("literal string").toBeDefined();
  expect(12345).toBeTruthy();
  expect(true).toBeTruthy();
});
      `.trim()
    }
  ]);

  assert.strictEqual(result.vacuousCount, 3);
  assert.ok(result.issues.length >= 3);
});

test('TestFidelityAuditor detects empty test blocks without assertions (#209)', () => {
  const result = TestFidelityAuditor.audit([
    {
      filePath: 'tests/empty.test.ts',
      content: `
it('does nothing', () => {
  const a = 1;
});
      `.trim()
    }
  ]);

  assert.ok(result.issues.some(i => i.includes('Empty test block')));
});

test('TestFidelityAuditor detects conditional assertion bypasses (#210)', () => {
  const result = TestFidelityAuditor.audit([
    {
      filePath: 'tests/bypass.test.ts',
      content: `
it('bypassed', () => {
  if (false) {
    expect(true).toBe(false);
  }
});
      `.trim()
    }
  ]);

  assert.strictEqual(result.conditionalBypassCount, 1);
  assert.ok(result.issues.some(i => i.includes('Conditional assertion bypass')));
});

test('TestFidelityAuditor detects unlinked new test files (#211)', () => {
  const result = TestFidelityAuditor.audit(
    [
      {
        filePath: 'tests/unlinked.test.ts',
        content: `it('tests unrelated thing', () => { expect(1 + 1).toBe(2); });`,
        isNew: true
      }
    ],
    ['packages/core/src/AuthService.ts']
  );

  assert.deepStrictEqual(result.unlinkedNewTests, ['tests/unlinked.test.ts']);
  assert.ok(result.issues.some(i => i.includes('Unlinked test')));
});

test('TestFidelityAuditor detects commented out assertions when fake pass occurs (#212)', () => {
  const result = TestFidelityAuditor.audit([
    {
      filePath: 'tests/suppressed.test.ts',
      content: `
it('suppressed', () => {
  // expect(auth.login()).toBe(true);
});
      `.trim()
    }
  ]);

  assert.strictEqual(result.commentedAssertionCount, 1);
  assert.ok(result.issues.some(i => i.includes('fake pass suppression')));
});

test('TestFidelityAuditor detects hollow mock hallucinations (#213)', () => {
  const result = TestFidelityAuditor.audit([
    {
      filePath: 'tests/mock.test.ts',
      content: `
class MockDatabaseClient {
  query() { return null; }
  connect() {}
  disconnect() {}
}
it('tests mock', () => {
  expect(1).toBe(1);
});
      `.trim()
    }
  ]);

  assert.strictEqual(result.hollowMockCount, 1);
  assert.ok(result.issues.some(i => i.includes('Hollow mock hallucination')));
});

test('TestFidelityAuditor detects out-of-scope test modifications (#216)', () => {
  const result = TestFidelityAuditor.audit(
    [
      {
        filePath: 'packages/forbidden/test.ts',
        content: `it('ok', () => { expect(1).toBe(1); });`
      }
    ],
    [],
    ['packages/allowed/']
  );

  assert.deepStrictEqual(result.scopeViolations, ['packages/forbidden/test.ts']);
});

test('TestFidelityAuditor rejects hollow test suites with assertion density < 1.0 (#217)', () => {
  const result = TestFidelityAuditor.audit([
    {
      filePath: 'tests/density.test.ts',
      content: `
it('test 1', () => { const a = 1; });
it('test 2', () => { expect(2).toBe(2); });
it('test 3', () => { const c = 3; });
      `.trim()
    }
  ]);

  // 1 assertion across 3 test blocks = density 0.33 < 1.0
  assert.ok(result.assertionDensity < 1.0);
  assert.ok(result.issues.some(i => i.includes('assertion density')));
});

test('ImmutableOracle integrates TestFidelityAuditor and rejects unfaithful tests', () => {
  const oracle = new ImmutableOracle();
  const report = oracle.audit({
    modifiedFiles: ['src/UserService.ts'],
    newTestContents: [
      {
        filePath: 'tests/UserService.test.ts',
        content: `
it('vacuous', () => {
  expect("user").toBeDefined();
});
        `.trim(),
        isNew: true
      }
    ],
    reportedPassedCount: 1,
    reportedFailedCount: 0
  });

  assert.strictEqual(report.suspicious, true);
  assert.strictEqual(report.verdict, 'REJECTED');
  assert.ok(report.vacuousAssertionsFound >= 1);
});
