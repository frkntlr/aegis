/**
 * @file ambient-cookie-vault-extractor.test.ts
 * Tests for AmbientCookieVaultExtractor profile discovery and AES-256-GCM cookie decryptor.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AmbientCookieVaultExtractor } from './ambient-cookie-vault-extractor.js';

function createEncryptedMockCookie(plainValue: string, masterKey: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plainValue, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('v10', 'ascii'), iv, ciphertext, tag]);
}

test('resolveCandidateProfiles handles empty localAppData gracefully', () => {
  const res = AmbientCookieVaultExtractor.resolveCandidateProfiles('');
  assert.strictEqual(res.length, 0);
});

test('decryptCookieValue successfully decrypts AES-256-GCM payload', () => {
  const masterKey = crypto.randomBytes(32);
  const plainText = 'long-valid-sid-token-123456789012345678901234567890';
  const encryptedBuf = createEncryptedMockCookie(plainText, masterKey);

  const decrypted = AmbientCookieVaultExtractor.decryptCookieValue(encryptedBuf, masterKey);
  assert.strictEqual(decrypted, plainText);
});

test('decryptCookieValue returns null for corrupted buffer or short length', () => {
  const masterKey = crypto.randomBytes(32);
  assert.strictEqual(AmbientCookieVaultExtractor.decryptCookieValue(Buffer.from('short'), masterKey), null);
  assert.strictEqual(AmbientCookieVaultExtractor.decryptCookieValue(Buffer.from('x10-random-corrupted-bytes-12345678901234567890'), masterKey), null);
});

test('unprotectMasterKey extracts cipher and invokes dpapiRunner', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-vault-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const localStatePath = path.join(tempDir, 'Local State');

  const rawKeyBytes = Buffer.concat([Buffer.from('DPAPI', 'ascii'), Buffer.from('mock-encrypted-key-bytes')]);
  fs.writeFileSync(localStatePath, JSON.stringify({
    os_crypt: { encrypted_key: rawKeyBytes.toString('base64') }
  }));

  try {
    const mockRunner = (cipherB64: string) => {
      assert.strictEqual(Buffer.from(cipherB64, 'base64').toString('ascii'), 'mock-encrypted-key-bytes');
      return Buffer.alloc(32, 0x42);
    };

    const key = AmbientCookieVaultExtractor.unprotectMasterKey(localStatePath, mockRunner);
    assert.ok(key);
    assert.strictEqual(key.length, 32);
    assert.strictEqual(key[0], 0x42);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('readGoogleCookiesFromDb decrypts rows and validates Google cookie tokens', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-db-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const dummyDbPath = path.join(tempDir, 'Cookies');
  fs.writeFileSync(dummyDbPath, 'sqlite dummy content');

  const masterKey = crypto.randomBytes(32);
  const sidEnc = createEncryptedMockCookie('valid-sid-token-123456789012345678901234567890', masterKey);
  const psidtsEnc = createEncryptedMockCookie('valid-psidts-token-abcdef123456', masterKey);
  const hsidEnc = createEncryptedMockCookie('valid-hsid', masterKey);

  const mockDbOpener = () => [
    { name: 'SID', encrypted_value: sidEnc },
    { name: '__Secure-1PSIDTS', encrypted_value: psidtsEnc },
    { name: 'HSID', encrypted_value: hsidEnc }
  ];

  try {
    const cookies = AmbientCookieVaultExtractor.readGoogleCookiesFromDb(dummyDbPath, masterKey, mockDbOpener);
    assert.ok(cookies);
    assert.ok(cookies.includes('SID=valid-sid-token'));
    assert.ok(cookies.includes('__Secure-1PSIDTS=valid-psidts-token'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function setupMockVaultFixture(tempDir: string): { localStatePath: string; dummyDbPath: string } {
  fs.mkdirSync(tempDir, { recursive: true });
  const localStatePath = path.join(tempDir, 'Local State');
  const dummyDbPath = path.join(tempDir, 'Cookies');

  const rawKeyBytes = Buffer.concat([Buffer.from('DPAPI', 'ascii'), Buffer.from('mock-bytes')]);
  fs.writeFileSync(localStatePath, JSON.stringify({
    os_crypt: { encrypted_key: rawKeyBytes.toString('base64') }
  }));
  fs.writeFileSync(dummyDbPath, 'sqlite dummy');
  return { localStatePath, dummyDbPath };
}

test('extractFromAllVaults returns successfully with matching profile', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-all-vaults-test-${Date.now()}`);
  const { localStatePath, dummyDbPath } = setupMockVaultFixture(tempDir);
  const masterKey = crypto.randomBytes(32);
  const sidEnc = createEncryptedMockCookie('valid-sid-token-123456789012345678901234567890', masterKey);
  const psidtsEnc = createEncryptedMockCookie('valid-psidts-token-abcdef123456', masterKey);

  const mockProfiles = [{ browserName: 'edge', profileName: 'Default', localStatePath, cookiesDbPath: dummyDbPath }];
  const mockDbOpener = () => [
    { name: 'SID', encrypted_value: sidEnc },
    { name: '__Secure-1PSIDTS', encrypted_value: psidtsEnc }
  ];

  try {
    const res = AmbientCookieVaultExtractor.extractFromAllVaults({
      customProfiles: mockProfiles,
      dpapiRunner: () => masterKey,
      dbOpener: mockDbOpener
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.browser, 'edge');
    assert.ok(res.cookies?.includes('SID=valid-sid-token'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveFirefoxProfiles handles empty appData gracefully', () => {
  const res = AmbientCookieVaultExtractor.resolveFirefoxProfiles('');
  assert.strictEqual(res.length, 0);
});

test('readFirefoxCookiesFromDb parses and validates Google cookies from Firefox', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-ff-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const dummyDbPath = path.join(tempDir, 'cookies.sqlite');
  fs.writeFileSync(dummyDbPath, 'dummy sqlite');

  const mockDbOpener = () => [
    { host: '.google.com', name: 'SID', value: 'valid-sid-token-123456789012345678901234567890' },
    { host: '.google.com', name: '__Secure-1PSIDTS', value: 'valid-psidts-token-abcdef123456' },
    { host: 'notebook.google.com', name: 'OSID', value: 'valid-osid-token-123456' }
  ];

  try {
    const cookies = AmbientCookieVaultExtractor.readFirefoxCookiesFromDb(dummyDbPath, mockDbOpener);
    assert.ok(cookies);
    assert.ok(cookies.includes('SID=valid-sid-token'));
    assert.ok(cookies.includes('__Secure-1PSIDTS=valid-psidts-token'));
    assert.ok(cookies.includes('OSID=valid-osid-token'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('extractFromAllVaults extracts from Firefox profile successfully', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-ff-vault-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const dummyDbPath = path.join(tempDir, 'cookies.sqlite');
  fs.writeFileSync(dummyDbPath, 'dummy');

  const mockFfProfiles = [{ profileName: 'default-release', cookiesDbPath: dummyDbPath }];
  const mockDbOpener = () => [
    { host: '.google.com', name: 'SID', value: 'valid-sid-token-123456789012345678901234567890' },
    { host: '.google.com', name: '__Secure-1PSIDTS', value: 'valid-psidts-token-abcdef123456' }
  ];

  try {
    const res = AmbientCookieVaultExtractor.extractFromAllVaults({
      customFirefoxProfiles: mockFfProfiles,
      firefoxDbOpener: mockDbOpener
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.browser, 'firefox');

    assert.ok(res.cookies?.includes('SID=valid-sid-token'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
