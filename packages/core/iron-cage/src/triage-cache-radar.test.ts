/**
 * @file triage-cache-radar.test.ts
 * Unit tests for TriageCacheRadar.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TriageCacheRadar, fnv1a, normalizeCachePath } from './triage-cache-radar.js';

function createTempCacheDir(): string {
  const dir = path.join(os.tmpdir(), `triage-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('fnv1a produces deterministic hexadecimal hash for string', () => {
  const h1 = fnv1a('const x = 42;');
  const h2 = fnv1a('const x = 42;');
  const h3 = fnv1a('const x = 43;');
  assert.strictEqual(h1, h2);
  assert.notStrictEqual(h1, h3);
  assert.ok(typeof h1 === 'string' && h1.length > 0);
});

test('normalizeCachePath converts backslashes to forward slashes', () => {
  const normalized = normalizeCachePath('packages\\core\\index.ts');
  assert.strictEqual(normalized, 'packages/core/index.ts');
});

test('TriageCacheRadar records, checks hit and misses accurately', () => {
  const cacheDir = createTempCacheDir();
  const radar = new TriageCacheRadar({ cacheDir, engineRulesSalt: 'v1' });

  const content = 'export const a = 1;';
  const mtime = 1000;
  const size = content.length;

  const initialCheck = radar.checkFile('src/a.ts', mtime, size, content);
  assert.strictEqual(initialCheck.hit, false);

  radar.recordFile('src/a.ts', mtime, size, content, []);
  radar.flush();

  const hitCheck = radar.checkFile('src/a.ts', mtime, size, content);
  assert.strictEqual(hitCheck.hit, true);
  assert.deepStrictEqual(hitCheck.cachedViolations, []);

  const modifiedCheck = radar.checkFile('src/a.ts', mtime, size, 'export const a = 2;');
  assert.strictEqual(modifiedCheck.hit, false);

  const stats = radar.getStats();
  assert.strictEqual(stats.hits, 1);
  assert.strictEqual(stats.misses, 2);
  assert.ok(stats.ratio > 0);
});

test('TriageCacheRadar invalidates cache on engine rule salt change', () => {
  const cacheDir = createTempCacheDir();
  const radar1 = new TriageCacheRadar({ cacheDir, engineRulesSalt: 'v1' });
  radar1.recordFile('src/b.ts', 2000, 10, 'content', []);
  radar1.flush();

  const radar2 = new TriageCacheRadar({ cacheDir, engineRulesSalt: 'v2-modified-rules' });
  const check = radar2.checkFile('src/b.ts', 2000, 10, 'content');
  assert.strictEqual(check.hit, false);
});

test('TriageCacheRadar handles invalidateAll and corrupted file cleanly', () => {
  const cacheDir = createTempCacheDir();
  const radar = new TriageCacheRadar({ cacheDir, engineRulesSalt: 'v1' });
  radar.recordFile('src/c.ts', 3000, 5, 'hello', []);
  radar.flush();

  radar.invalidateAll();
  const check = radar.checkFile('src/c.ts', 3000, 5, 'hello');
  assert.strictEqual(check.hit, false);

  const cacheFile = path.join(cacheDir, 'triage-cache.json');
  fs.writeFileSync(cacheFile, '{ invalid json', 'utf8');

  const recoveredRadar = new TriageCacheRadar({ cacheDir, engineRulesSalt: 'v1' });
  const recoveredCheck = recoveredRadar.checkFile('src/c.ts', 3000, 5, 'hello');
  assert.strictEqual(recoveredCheck.hit, false);
});
