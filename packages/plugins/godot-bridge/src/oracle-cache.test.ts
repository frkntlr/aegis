import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { OracleCache } from './classdboracle/oracle-cache.js';

test('OracleCache stores, retrieves, and checks existence of entries', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-oracle-cache-test-'));
  try {
    const cache = new OracleCache({ cacheDir: tmp });
    cache.set('test_key', { hello: 'world' }, '4.7.2');

    assert.strictEqual(cache.has('test_key'), true);
    assert.strictEqual(cache.has('missing_key'), false);

    const val = cache.get<{ hello: string }>('test_key', '4.7.2');
    assert.ok(val);
    assert.strictEqual(val.hello, 'world');

    const stats = cache.getStats();
    assert.strictEqual(stats.totalFiles, 1);
    assert.ok(stats.totalSizeBytes > 0);

    assert.strictEqual(cache.delete('test_key'), true);
    assert.strictEqual(cache.has('test_key'), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('OracleCache invalidates expired entries and version mismatches', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-oracle-cache-ttl-'));
  try {
    const cache = new OracleCache({ cacheDir: tmp, ttlMs: 10 });
    cache.set('entry1', { foo: 'bar' }, '4.7.2');

    // Version mismatch
    const mismatch = cache.get('entry1', '4.6.0');
    assert.strictEqual(mismatch, undefined);

    // Re-set and test TTL
    cache.set('entry2', { foo: 'bar' });
    await new Promise(r => setTimeout(r, 25));
    const expired = cache.get('entry2');
    assert.strictEqual(expired, undefined);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
