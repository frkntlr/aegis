/**
 * @file native-browser-spawner.test.ts
 * Tests for NativeBrowserSpawner isolated browser launcher.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NativeBrowserSpawner } from './native-browser-spawner.js';

test('NativeBrowserSpawner resolveUserDataDir sanitizes name and creates directory', () => {
  const dir = NativeBrowserSpawner.resolveUserDataDir('edge');
  assert.ok(dir.includes('edge'));
  assert.ok(fs.existsSync(dir));
});

test('NativeBrowserSpawner buildArgs includes remote debugging port and profile flags', () => {
  const args = NativeBrowserSpawner.buildArgs(9222, '/fake/profile', 'https://notebooklm.google.com');
  assert.ok(args.includes('--remote-debugging-port=9222'));
  assert.ok(args.includes('--user-data-dir=/fake/profile'));
  assert.ok(args.includes('--no-first-run'));
  assert.ok(args.includes('https://notebooklm.google.com'));
});

test('NativeBrowserSpawner returns error when no browser is found', () => {
  const res = NativeBrowserSpawner.spawn({
    browserName: 'nonexistent-browser-name-xyz',
    browserPath: '/fake/nonexistent.exe'
  });
  assert.strictEqual(res.success, false);
  assert.ok(res.error?.includes('No compatible Chromium-family browser'));
});

test('NativeBrowserSpawner spawns mock browser and unrefs process', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-spawner-test-'));
  const fakeBrowser = path.join(tmpDir, 'chrome.exe');
  fs.writeFileSync(fakeBrowser, 'fake binary');

  let unreferenced = false;
  let spawnedCmd = '';
  let spawnedArgs: string[] = [];

  const mockSpawner = (cmd: string, args: string[]) => {
    spawnedCmd = cmd;
    spawnedArgs = args;
    return {
      pid: 12345,
      unref: () => {
        unreferenced = true;
      }
    };
  };

  try {
    const res = NativeBrowserSpawner.spawn({
      browserPath: fakeBrowser,
      port: 9333,
      spawner: mockSpawner
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.pid, 12345);
    assert.strictEqual(res.port, 9333);
    assert.strictEqual(unreferenced, true);
    assert.strictEqual(spawnedCmd, fakeBrowser);
    assert.ok(spawnedArgs.includes('--remote-debugging-port=9333'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
