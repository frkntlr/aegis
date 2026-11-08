/**
 * @file test-command.test.ts
 * Unit tests for Aegis Resilient Test Runner Shield.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { runResilientTest, handleTestCommand } from './test-command.js';

test('runResilientTest executes in node project and returns structured result', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-test-cmd-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'sample-project',
      scripts: { test: 'node -e "process.exit(0)"' }
    }), 'utf8');

    const res = await runResilientTest({ cwd: tmpDir, timeoutMs: 5000 });
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.timedOut, false);
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.durationMs >= 0);
    assert.ok(res.message.includes('passed'));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('runResilientTest terminates timed-out process tree and reports timeout cleanly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-timeout-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'slow-project',
      scripts: { test: 'node -e "setTimeout(()=>{}, 10000)"' }
    }), 'utf8');

    const start = Date.now();
    const res = await runResilientTest({ cwd: tmpDir, timeoutMs: 800 });
    const elapsed = Date.now() - start;

    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.timedOut, true);
    assert.strictEqual(res.exitCode, 124);
    assert.ok(res.message.includes('TIMED OUT'));
    assert.ok(elapsed < 4000, `Expected elapsed < 4000ms, got ${elapsed}ms`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('runResilientTest captures failure and enriches with Socratic diagnosis', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-fail-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'failing-project',
      scripts: {
        test: 'node -e "console.error(\'Error: Boom in src/math.ts:42:15\');process.exit(1)"'
      }
    }), 'utf8');

    const res = await runResilientTest({ cwd: tmpDir, timeoutMs: 5000 });
    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.exitCode, 1);
    assert.ok(res.diagnostic !== undefined);
    assert.ok(res.diagnostic?.category === 'TEST_FAILURE' || res.diagnostic?.category === 'RUNTIME_ERROR');
    assert.ok(res.stderr.includes('Boom'));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('handleTestCommand handles --soft flag and returns boolean outcome', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-soft-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'soft-project',
      scripts: { test: 'node -e "process.exit(0)"' }
    }), 'utf8');

    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const passed = await handleTestCommand('--soft', '--json');
      assert.strictEqual(passed, true);
    } finally {
      process.chdir(origCwd);
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
