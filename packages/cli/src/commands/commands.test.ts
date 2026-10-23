import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { showBanner } from './banner.js';
import { handleEstimate, handleDiff, handleInspect, handleSkeleton, handleVerify } from './dev-commands.js';

function captureOutput(fn: () => void): string {
  const originalLog = console.log;
  const originalErr = console.error;
  let logs = '';
  console.log = (...args: any[]) => { logs += args.join(' ') + '\n'; };
  console.error = (...args: any[]) => { logs += args.join(' ') + '\n'; };
  try {
    fn();
    return logs;
  } finally {
    console.log = originalLog;
    console.error = originalErr;
  }
}

test('showBanner outputs engine branding', () => {
  const output = captureOutput(() => showBanner());
  assert.ok(output.includes('AEGIS - Autonomous Vibe Coding Engine'));
});

test('handleEstimate prints dynamic timeout estimate', () => {
  const output = captureOutput(() => handleEstimate(['estimate', '2', '4', '1', '12']));
  assert.ok(output.includes('Dynamic Timeout Estimation'));
  assert.ok(output.includes('Timeout Limit:'));
});

test('handleDiff validates a surgical patch successfully', () => {
  const patch = `--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n-old\n+new\n`;
  const output = captureOutput(() => handleDiff(patch));
  assert.ok(output.includes('Diff is Surgical'));
});

test('handleInspect runs zero-token telemetry layout inspection', () => {
  const output = captureOutput(() => handleInspect());
  assert.ok(output.includes('Zero-Token Telemetry UI Inspection'));
  assert.ok(output.includes('PASSED'));
});

test('handleSkeleton and handleVerify inspect target files accurately', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cmd-test-'));
  const testFile = path.join(tmpDir, 'sample.ts');
  fs.writeFileSync(testFile, 'export function add(a: number, b: number): number { return a + b; }\n', 'utf8');

  try {
    const skelOut = captureOutput(() => handleSkeleton(testFile));
    assert.ok(skelOut.includes('AST Skeleton for:'));
    assert.ok(skelOut.includes('Token Savings:'));

    const verifyOut = captureOutput(() => handleVerify(testFile));
    assert.ok(verifyOut.includes('Iron Cage: PASSED'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
