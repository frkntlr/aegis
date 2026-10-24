import { test } from 'node:test';
import * as assert from 'node:assert';
import { EvidenceBasedTriageGate } from './triage-gate.js';

test('EvidenceBasedTriageGate categorizes Demir Kafes violations as ARCHITECTURAL_DEBT, not critical bugs', () => {
  const gate = new EvidenceBasedTriageGate();
  const report = gate.evaluate({
    targetFiles: ['src/heavy.ts'],
    violations: [
      {
        rule: 'MAX_FUNCTION_LINES',
        filePath: 'src/heavy.ts',
        line: 10,
        message: 'Function exceeds 40 lines (actual: 45 lines).',
        severity: 'error'
      },
      {
        rule: 'MAX_FILE_LINES',
        filePath: 'src/heavy.ts',
        message: 'File exceeds 300 lines (actual: 320 lines).',
        severity: 'error'
      }
    ]
  });

  assert.strictEqual(report.criticalCount, 0);
  assert.strictEqual(report.debtCount, 2);
  assert.strictEqual(report.smellCount, 0);
  assert.strictEqual(report.clean, true);
  assert.ok(report.summary.includes('CLEAN'));
});

test('EvidenceBasedTriageGate flags failing tests and engine error logs as CRITICAL_DEFECT', () => {
  const gate = new EvidenceBasedTriageGate();
  const report = gate.evaluate({
    targetFiles: ['src/player.gd'],
    failingTestsCount: 2,
    testFailures: ['AssertionError: expected true but got false'],
    engineErrors: ['ERROR: Null instance access in _process() at line 42', 'SCRIPT ERROR: Parse Error'],
    violations: [
      {
        rule: 'MAX_FUNCTION_LINES',
        filePath: 'src/player.gd',
        line: 20,
        message: 'Function exceeds 40 lines.',
        severity: 'error'
      }
    ]
  });

  assert.strictEqual(report.criticalCount >= 3, true);
  assert.strictEqual(report.debtCount, 1);
  assert.strictEqual(report.clean, false);
  assert.ok(report.findings.some(f => f.category === 'CRITICAL_DEFECT' && f.evidence.includes('Null instance')));
});

test('EvidenceBasedTriageGate separates code smell from debt and defect', () => {
  const gate = new EvidenceBasedTriageGate();
  const report = gate.evaluate({
    targetFiles: ['src/ui.gd'],
    violations: [
      {
        rule: 'GD_003_ONREADY_SAFETY',
        filePath: 'src/ui.gd',
        line: 5,
        message: 'Empty @onready reference detected.',
        severity: 'error'
      }
    ]
  });

  assert.strictEqual(report.criticalCount, 0);
  assert.strictEqual(report.debtCount, 0);
  assert.strictEqual(report.smellCount, 1);
  assert.strictEqual(report.clean, true);
});

test('EvidenceBasedTriageGate triageFile evaluates file content directly', () => {
  const gate = new EvidenceBasedTriageGate();
  const longFunc = 'func test():\n' + Array.from({ length: 45 }, (_, i) => `    var x${i} = ${i}`).join('\n');
  const report = gate.triageFile('test.gd', longFunc);

  assert.strictEqual(report.criticalCount, 0);
  assert.strictEqual(report.debtCount >= 1, true);
  assert.strictEqual(report.clean, true);
});
