import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { LruFileBuffer } from './lru-file-buffer.js';
import { CodebaseMemoryEngine } from './codebase-memory.js';

test('LruFileBuffer: stores items and updates recency on access', () => {
  const lru = new LruFileBuffer(3);
  lru.set('a.ts', 'content-a');
  lru.set('b.ts', 'content-b');
  lru.set('c.ts', 'content-c');

  assert.strictEqual(lru.size, 3);
  assert.strictEqual(lru.get('a.ts'), 'content-a');

  // Insert d.ts: since a.ts was accessed, b.ts is oldest and should be evicted
  lru.set('d.ts', 'content-d');
  assert.strictEqual(lru.size, 3);
  assert.strictEqual(lru.has('b.ts'), false);
  assert.strictEqual(lru.has('a.ts'), true);
  assert.strictEqual(lru.has('c.ts'), true);
  assert.strictEqual(lru.has('d.ts'), true);
});

test('LruFileBuffer: supports delete, clear, and overwriting existing keys', () => {
  const lru = new LruFileBuffer(2);
  lru.set('x.ts', '1');
  lru.set('x.ts', '2');
  assert.strictEqual(lru.size, 1);
  assert.strictEqual(lru.get('x.ts'), '2');

  assert.strictEqual(lru.delete('x.ts'), true);
  assert.strictEqual(lru.size, 0);

  lru.set('y.ts', '3');
  lru.clear();
  assert.strictEqual(lru.size, 0);
  assert.strictEqual(lru.get('y.ts'), undefined);
});

test('CodebaseMemoryEngine: evicts files over lruCapacity and performs on-demand disk read', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-lru-test-'));
  const f1 = path.join(tmpDir, 'alpha.ts');
  const f2 = path.join(tmpDir, 'beta.ts');
  const f3 = path.join(tmpDir, 'gamma.ts');

  fs.writeFileSync(f1, 'export class Alpha { runAlpha() {} }', 'utf8');
  fs.writeFileSync(f2, 'export class Beta { runBeta() {} }', 'utf8');
  fs.writeFileSync(f3, 'export class Gamma { runGamma() {} }', 'utf8');

  // Set tiny LRU capacity = 2
  const engine = new CodebaseMemoryEngine({ persistToDisk: false, lruCapacity: 2 });
  engine.indexFile(f1, fs.readFileSync(f1, 'utf8'));
  engine.indexFile(f2, fs.readFileSync(f2, 'utf8'));
  engine.indexFile(f3, fs.readFileSync(f3, 'utf8'));

  // Query Alpha: alpha.ts was evicted from memory, but on-demand read must resolve slice
  const resAlpha = engine.queryMemory('Alpha');
  assert.strictEqual(resAlpha.found, true);
  assert.ok(resAlpha.slice && resAlpha.slice.includes('runAlpha'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
