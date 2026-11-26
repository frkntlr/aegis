/**
 * @file arch-health-command.test.ts
 * Unit and CLI integration tests for `aegis arch:health` and `aegis arch:audit`.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ArchitectureHealthReport } from '@aegis/iron-cage';
import {
  handleArchHealth,
  parseArchHealthArgs,
  resolveArchHealthTarget,
  type ArchHealthDeps
} from './arch-health-command.js';
import { COMMAND_MAP } from '../bin/command-registry.js';
import { CORE_MCP_TOOLS, executeMcpTool } from './mcp-tool-dispatcher.js';
import { generateLanguageConstitution } from './language-constitution.js';
import { HELP_LINES } from '../bin/help-text.js';

function makeReport(overrides: Partial<ArchitectureHealthReport> = {}): ArchitectureHealthReport {
  return {
    targetDir: '/repo/packages',
    healthScore: 95,
    summary: {
      scannedFiles: 10,
      runtimeCycleCount: 0,
      typeOnlyCycleCount: 0,
      complexityViolations: 0,
      cognitiveViolations: 0,
      paramViolations: 0,
      godClassViolations: 0,
      fanOutViolations: 0,
      budgetPressureFiles: 0,
      healthScore: 95
    },
    runtimeCycles: [],
    typeOnlyCycles: [],
    violations: [],
    budgetPressure: [],
    prescriptions: [],
    ...overrides
  };
}

function captureLogs(fn: () => void): { out: string[]; err: string[] } {
  const origLog = console.log;
  const origErr = console.error;
  const out: string[] = [];
  const err: string[] = [];
  console.log = (...args: unknown[]) => out.push(args.join(' '));
  console.error = (...args: unknown[]) => err.push(args.join(' '));
  try {
    fn();
    return { out, err };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

test('parseArchHealthArgs parses flags and defaults accurately', () => {
  const defaults = parseArchHealthArgs([]);
  assert.strictEqual(defaults.targetDir, undefined);
  assert.deepStrictEqual(defaults, {
    jsonOutput: false,
    strict: false,
    maxCycles: 0,
    minScore: 70
  });
  assert.deepStrictEqual(
    parseArchHealthArgs(['packages/cli', '--json', '--strict', '--max-cycles=2', '--min-score=85']),
    { targetDir: 'packages/cli', jsonOutput: true, strict: true, maxCycles: 2, minScore: 85 }
  );
  const spaced = parseArchHealthArgs(['--max-cycles', '3', '--min-score', '60']);
  assert.strictEqual(spaced.targetDir, undefined);
  assert.deepStrictEqual(spaced, {
    jsonOutput: false,
    strict: false,
    maxCycles: 3,
    minScore: 60
  });
});

test('resolveArchHealthTarget defaults to packages directory when present', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-health-root-'));
  try {
    assert.strictEqual(resolveArchHealthTarget(undefined, tmpRoot), tmpRoot);
    fs.mkdirSync(path.join(tmpRoot, 'packages'));
    assert.strictEqual(resolveArchHealthTarget(undefined, tmpRoot), path.join(tmpRoot, 'packages'));
    assert.strictEqual(resolveArchHealthTarget('custom/dir', tmpRoot), path.resolve(tmpRoot, 'custom/dir'));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('handleArchHealth outputs JSON cleanly without banner and enforces --strict', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-health-json-'));
  const prevExit = process.exitCode;
  const deps: ArchHealthDeps = {
    auditDirectory: () => makeReport({ targetDir: tmpDir, healthScore: 65, runtimeCycles: [['a.ts', 'b.ts', 'a.ts']] }),
    formatReport: () => 'FORMATTED REPORT'
  };
  try {
    process.exitCode = 0;
    const { out } = captureLogs(() => handleArchHealth([tmpDir, '--json', '--strict', '--max-cycles=0', '--min-score=70'], deps));
    assert.strictEqual(process.exitCode, 1);
    const parsed = JSON.parse(out.join('\n')) as ArchitectureHealthReport;
    assert.strictEqual(parsed.healthScore, 65);
    assert.strictEqual(parsed.runtimeCycles.length, 1);
  } finally {
    process.exitCode = prevExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleArchHealth passes --strict when within thresholds and reports missing target', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-health-pass-'));
  const prevExit = process.exitCode;
  const deps: ArchHealthDeps = {
    auditDirectory: () => makeReport({ targetDir: tmpDir, healthScore: 90, runtimeCycles: [] }),
    formatReport: () => 'Architecture Health Report: OK'
  };
  try {
    process.exitCode = 0;
    const { out } = captureLogs(() => handleArchHealth([tmpDir, '--strict'], deps));
    assert.strictEqual(process.exitCode, 0);
    assert.ok(out.some((line) => line.includes('Architecture Health Report: OK')));

    process.exitCode = 0;
    const missing = captureLogs(() => handleArchHealth([path.join(tmpDir, 'does-not-exist'), '--json'], deps));
    assert.strictEqual(process.exitCode, 1);
    assert.ok(missing.out.join('\n').includes('does not exist'));
  } finally {
    process.exitCode = prevExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('COMMAND_MAP registers arch:health and arch:audit handlers', () => {
  assert.strictEqual(typeof COMMAND_MAP['arch:health'], 'function');
  assert.strictEqual(typeof COMMAND_MAP['arch:audit'], 'function');
});

test('CORE_MCP_TOOLS registers arch_health and executeMcpTool audits directory', async () => {
  const tool = CORE_MCP_TOOLS.find(t => t.name === 'arch_health');
  assert.ok(tool, 'arch_health missing from CORE_MCP_TOOLS');
  const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  assert.ok(props.dir && props.strict && props.maxCycles && props.minScore);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-health-mcp-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'clean.ts'), 'export function add(a: number, b: number): number { return a + b; }\n');
    const raw = await executeMcpTool('arch_health', { dir: tmpDir });
    const parsed = JSON.parse(raw) as ArchitectureHealthReport & { passed: boolean };
    assert.strictEqual(parsed.passed, true);
    assert.strictEqual(parsed.healthScore, 100);
    assert.strictEqual(parsed.summary.scannedFiles, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('language constitution includes Demir Kafes v2 thresholds and help-text lists arch:health', () => {
  const constitution = generateLanguageConstitution(['src/example.ts']);
  assert.ok(constitution.includes('CC <= 15'));
  assert.ok(constitution.includes('<= 5 params'));
  assert.ok(constitution.includes('<= 12 methods/class'));
  assert.ok(constitution.includes('<= 10 imports/file'));
  assert.ok(constitution.includes('0 circular runtime imports'));
  assert.ok(constitution.includes('< 250 lines'));
  assert.ok(HELP_LINES.some(line => line.includes('arch:health')));
});
