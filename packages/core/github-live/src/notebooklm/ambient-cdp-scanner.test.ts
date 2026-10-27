/**
 * @file ambient-cdp-scanner.test.ts
 * Tests for AmbientCdpScanner multi-port auto-discovery and open tab harvester.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import { AmbientCdpScanner, type CdpPageTarget } from './ambient-cdp-scanner.js';

test('isGoogleUrl detects NotebookLM and Google domains accurately', () => {
  assert.strictEqual(AmbientCdpScanner.isGoogleUrl('https://notebooklm.google.com/'), true);
  assert.strictEqual(AmbientCdpScanner.isGoogleUrl('https://accounts.google.com/signin'), true);
  assert.strictEqual(AmbientCdpScanner.isGoogleUrl('https://github.com/frkntlr/aegis'), false);
  assert.strictEqual(AmbientCdpScanner.isGoogleUrl(''), false);
});

test('filterGoogleTargets extracts only Google page targets', () => {
  const targets: CdpPageTarget[] = [
    { id: '1', type: 'page', url: 'https://github.com', title: 'GitHub' },
    { id: '2', type: 'page', url: 'https://notebooklm.google.com/notebook/123', title: 'Notebook' },
    { id: '3', type: 'service_worker', url: 'https://accounts.google.com/sw.js', title: 'Worker' }
  ];

  const filtered = AmbientCdpScanner.filterGoogleTargets(targets);
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, '2');
});

test('probePort parses json list and detects Google tabs via mock fetch', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => [
      { id: 'tab1', type: 'page', url: 'https://notebooklm.google.com', title: 'NotebookLM' }
    ]
  } as unknown as Response);

  const res = await AmbientCdpScanner.probePort(9222, 100, mockFetch);
  assert.strictEqual(res.available, true);
  assert.strictEqual(res.googleTabs.length, 1);
  assert.strictEqual(res.googleTabs[0].url, 'https://notebooklm.google.com');
});

test('probePort returns unavailable on fetch rejection', async () => {
  const failingFetch = async () => {
    throw new Error('Connection refused');
  };

  const res = await AmbientCdpScanner.probePort(9222, 50, failingFetch);
  assert.strictEqual(res.available, false);
  assert.strictEqual(res.googleTabs.length, 0);
});

test('scanAllPorts probes list of ports and terminates early when Google tab found', async () => {
  let probedCount = 0;
  const mockFetch = async (url: string | URL | Request) => {
    probedCount++;
    const portStr = String(url);
    if (portStr.includes('9223')) {
      return {
        ok: true,
        json: async () => [
          { id: 'gtab', type: 'page', url: 'https://notebooklm.google.com', title: 'Google' }
        ]
      } as unknown as Response;
    }
    throw new Error('ECONNREFUSED');
  };

  const results = await AmbientCdpScanner.scanAllPorts({
    ports: [9222, 9223, 9224, 9225],
    fetchFn: mockFetch
  });

  assert.strictEqual(results.length, 2); // stopped at 9223
  assert.strictEqual(probedCount, 2);
  assert.strictEqual(results[1].googleTabs.length, 1);
});

test('discoverAndHarvest discovers active port and queries valid session cookies', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => [
      { id: 'p1', type: 'page', url: 'https://notebooklm.google.com', title: 'Active' }
    ]
  } as unknown as Response);

  const mockSender = async () => ({
    cookies: [
      { name: 'SID', value: 'valid-test-sid-token-123456789012345678901234567890', domain: '.google.com' },
      { name: '__Secure-1PSIDTS', value: 'valid-psidts-token-abcdef1234567890', domain: '.google.com' },
      { name: 'HSID', value: 'valid-hsid', domain: '.google.com' }
    ]
  });

  const res = await AmbientCdpScanner.discoverAndHarvest({
    ports: [9222],
    fetchFn: mockFetch,
    sender: mockSender
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.port, 9222);
  assert.strictEqual(res.matchedUrl, 'https://notebooklm.google.com');
  assert.ok(res.cookies?.includes('SID=valid-test-sid-token-123456789012345678901234567890'));
});
