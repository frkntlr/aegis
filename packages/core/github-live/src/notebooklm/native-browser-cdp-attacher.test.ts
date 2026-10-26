/**
 * @file native-browser-cdp-attacher.test.ts
 * Tests for NativeBrowserCdpAttacher with mock CDP sender.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { NativeBrowserCdpAttacher } from './native-browser-cdp-attacher.js';

test('NativeBrowserCdpAttacher formats raw CDP cookie arrays cleanly', () => {
  const raw = [
    { name: 'SID', value: 'sidValue123' },
    { name: '__Secure-1PSIDTS', value: 'tsValue456' },
    { name: '', value: 'ignored' },
    null,
    123
  ];

  const formatted = NativeBrowserCdpAttacher.formatCookies(raw);
  assert.ok(formatted.includes('SID=sidValue123'));
  assert.ok(formatted.includes('__Secure-1PSIDTS=tsValue456'));
  assert.ok(!formatted.includes('ignored'));
});

test('NativeBrowserCdpAttacher queries cookies via custom CDP sender', async () => {
  const mockSender = async (method: string) => {
    assert.strictEqual(method, 'Network.getCookies');
    return {
      cookies: [
        { name: 'SID', value: 'cdpSid' },
        { name: 'SAPISID', value: 'cdpSapisid' }
      ]
    };
  };

  const res = await NativeBrowserCdpAttacher.queryCookies({ sender: mockSender });
  assert.ok(res !== null);
  assert.ok(res?.includes('SID=cdpSid'));
  assert.ok(res?.includes('SAPISID=cdpSapisid'));
});

test('NativeBrowserCdpAttacher handles empty or failing CDP sender gracefully', async () => {
  const emptySender = async () => ({ cookies: [] });
  const emptyRes = await NativeBrowserCdpAttacher.queryCookies({ sender: emptySender });
  assert.strictEqual(emptyRes, null);

  const failingSender = async () => {
    throw new Error('CDP connection closed');
  };
  const failingRes = await NativeBrowserCdpAttacher.queryCookies({ sender: failingSender });
  assert.strictEqual(failingRes, null);
});

test('NativeBrowserCdpAttacher isCdpActive returns false when port is unreachable', async () => {
  // Port 64999 is typically unused, test timeout aborts quickly
  const active = await NativeBrowserCdpAttacher.isCdpActive(64999, '127.0.0.1', 50);
  assert.strictEqual(active, false);
});
