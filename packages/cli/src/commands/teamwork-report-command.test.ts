import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { isolateTeamworkTestWorkspace } from './teamwork-test-workspace.js';
import {
  parseReportArgs,
  handleTeamworkReport
} from './teamwork-report-command.js';

isolateTeamworkTestWorkspace('report');

test('parseReportArgs correctly parses flags and planId', () => {
  const res1 = parseReportArgs();
  assert.strictEqual(res1.targetPlanId, undefined);
  assert.strictEqual(res1.isCompact, false);
  assert.strictEqual(res1.isJson, false);
  assert.strictEqual(res1.isSave, false);

  const res2 = parseReportArgs('tw-123', '--compact', '--save');
  assert.strictEqual(res2.targetPlanId, 'tw-123');
  assert.strictEqual(res2.isCompact, true);
  assert.strictEqual(res2.isJson, false);
  assert.strictEqual(res2.isSave, true);

  const res3 = parseReportArgs('-c', '-s', 'tw-456');
  assert.strictEqual(res3.targetPlanId, 'tw-456');
  assert.strictEqual(res3.isCompact, true);
  assert.strictEqual(res3.isSave, true);

  const res4 = parseReportArgs('--json');
  assert.strictEqual(res4.isJson, true);
  assert.strictEqual(res4.targetPlanId, undefined);

  const res5 = parseReportArgs('-j');
  assert.strictEqual(res5.isJson, true);
});

test('handleTeamworkReport outputs formatted markdown report by default', () => {
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    handleTeamworkReport('tw-test-default');
    const combined = logs.join('\n');
    assert.ok(combined.includes('Aegis Teamwork Mission Report: tw-test-default'));
    assert.ok(combined.includes('Demir Kafes Compliance'));
  } finally {
    console.log = originalLog;
  }
});

test('handleTeamworkReport outputs ultra-fast compact summary with --compact flag', () => {
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    const start = performance.now();
    handleTeamworkReport('tw-test-compact', '--compact');
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 20, `Compact report took too long: ${elapsed}ms`);
    const combined = logs.join('\n');
    assert.ok(combined.includes('[TW-REPORT: tw-test-compact]'));
    assert.ok(combined.includes('DemirKafes: 100% Pass'));
  } finally {
    console.log = originalLog;
  }
});

test('handleTeamworkReport outputs valid structured JSON with --json flag', () => {
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    handleTeamworkReport('tw-test-json', '--json');
    const jsonOutput = logs.join('\n');
    const parsed = JSON.parse(jsonOutput) as {
      planId: string;
      concurrency: { totalAgents: number };
      qualityGate: { demirKafesCompliant: boolean };
    };
    assert.strictEqual(parsed.planId, 'tw-test-json');
    assert.ok(typeof parsed.concurrency.totalAgents === 'number');
    assert.strictEqual(parsed.qualityGate.demirKafesCompliant, true);
  } finally {
    console.log = originalLog;
  }
});

test('handleTeamworkReport persists report to .aegis/reports/ with --save flag', () => {
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  const planId = `tw-save-test-${Date.now()}`;
  try {
    handleTeamworkReport(planId, '--save');
    const combined = logs.join('\n');
    assert.ok(combined.includes('Report saved to:'));
    const root = resolveSafeRepoRoot();
    const expectedFilePath = path.resolve(root, '.aegis', 'reports', `report-${planId}.md`);
    assert.ok(fs.existsSync(expectedFilePath), `File ${expectedFilePath} was not created`);
    const content = fs.readFileSync(expectedFilePath, 'utf8');
    assert.ok(content.includes(planId));
    // Clean up created file
    fs.unlinkSync(expectedFilePath);
  } finally {
    console.log = originalLog;
  }
});
