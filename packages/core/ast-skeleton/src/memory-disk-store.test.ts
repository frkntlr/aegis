import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemoryDiskStore } from './memory-disk-store.js';
import { CodebaseMemoryEngine } from './codebase-memory.js';

test('MemoryDiskStore: writes JSON atomically via .tmp and rename', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-atomic-'));
  const target = path.join(tmpDir, 'data.json');
  const payload = { hello: 'world', count: 42 };

  MemoryDiskStore.writeAtomic(target, payload);
  assert.strictEqual(fs.existsSync(target), true);

  const read = MemoryDiskStore.readSafe<{ hello: string; count: number }>(target);
  assert.deepStrictEqual(read, payload);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('MemoryDiskStore: handles corrupted JSON gracefully by archiving as .corrupted', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-corrupt-'));
  const target = path.join(tmpDir, 'corrupt.json');
  // Truncated corrupted JSON
  fs.writeFileSync(target, '{"truncated": true, "missing_closing_brace":', 'utf8');

  const result = MemoryDiskStore.readSafe(target);
  assert.strictEqual(result, null, 'Should return null on corrupted JSON without throwing');

  // Verify that target was renamed to .corrupted
  const files = fs.readdirSync(tmpDir);
  assert.ok(files.some(f => f.includes('corrupt.json.corrupted')), 'Corrupted file must be archived');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CodebaseMemoryEngine: saves and restores namespace using atomic disk store', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-engine-disk-'));
  const prevCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    const engine = new CodebaseMemoryEngine({ persistToDisk: true });
    engine.indexFile('src/hero.ts', 'export class Hero { power = 100; }', 'test-wt');
    engine.saveNamespaceToDisk('test-wt');

    const cacheDir = path.join(tmpDir, '.aegis', 'memory', 'test-wt');
    assert.strictEqual(fs.existsSync(path.join(cacheDir, 'symbols.json')), true);
    assert.strictEqual(fs.existsSync(path.join(cacheDir, 'graph.json')), true);
    assert.strictEqual(fs.existsSync(path.join(cacheDir, 'meta.json')), true);

    // Create fresh engine in same directory; must load persisted state
    const engine2 = new CodebaseMemoryEngine({ persistToDisk: true });
    const stats = engine2.getMemoryStats('test-wt');
    assert.strictEqual(stats.totalFiles, 1);
    assert.strictEqual(stats.totalSymbols, 1);
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
