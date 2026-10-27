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
  assert.strictEqual(SystemBrowserDetector.inferBrowserName('/usr/bin/vivaldi'), 'vivaldi');
  assert.strictEqual(SystemBrowserDetector.inferBrowserName('C:\\Users\\User\\AppData\\Local\\Programs\\Opera\\opera.exe'), 'opera');
  assert.strictEqual(SystemBrowserDetector.inferBrowserName('/usr/bin/chromium'), 'chromium');
});

test('SystemBrowserDetector provides candidate paths for Windows, macOS, and Linux', () => {
  const win = SystemBrowserDetector.getCandidatePaths('win32');
  assert.ok(win.length >= 6);
  assert.ok(win.some(c => c.name === 'edge'));
  assert.ok(win.some(c => c.name === 'chrome'));
  assert.ok(win.some(c => c.name === 'vivaldi'));
  assert.ok(win.some(c => c.name === 'opera'));

  const mac = SystemBrowserDetector.getCandidatePaths('darwin');
  assert.ok(mac.length >= 4);
  assert.ok(mac.some(c => c.name === 'chrome'));
  assert.ok(mac.some(c => c.name === 'vivaldi'));

  const linux = SystemBrowserDetector.getCandidatePaths('linux');
  assert.ok(linux.length >= 7);
  assert.ok(linux.some(c => c.name === 'chromium'));
  assert.ok(linux.some(c => c.name === 'opera'));
});

test('SystemBrowserDetector detects custom provided path and respects preferred name', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-browser-test-'));
  const fakeEdge = path.join(tmpDir, 'msedge.exe');
  const fakeChrome = path.join(tmpDir, 'chrome.exe');
  fs.writeFileSync(fakeEdge, 'fake binary');
  fs.writeFileSync(fakeChrome, 'fake binary');

  try {
    const resChrome = SystemBrowserDetector.detectInstalledBrowser('chrome', [fakeEdge, fakeChrome]);
    assert.ok(resChrome !== null);
    assert.strictEqual(resChrome?.name, 'chrome');

    const resEdge = SystemBrowserDetector.detectInstalledBrowser('edge', [fakeEdge, fakeChrome]);
    assert.ok(resEdge !== null);
    assert.strictEqual(resEdge?.name, 'edge');

    const list = SystemBrowserDetector.listInstalledBrowsers([fakeEdge, fakeChrome]);
    assert.ok(list.length >= 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SystemBrowserDetector returns null gracefully when no candidates exist', () => {
  const res = SystemBrowserDetector.detectInstalledBrowser(undefined, ['/nonexistent/path/browser.exe'], 'darwin');
  assert.strictEqual(res, null);
});
