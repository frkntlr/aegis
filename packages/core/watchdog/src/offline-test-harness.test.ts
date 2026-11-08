import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import * as dns from 'node:dns';
import * as dnsPromises from 'node:dns/promises';
import * as http from 'node:http';
import {
  installOfflineShim,
  uninstallOfflineShim,
  isOfflineShimInstalled,
  getBlockedAttemptsCount,
  resetBlockedAttemptsCount
} from './nodejs-offline-shim.js';
import { OfflineTestHarness } from './offline-test-harness.js';

test('Node.js Offline Shim blocks global fetch with ECONNREFUSED', async () => {
  resetBlockedAttemptsCount();
  installOfflineShim();
  assert.strictEqual(isOfflineShimInstalled(), true);

  try {
    let thrownError: unknown;
    try {
      await globalThis.fetch('https://example.com');
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError instanceof TypeError);
    assert.strictEqual((thrownError as TypeError).message, 'fetch failed');
    const cause = (thrownError as { cause?: { code?: string } }).cause;
    assert.strictEqual(cause?.code, 'ECONNREFUSED');
    assert.ok(getBlockedAttemptsCount() >= 1);
  } finally {
    uninstallOfflineShim();
    assert.strictEqual(isOfflineShimInstalled(), false);
  }
});

test('Node.js Offline Shim intercepts dns lookups with ENOTFOUND', async () => {
  resetBlockedAttemptsCount();
  installOfflineShim();

  try {
    await new Promise<void>((resolve, reject) => {
      dns.lookup('example.test', (err) => {
        if (err && (err as { code?: string }).code === 'ENOTFOUND') {
          resolve();
        } else {
          reject(new Error(`Expected ENOTFOUND but got: ${err?.message}`));
        }
      });
    });

    await assert.rejects(
      async () => {
        await dnsPromises.lookup('example.test');
      },
      (err: unknown) => {
        return (err as { code?: string }).code === 'ENOTFOUND';
      }
    );
  } finally {
    uninstallOfflineShim();
  }
});

test('Node.js Offline Shim intercepts net sockets and http requests', async () => {
  resetBlockedAttemptsCount();
  installOfflineShim();

  try {
    await new Promise<void>((resolve) => {
      const socket = new net.Socket();
      socket.on('error', (err) => {
        assert.strictEqual((err as { code?: string }).code, 'ECONNREFUSED');
        resolve();
      });
      socket.connect(8080, '127.0.0.1');
    });

    await new Promise<void>((resolve) => {
      const req = http.get('http://example.com', () => {
        assert.fail('Should not receive response');
      });
      req.on('error', (err) => {
        assert.strictEqual((err as { code?: string }).code, 'ECONNREFUSED');
        resolve();
      });
    });
  } finally {
    uninstallOfflineShim();
  }
});

test('OfflineTestHarness runs child process in offline isolation and records telemetry', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-offline-test-'));
  try {
    const harness = new OfflineTestHarness({
      cwd: tmpDir,
      timeoutMs: 15_000,
      tier: 'proxy_blackhole'
    });

    const script = 'console.log("OFFLINE_OK:" + process.env.HTTP_PROXY);';
    const res = await harness.run(process.execPath, ['-e', script]);

    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.offlineVerified, true);
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stdout.includes('OFFLINE_OK:http://127.0.0.1:9'));
    assert.ok(fs.existsSync(res.telemetryPath));

    const raw = fs.readFileSync(res.telemetryPath, 'utf8');
    const parsed = JSON.parse(raw) as { offlineVerified: boolean; tier: string };
    assert.strictEqual(parsed.offlineVerified, true);
    assert.strictEqual(parsed.tier, 'proxy_blackhole');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('OfflineTestHarness blocks child process network via process_shim injection', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-offline-shim-test-'));
  try {
    const harness = new OfflineTestHarness({
      cwd: tmpDir,
      timeoutMs: 15_000,
      tier: 'process_shim'
    });

    const childScript = `
      fetch('https://example.com')
        .then(() => { process.exit(1); })
        .catch((err) => {
          if (err.cause && err.cause.code === 'ECONNREFUSED') {
            console.log('SHIM_BLOCKED_OK');
            process.exit(0);
          } else {
            console.error('UNEXPECTED_CAUSE:', err);
            process.exit(2);
          }
        });
    `;
    const res = await harness.run(process.execPath, ['-e', childScript]);

    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.offlineVerified, true);
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stdout.includes('SHIM_BLOCKED_OK'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
