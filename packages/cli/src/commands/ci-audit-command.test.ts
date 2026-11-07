/**
 * @file ci-audit-command.test.ts
 * Unit tests for CI/CD pipeline verification runner & auditor.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { test } from 'node:test';
import * as assert from 'node:assert';

process.env.NODE_ENV = 'test';
process.env.AEGIS_TEST = '1';

import {
  CI_GATES,
  parseCiAuditOptions,
  matchesStep,
  filterCiGates,
  formatDuration,
  CiAuditRunner,
  handleCiAudit,
  type CiStepDefinition
} from './ci-audit-command.js';

test('CI_GATES contains all 10 deterministic pipeline gates', () => {
  assert.strictEqual(CI_GATES.length, 10);
  const ids = CI_GATES.map(g => g.id);
  assert.deepStrictEqual(ids, [
    'build',
    'typecheck',
    'lint',
    'deps:drift',
    'cage:check',
    'verify',
    'test',
    'inspect',
    'godot',
    'mutate'
  ]);

  const coreGates = CI_GATES.filter(g => g.isCore);
  assert.strictEqual(coreGates.length, 5);
  const coreIds = coreGates.map(g => g.id);
  assert.ok(coreIds.includes('build'));
  assert.ok(coreIds.includes('typecheck'));
  assert.ok(coreIds.includes('lint'));
  assert.ok(coreIds.includes('cage:check'));
  assert.ok(coreIds.includes('test'));
});

test('parseCiAuditOptions parses flags and values correctly', () => {
  const opts1 = parseCiAuditOptions(['--fast', '--json']);
  assert.strictEqual(opts1.fast, true);
  assert.strictEqual(opts1.json, true);

  const opts2 = parseCiAuditOptions(['-j', '--step=cage:check', '--fail-fast']);
  assert.strictEqual(opts2.json, true);
  assert.strictEqual(opts2.step, 'cage:check');
  assert.strictEqual(opts2.failFast, true);

  const opts3 = parseCiAuditOptions(['--step', 'build', '--bail']);
  assert.strictEqual(opts3.step, 'build');
  assert.strictEqual(opts3.failFast, true);
});

test('matchesStep resolves gates by ID, alias, or name', () => {
  const buildGate = CI_GATES.find(g => g.id === 'build')!;
  assert.strictEqual(matchesStep(buildGate, 'build'), true);
  assert.strictEqual(matchesStep(buildGate, 'typescript'), true);

  const cageGate = CI_GATES.find(g => g.id === 'cage:check')!;
  assert.strictEqual(matchesStep(cageGate, 'cage'), true);
  assert.strictEqual(matchesStep(cageGate, 'cage:check'), true);
  assert.strictEqual(matchesStep(cageGate, 'cagecheck'), true);

  const godotGate = CI_GATES.find(g => g.id === 'godot')!;
  assert.strictEqual(matchesStep(godotGate, 'godot'), true);
  assert.strictEqual(matchesStep(godotGate, 'godot:status'), true);
});

test('filterCiGates filters correctly for fast mode and specific steps', () => {
  const fastGates = filterCiGates(CI_GATES, { fast: true });
  assert.strictEqual(fastGates.length, 5);
  assert.ok(fastGates.every(g => g.isCore));

  const stepGate = filterCiGates(CI_GATES, { step: 'mutate' });
  assert.strictEqual(stepGate.length, 1);
  assert.strictEqual(stepGate[0].id, 'mutate');

  const unknown = filterCiGates(CI_GATES, { step: 'nonexistent-gate' });
  assert.strictEqual(unknown.length, 0);

  const all = filterCiGates(CI_GATES, {});
  assert.strictEqual(all.length, 10);
});

test('formatDuration formats milliseconds and seconds appropriately', () => {
  assert.strictEqual(formatDuration(42), '42ms');
  assert.strictEqual(formatDuration(999), '999ms');
  assert.strictEqual(formatDuration(1500), '1.5s');
  assert.strictEqual(formatDuration(60000), '60.0s');
});

test('CiAuditRunner executes gates with mock executor and produces summary', () => {
  const mockExecutor = (cmd: string): { success: boolean; durationMs: number; error?: string } => {
    if (cmd.includes('fail')) {
      return { success: false, durationMs: 50, error: 'Simulated failure' };
    }
    return { success: true, durationMs: 25 };
  };

  const runner = new CiAuditRunner(process.cwd(), mockExecutor);
  const testGates: CiStepDefinition[] = [
    { id: 'g1', name: 'Gate 1', command: 'echo pass', isCore: true },
    { id: 'g2', name: 'Gate 2', command: 'echo pass', isCore: true }
  ];

  const summary = runner.runGates(testGates);
  assert.strictEqual(summary.success, true);
  assert.strictEqual(summary.totalCount, 2);
  assert.strictEqual(summary.passedCount, 2);
  assert.strictEqual(summary.failedCount, 0);
  assert.strictEqual(summary.skippedCount, 0);
  assert.strictEqual(summary.gates.length, 2);
});

test('CiAuditRunner handles failures and failFast early stopping', () => {
  const mockExecutor = (cmd: string): { success: boolean; durationMs: number; error?: string } => {
    if (cmd.includes('fail')) {
      return { success: false, durationMs: 10, error: 'Command failed' };
    }
    return { success: true, durationMs: 10 };
  };

  const runner = new CiAuditRunner(process.cwd(), mockExecutor);
  const testGates: CiStepDefinition[] = [
    { id: 'g1', name: 'Gate 1', command: 'echo fail', isCore: true },
    { id: 'g2', name: 'Gate 2', command: 'echo pass', isCore: true }
  ];

  const summary = runner.runGates(testGates, true);
  assert.strictEqual(summary.success, false);
  assert.strictEqual(summary.passedCount, 0);
  assert.strictEqual(summary.failedCount, 1);
  assert.strictEqual(summary.skippedCount, 1);
  assert.strictEqual(summary.gates[1].skipped, true);
});

test('handleCiAudit runs cleanly with custom runner and supports json output', async () => {
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (msg?: unknown, ...optional: unknown[]): void => {
    logs.push(String(msg));
    if (optional.length > 0) logs.push(optional.map(String).join(' '));
  };

  try {
    const mockRunner = new CiAuditRunner(process.cwd(), () => ({ success: true, durationMs: 5 }));
    const ok = await handleCiAudit(['--fast', '--json'], mockRunner);
    assert.strictEqual(ok, true);

    const jsonStr = logs.find(l => l.includes('"success": true'));
    assert.ok(jsonStr, 'Expected JSON output containing success: true');
    const parsed = JSON.parse(jsonStr!);
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.passedCount, 5);
  } finally {
    console.log = origLog;
  }
});

test('handleCiAudit returns false for unknown step', async () => {
  const ok = await handleCiAudit(['--step=does-not-exist', '--json']);
  assert.strictEqual(ok, false);
});
