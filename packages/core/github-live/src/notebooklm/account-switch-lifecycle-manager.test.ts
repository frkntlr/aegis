/**
 * @file account-switch-lifecycle-manager.test.ts
 * Tests for AccountSwitchLifecycleManager session archiving and automated switch workflow.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AccountSwitchLifecycleManager } from './account-switch-lifecycle-manager.js';

test('archiveCurrentSession copies auth.json to timestamped backup', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-archive-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const authPath = path.join(tempDir, 'auth.json');
  fs.writeFileSync(authPath, JSON.stringify({ cookies: 'SID=orig-sid-123456789012345678901234567890; __Secure-1PSIDTS=orig-ts' }));

  try {
    const backupPath = AccountSwitchLifecycleManager.archiveCurrentSession(authPath);
    assert.ok(backupPath);
    assert.ok(fs.existsSync(backupPath));
    assert.ok(backupPath.includes('auth.backup-'));

    const backups = AccountSwitchLifecycleManager.listBackups(tempDir);
    assert.strictEqual(backups.length, 1);
    assert.strictEqual(backups[0], backupPath);

    const invalidated = AccountSwitchLifecycleManager.invalidateActiveSession(authPath);
    assert.strictEqual(invalidated, true);
    assert.strictEqual(fs.existsSync(authPath), false);

    const restored = AccountSwitchLifecycleManager.restoreArchivedSession(backupPath, authPath);
    assert.strictEqual(restored, true);
    assert.strictEqual(fs.existsSync(authPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('executeSwitch succeeds via zero-click CDP harvester', async () => {
  const tempDir = path.join(os.tmpdir(), `aegis-switch-cdp-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const authPath = path.join(tempDir, 'auth.json');
  fs.writeFileSync(authPath, JSON.stringify({ cookies: 'SID=old-sid-123456789012345678901234567890; __Secure-1PSIDTS=old-ts' }));

  const newCookies = 'SID=new-cdp-sid-123456789012345678901234567890; __Secure-1PSIDTS=new-cdp-ts; HSID=new-hsid';
  const mockCdp = async () => ({
    success: true,
    cookies: newCookies,
    matchedUrl: 'https://notebooklm.google.com'
  });

  try {
    const res = await AccountSwitchLifecycleManager.executeSwitch({
      storePath: authPath,
      cdpHarvester: mockCdp
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.method, 'zero_click_cdp');
    assert.strictEqual(res.source, 'https://notebooklm.google.com');

    const updated = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    assert.ok(updated.cookies.includes('SID=new-cdp-sid'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('executeSwitch succeeds via zero-click vault harvester when CDP misses', async () => {
  const tempDir = path.join(os.tmpdir(), `aegis-switch-vault-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const authPath = path.join(tempDir, 'auth.json');

  const newCookies = 'SID=new-vault-sid-123456789012345678901234567890; __Secure-1PSIDTS=new-vault-ts; HSID=new-hsid';
  const mockCdp = async () => ({ success: false });
  const mockVault = async () => ({ success: true, cookies: newCookies, browser: 'edge' });

  try {
    const res = await AccountSwitchLifecycleManager.executeSwitch({
      storePath: authPath,
      cdpHarvester: mockCdp,
      vaultHarvester: mockVault
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.method, 'zero_click_vault');
    assert.strictEqual(res.source, 'edge');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('executeSwitch returns needs_browser_flow when all zero-click harvesters miss', async () => {
  const tempDir = path.join(os.tmpdir(), `aegis-switch-miss-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const authPath = path.join(tempDir, 'auth.json');

  const mockCdp = async () => ({ success: false });
  const mockVault = async () => ({ success: false });

  try {
    const res = await AccountSwitchLifecycleManager.executeSwitch({
      storePath: authPath,
      cdpHarvester: mockCdp,
      vaultHarvester: mockVault
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.method, 'needs_browser_flow');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
