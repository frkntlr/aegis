import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CodebaseMemoryEngine } from './codebase-memory.js';
import { LiveHotPatcher } from './live-hot-patcher.js';

test('LiveHotPatcher: detects dirty files and updates memory on the fly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hot-patch-test-'));
  const testFile = path.join(tmpDir, 'calc.ts');
  const codeV1 = 'export function add(a: number, b: number): number { return a + b; }';
  fs.writeFileSync(testFile, codeV1, 'utf8');

  try {
    const engine = new CodebaseMemoryEngine({ persistToDisk: false });
    engine.indexFile(testFile, codeV1);

    const q1 = engine.queryMemory('add');
    assert.strictEqual(q1.found, true);
    assert.ok(q1.slice?.includes('return a + b'));

    // Modify file on disk without re-indexing explicitly
    const codeV2 = [
      'export function add(a: number, b: number): number { return a + b + 0; }',
      'export function multiply(a: number, b: number): number { return a * b; }'
    ].join('\n');

    // Ensure mtime advances
    const futureTime = (Date.now() + 2000) / 1000;
    fs.writeFileSync(testFile, codeV2, 'utf8');
    fs.utimesSync(testFile, futureTime, futureTime);

    // Live hot-patcher should detect the dirty file and return the fresh slice
    const qMultiply = engine.queryMemory('multiply');
    assert.strictEqual(qMultiply.found, true);
    assert.ok(qMultiply.slice?.includes('return a * b'));

    const q2 = engine.queryMemory('add');
    assert.ok(q2.slice?.includes('return a + b + 0'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('LiveHotPatcher: isDirty returns true when file is newer than cached fingerprint', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hot-dirty-test-'));
  const fPath = path.join(tmpDir, 'temp.ts');
  fs.writeFileSync(fPath, 'export const X = 1;');

  try {
    const stat = fs.statSync(fPath);
    const curFp = `${Math.floor(stat.mtimeMs)}:${stat.size}`;
    const diffFp = `${Math.floor(stat.mtimeMs - 1000)}:${stat.size}`;
    assert.strictEqual(LiveHotPatcher.isDirty(fPath, diffFp), true);
    assert.strictEqual(LiveHotPatcher.isDirty(fPath, curFp), false);
    assert.strictEqual(LiveHotPatcher.isDirty(path.join(tmpDir, 'nonexistent.ts')), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
