import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleCageCheck } from './dev-commands.js';
import { parseCageCheckArgs } from './dev-helpers.js';

function captureOutput(fn: () => void): string {
  const originalLog = console.log;
  const originalErr = console.error;
  let logs = '';
  console.log = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  console.error = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  try {
    fn();
    return logs;
  } finally {
    console.log = originalLog;
    console.error = originalErr;
  }
}

test('parseCageCheckArgs correctly parses flags and targetDir', () => {
  const empty = parseCageCheckArgs([]);
  assert.strictEqual(empty.targetDir, undefined);
  assert.strictEqual(empty.noCache, undefined);
  assert.strictEqual(empty.jsonOutput, undefined);

  const parsed = parseCageCheckArgs(['src/test', '--no-cache', '--json']);
  assert.strictEqual(parsed.targetDir, 'src/test');
  assert.strictEqual(parsed.noCache, true);
  assert.strictEqual(parsed.jsonOutput, true);

  const force = parseCageCheckArgs(['--force']);
  assert.strictEqual(force.noCache, true);
});

test('handleCageCheck runs cold scan and caches on hot run', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cage-check-test-'));
  const f1 = path.join(tmpDir, 'service.ts');
  fs.writeFileSync(f1, 'export function add(a: number, b: number): number {\n  return a + b;\n}\n', 'utf8');

  try {
    // 1. Cold scan with --no-cache
    const cold = captureOutput(() => handleCageCheck([tmpDir, '--no-cache']));
    assert.ok(cold.includes('Files Scanned: 1 (0 cached, 0ms)'));
    assert.ok(cold.includes('100% CLEAN'));

    // 2. Populate cache
    captureOutput(() => handleCageCheck([tmpDir]));

    // 3. Hot scan (should hit cache)
    const hot = captureOutput(() => handleCageCheck([tmpDir]));
    assert.ok(hot.includes('Files Scanned: 1 (1 cached, 0ms)'));
    assert.ok(hot.includes('100% CLEAN'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleCageCheck produces structured JSON output on --json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cage-check-json-test-'));
  const f1 = path.join(tmpDir, 'math.ts');
  fs.writeFileSync(f1, 'export const PI = 3.14159;\n', 'utf8');

  try {
    const jsonStr = captureOutput(() => handleCageCheck([tmpDir, '--json', '--no-cache']));
    const data = JSON.parse(jsonStr.trim()) as { filesScanned: number; compliantCount: number; clean: boolean };
    assert.strictEqual(data.filesScanned, 1);
    assert.strictEqual(data.compliantCount, 1);
    assert.strictEqual(data.clean, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleCageCheck reports violations accurately in test mode', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cage-check-fail-test-'));
  const f1 = path.join(tmpDir, 'large.ts');
  // Generate function with 45 lines (>40 limit)
  const body = Array.from({ length: 45 }, (_, i) => `  const v${i} = ${i};`).join('\n');
  fs.writeFileSync(f1, `export function largeFn(): void {\n${body}\n}\n`, 'utf8');

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    const output = captureOutput(() => handleCageCheck([tmpDir, '--no-cache']));
    assert.ok(output.includes('Violations Found (1)'));
    assert.ok(output.includes('MAX_FUNCTION_LINES'));
  } finally {
    process.env.NODE_ENV = prevEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
