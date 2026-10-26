/**
 * @file multi-root-token-resolver.test.ts
 * Tests for MultiRootTokenResolver discovering session tokens across roots.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MultiRootTokenResolver } from './multi-root-token-resolver.js';

test('MultiRootTokenResolver resolves token from environment variables', () => {
  const env = { NOTEBOOKLM_SESSION: 'SID=abc123; __Secure-1PSIDTS=ts456;' };
  const res = MultiRootTokenResolver.resolve({ env });
  assert.strictEqual(res.source, 'env');
  assert.strictEqual(res.hasSid, true);
  assert.strictEqual(res.hasPsidts, true);
  assert.strictEqual(res.cookies, 'SID=abc123; __Secure-1PSIDTS=ts456;');
});

test('MultiRootTokenResolver resolves token from project .aegis/auth/notebooklm.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-auth-test-'));
  const authDir = path.join(tmpDir, '.aegis', 'auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'notebooklm.json'), JSON.stringify({ cookies: 'SID=projSid;' }), 'utf8');

  try {
    const res = MultiRootTokenResolver.resolve({ customCwd: tmpDir, env: {} });
    assert.strictEqual(res.source, 'project');
    assert.strictEqual(res.hasSid, true);
    assert.strictEqual(res.hasPsidts, false);
    assert.strictEqual(res.cookies, 'SID=projSid;');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MultiRootTokenResolver resolves token from user home fallback', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-home-test-'));
  const homeAuth = path.join(tmpHome, '.notebooklm-mcp');
  fs.mkdirSync(homeAuth, { recursive: true });
  fs.writeFileSync(path.join(homeAuth, 'auth.json'), JSON.stringify({ cookies: 'SID=homeSid; __Secure-1PSIDTS=homeTs;' }), 'utf8');

  try {
    const res = MultiRootTokenResolver.resolve({ customCwd: os.tmpdir(), customHome: tmpHome, env: {} });
    assert.strictEqual(res.source, 'global');
    assert.strictEqual(res.hasSid, true);
    assert.strictEqual(res.hasPsidts, true);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('MultiRootTokenResolver handles empty and missing tokens safely', () => {
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-empty-test-'));
  try {
    const res = MultiRootTokenResolver.resolve({ customCwd: emptyHome, customHome: emptyHome, env: {} });
    assert.strictEqual(res.source, 'none');
    assert.strictEqual(res.cookies, '');
    assert.strictEqual(res.hasSid, false);
    assert.strictEqual(res.hasPsidts, false);
  } finally {
    fs.rmSync(emptyHome, { recursive: true, force: true });
  }
});

test('MultiRootTokenResolver saves cookies to target file accurately', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-save-test-'));
  const savePath = path.join(tmpDir, 'test-auth.json');
  try {
    const saved = MultiRootTokenResolver.saveCookies('SID=newCookie;', savePath);
    assert.strictEqual(saved, true);
    assert.strictEqual(fs.existsSync(savePath), true);
    const content = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    assert.strictEqual(content.cookies, 'SID=newCookie;');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
