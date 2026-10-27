/**
 * @file session-credentials-manager.test.ts
 * Tests for SessionCredentialsManager format validation and file persistence.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SessionCredentialsManager } from './session-credentials-manager.js';

test('sanitizeCookieInput cleans prefix and enclosing quotes', () => {
  assert.strictEqual(
    SessionCredentialsManager.sanitizeCookieInput('Cookie: SID=abc; HSID=def'),
    'SID=abc; HSID=def'
  );
  assert.strictEqual(
    SessionCredentialsManager.sanitizeCookieInput('  "SID=abc; HSID=def"  '),
    'SID=abc; HSID=def'
  );
  assert.strictEqual(
    SessionCredentialsManager.sanitizeCookieInput(''),
    ''
  );
});

test('validateCookieString validates required Google auth tokens', () => {
  const validCookie = 'SID=valid-sid-token-1234567890; HSID=valid-hsid; __Secure-1PSIDTS=valid-psidts-token-abcdef';
  const resValid = SessionCredentialsManager.validateCookieString(validCookie);
  assert.strictEqual(resValid.valid, true);
  assert.strictEqual(resValid.hasSid, true);
  assert.strictEqual(resValid.hasHsid, true);
  assert.strictEqual(resValid.hasPsidts, true);
  assert.strictEqual(resValid.missingTokens.length, 0);

  const invalidCookie = 'foo=bar; baz=qux';
  const resInvalid = SessionCredentialsManager.validateCookieString(invalidCookie);
  assert.strictEqual(resInvalid.valid, false);
  assert.ok(resInvalid.missingTokens.includes('SID'));
  assert.ok(resInvalid.missingTokens.includes('__Secure-1PSIDTS'));
});

test('saveCredentials rejects invalid cookie and does not write to disk', () => {
  const tempPath = path.join(os.tmpdir(), `aegis-invalid-${Date.now()}`, 'auth.json');
  const res = SessionCredentialsManager.saveCredentials('short', tempPath);
  assert.strictEqual(res.success, false);
  assert.ok(res.error?.includes('Invalid cookie string'));
  assert.strictEqual(fs.existsSync(tempPath), false);
});

test('saveCredentials saves valid credentials and inspectCredentials parses them', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-creds-test-${Date.now()}`);
  const targetPath = path.join(tempDir, 'auth.json');
  const validCookie = 'SID=long-test-sid-12345678901234567890; HSID=long-test-hsid; __Secure-1PSIDTS=long-test-psidts';

  try {
    const saveRes = SessionCredentialsManager.saveCredentials(validCookie, targetPath);
    assert.strictEqual(saveRes.success, true);
    assert.strictEqual(fs.existsSync(targetPath), true);

    const inspectRes = SessionCredentialsManager.inspectCredentials(targetPath);
    assert.strictEqual(inspectRes.active, true);
    assert.strictEqual(inspectRes.source, 'custom_file');
    assert.strictEqual(inspectRes.hasSid, true);
    assert.strictEqual(inspectRes.hasPsidts, true);
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});
