/**
 * @file system-browser-detector.test.ts
 * Tests for SystemBrowserDetector zero-download browser locator.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SystemBrowserDetector } from './system-browser-detector.js';

test('SystemBrowserDetector infers browser names accurately from path strings', () => {
  assert.strictEqual(SystemBrowserDetector.inferBrowserName('C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'), 'edge');
  assert.strictEqual(SystemBrowserDetector.inferBrowserName('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'), 'chrome');
  assert.strictEqual(SystemBrowserDetector.inferBrowserName('/usr/bin/brave-browser'), 'brave');
  assert.strictEqual(SystemBrowserDetector.inferBrowserName('/usr/bin/chromium'), 'chromium');
});

test('SystemBrowserDetector provides candidate paths for Windows, macOS, and Linux', () => {
  const win = SystemBrowserDetector.getCandidatePaths('win32');
  assert.ok(win.length >= 4);
  assert.ok(win.some(c => c.name === 'edge'));
  assert.ok(win.some(c => c.name === 'chrome'));

  const mac = SystemBrowserDetector.getCandidatePaths('darwin');
  assert.ok(mac.length >= 3);
  assert.ok(mac.some(c => c.name === 'chrome'));

  const linux = SystemBrowserDetector.getCandidatePaths('linux');
  assert.ok(linux.length >= 5);
  assert.ok(linux.some(c => c.name === 'chromium'));
});

test('SystemBrowserDetector detects custom provided path when file exists', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-browser-test-'));
  const fakeChrome = path.join(tmpDir, 'chrome.exe');
  fs.writeFileSync(fakeChrome, 'fake binary');

  try {
    const res = SystemBrowserDetector.detectInstalledBrowser([fakeChrome]);
    assert.ok(res !== null);
    assert.strictEqual(res?.name, 'chrome');
    assert.strictEqual(res?.executablePath, fakeChrome);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SystemBrowserDetector returns null gracefully when no candidates exist', () => {
  const res = SystemBrowserDetector.detectInstalledBrowser(['/nonexistent/path/browser.exe']);
  assert.strictEqual(res, null);
});
