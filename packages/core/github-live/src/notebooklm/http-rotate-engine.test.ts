/**
 * @file http-rotate-engine.test.ts
 * Tests for Zero-Chromium HttpRotateEngine.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { HttpRotateEngine } from './http-rotate-engine.js';

test('HttpRotateEngine parses and serializes cookies correctly', () => {
  const str = 'SID=abc123; HSID=def456; __Secure-1PSIDTS=ts789;';
  const jar = HttpRotateEngine.parseCookies(str);
  assert.strictEqual(jar.get('SID'), 'abc123');
  assert.strictEqual(jar.get('HSID'), 'def456');
  assert.strictEqual(jar.get('__Secure-1PSIDTS'), 'ts789');

  const serialized = HttpRotateEngine.serializeCookies(jar);
  assert.ok(serialized.includes('SID=abc123'));
  assert.ok(serialized.includes('HSID=def456'));
});

test('HttpRotateEngine canRotate validates binding prerequisites', () => {
  const validWithSapisid = HttpRotateEngine.parseCookies('SID=1; APISID=2; SAPISID=3;');
  assert.strictEqual(HttpRotateEngine.canRotate(validWithSapisid), true);

  const validWithOsid = HttpRotateEngine.parseCookies('SID=1; OSID=2;');
  assert.strictEqual(HttpRotateEngine.canRotate(validWithOsid), true);

  const missingSid = HttpRotateEngine.parseCookies('OSID=2; APISID=1;');
  assert.strictEqual(HttpRotateEngine.canRotate(missingSid), false);

  const missingBinding = HttpRotateEngine.parseCookies('SID=1;');
  assert.strictEqual(HttpRotateEngine.canRotate(missingBinding), false);
});

test('HttpRotateEngine buildAccountsCookieHeader strips host-only OSID cookies', () => {
  const jar = HttpRotateEngine.parseCookies('SID=sid1; OSID=osid2; __Secure-OSID=sec3; SAPISID=sap4;');
  const header = HttpRotateEngine.buildAccountsCookieHeader(jar);
  assert.ok(header.includes('SID=sid1'));
  assert.ok(header.includes('SAPISID=sap4'));
  assert.ok(!header.includes('OSID=osid2'));
  assert.ok(!header.includes('__Secure-OSID=sec3'));
});

test('HttpRotateEngine rotate successfully refreshes session tokens on HTTP 200', async () => {
  const initial = 'SID=sid123; APISID=api; SAPISID=sapi;';
  const mockHttp = async () => ({
    status: 200,
    text: async () => '[1, "ok"]',
    headers: {
      'set-cookie': [
        '__Secure-1PSIDTS=new_rotated_token_123; Domain=.google.com; Path=/; Secure',
        'SIDCC=new_sidcc_456; Domain=.google.com; Path=/;'
      ]
    }
  });

  const res = await HttpRotateEngine.rotate(initial, {
    httpPost: mockHttp,
    saveOnSuccess: false
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.newPsidts, 'new_rotated_token_123');
  assert.ok(res.refreshedCookies?.includes('__Secure-1PSIDTS=new_rotated_token_123'));
  assert.ok(res.refreshedCookies?.includes('SIDCC=new_sidcc_456'));
  assert.ok(res.refreshedCookies?.includes('SID=sid123'));
});

test('HttpRotateEngine rotate fails gracefully on HTTP 401 rejection', async () => {
  const initial = 'SID=expiredSid; APISID=api; SAPISID=sapi;';
  const mockHttp = async () => ({
    status: 401,
    text: async () => 'Unauthorized',
    headers: {}
  });

  const res = await HttpRotateEngine.rotate(initial, {
    httpPost: mockHttp,
    saveOnSuccess: false
  });

  assert.strictEqual(res.success, false);
  assert.ok(res.error?.includes('RotateCookies rejected by Google (HTTP 401)'));
});

test('HttpRotateEngine rotate returns error when cookies lack required tokens', async () => {
  const res = await HttpRotateEngine.rotate('INVALID_COOKIES', { saveOnSuccess: false });
  assert.strictEqual(res.success, false);
  assert.ok(res.error?.includes('Cannot rotate cookies'));
});
