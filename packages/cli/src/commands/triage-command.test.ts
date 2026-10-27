import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleTriage, parseTriageArgs } from './triage-command.js';

function captureOutput(fn: () => void | Promise<void>): Promise<string> | string {
  const originalLog = console.log;
  const originalErr = console.error;
  let logs = '';
  console.log = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  console.error = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => logs).finally(() => {
        console.log = originalLog;
        console.error = originalErr;
      });
    }
    return logs;
  } finally {
    if (console.log !== originalLog) {
      console.log = originalLog;
      console.error = originalErr;
    }
  }
}

test('parseTriageArgs correctly extracts options and paths', () => {
  const opts = parseTriageArgs([
    'src',
    '--with-tests=last-run.json',
    '--with-godot',
    'godot.log',
    '--no-cache',
    '--auto-dispatch'
  ]);

  assert.strictEqual(opts.targetDir, 'src');
  assert.strictEqual(opts.withTests, 'last-run.json');
  assert.strictEqual(opts.withGodot, 'godot.log');
  assert.strictEqual(opts.noCache, true);
  assert.strictEqual(opts.autoDispatch, true);
});

test('handleTriage runs fast clean scan with cache reporting', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-clean-test-'));
  const testFile = path.join(tmpDir, 'service.ts');
  fs.writeFileSync(testFile, 'export function add(a: number, b: number): number { return a + b; }\n', 'utf8');

  const output = captureOutput(() => handleTriage([tmpDir, '--no-cache'])) as string;
  assert.ok(output.includes('Evidence-Based Bug Triage'));
  assert.ok(output.includes('Critical Defects: 0'));
  assert.ok(output.includes('CLEAN'));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('handleTriage ingests live test results and flags critical defect', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-live-test-'));
  const testFile = path.join(tmpDir, 'service.ts');
  fs.writeFileSync(testFile, 'export function add(a: number, b: number): number { return a + b; }\n', 'utf8');

  const lastRunFile = path.join(tmpDir, 'last-test-run.json');
  fs.writeFileSync(lastRunFile, JSON.stringify({
    numFailedTests: 1,
    failures: ['AssertionError: expected true to be false at src/core.ts:25:5']
  }), 'utf8');

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    const output = captureOutput(() => handleTriage([
      tmpDir,
      `--with-tests=${lastRunFile}`,
      '--no-cache'
    ])) as string;

    assert.ok(output.includes('Critical Defects: 1'));
    assert.ok(output.includes('DEFECTS FOUND') || output.includes('Critical Defect(s) need immediate fix'));
    assert.ok(output.includes('AssertionError'));
  } finally {
    process.env.NODE_ENV = prevEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleTriage ingests godot runtime crash log and stratifies finding', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-godot-test-'));
  const testFile = path.join(tmpDir, 'player.gd');
  fs.writeFileSync(testFile, 'extends Node2D\nfunc _ready() -> void:\n\tpass\n', 'utf8');

  const godotLog = path.join(tmpDir, 'godot_debug.log');
  fs.writeFileSync(godotLog, 'SCRIPT ERROR: Parse Error: Invalid token\n   at: res://player.gd:10\n', 'utf8');

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    const output = captureOutput(() => handleTriage([
      tmpDir,
      `--with-godot=${godotLog}`,
      '--no-cache'
    ])) as string;

    assert.ok(output.includes('Critical Defects: 1'));
    assert.ok(output.includes('GDScript Compilation / Parse Failure') || output.includes('Parse Error'));
  } finally {
    process.env.NODE_ENV = prevEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
