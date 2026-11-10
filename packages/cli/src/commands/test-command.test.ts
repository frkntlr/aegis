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

async function inFixtureDirectory(root: string, action: () => Promise<void>): Promise<void> {
  const originalCwd = process.cwd();
  const previousEnv = { AEGIS_WORKSPACE: process.env.AEGIS_WORKSPACE, AEGIS_INBOX_PATH: process.env.AEGIS_INBOX_PATH };
  process.chdir(root);
  delete process.env.AEGIS_WORKSPACE;
  delete process.env.AEGIS_INBOX_PATH;
  try { await action(); } finally {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

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

    await inFixtureDirectory(tmpDir, async () => {
      const passed = await handleTestCommand('--soft', '--json');
      assert.strictEqual(passed, true);
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('runResilientTest with offline: true executes via OfflineTestHarness with network shield', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-offline-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'offline-project',
      scripts: {
        test: 'node -e "if (process.env.AEGIS_OFFLINE_SHIELD_ACTIVE !== \'1\') process.exit(2); process.exit(0);"'
      }
    }), 'utf8');

    const res = await runResilientTest({ cwd: tmpDir, offline: true, timeoutMs: 5000 });
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.exitCode, 0);
    assert.strictEqual(res.offlineVerified, true);
    assert.ok(res.message.includes('offline'));
    assert.ok(res.telemetryPath && fs.existsSync(res.telemetryPath));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('handleTestCommand parses --offline flag and runs isolated offline test', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-offline-cmd-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'offline-cmd-project',
      scripts: { test: 'node -e "process.exit(0)"' }
    }), 'utf8');

    await inFixtureDirectory(tmpDir, async () => {
      const passed1 = await handleTestCommand('--offline', '--soft', '--json');
      assert.strictEqual(passed1, true);

      const passed2 = await handleTestCommand('test:offline', '--soft', '--json');
      assert.strictEqual(passed2, true);
    });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('runResilientTest offline mode captures failure and formats diagnostic', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-offline-fail-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'offline-fail-project',
      scripts: {
        test: 'node -e "console.error(\'Error: Offline network connection blocked\');process.exit(1)"'
      }
    }), 'utf8');

    const res = await runResilientTest({ cwd: tmpDir, offline: true, timeoutMs: 5000 });
    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.exitCode, 1);
    assert.strictEqual(res.offlineVerified, true);
    assert.ok(res.diagnostic !== undefined);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
