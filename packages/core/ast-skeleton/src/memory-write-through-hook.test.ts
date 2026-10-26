import test from 'node:test';
import * as assert from 'node:assert';
import { MemoryWriteThroughHook } from './memory-write-through-hook.js';
import { CodebaseMemoryEngine } from './codebase-memory.js';

test('MemoryWriteThroughHook: updates in-memory RAM immediately on file write', () => {
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const hook = new MemoryWriteThroughHook(engine, { debounceMs: 50 });

  try {
    const code = 'export class FastService { execute() {} }';
    const updated = hook.handleFileWrite('src/fast.ts', code, 'test-wt');
    assert.strictEqual(updated, true);

    const res = engine.queryMemory('FastService', { worktreeId: 'test-wt' });
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.filePath, 'src/fast.ts');
  } finally {
    hook.dispose();
  }
});

test('MemoryWriteThroughHook: debounces rapid sequential writes and flushes cleanly', async () => {
  let saveCount = 0;
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  engine.saveNamespaceToDisk = () => { saveCount++; };

  const hook = new MemoryWriteThroughHook(engine, { debounceMs: 40 });
  try {
    hook.handleFileWrite('src/a.ts', 'export const a = 1;', 'wt-debounce');
    hook.handleFileWrite('src/b.ts', 'export const b = 2;', 'wt-debounce');
    hook.handleFileWrite('src/c.ts', 'export const c = 3;', 'wt-debounce');

    assert.strictEqual(saveCount, 0);
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(saveCount, 1);

    hook.handleFileWrite('src/d.ts', 'export const d = 4;', 'wt-debounce');
    await hook.flush('wt-debounce');
    assert.strictEqual(saveCount, 2);
  } finally {
    hook.dispose();
  }
});

test('MemoryWriteThroughHook: removes file from memory and persists on file delete', async () => {
  let saveCount = 0;
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  engine.saveNamespaceToDisk = () => { saveCount++; };

  const hook = new MemoryWriteThroughHook(engine, { debounceMs: 30 });
  try {
    hook.handleFileWrite('src/temp.ts', 'export class TempClass {}', 'wt-del');
    await hook.flush('wt-del');
    assert.strictEqual(saveCount, 1);

    const before = engine.queryMemory('TempClass', { worktreeId: 'wt-del' });
    assert.strictEqual(before.found, true);

    const deleted = hook.handleFileDelete('src/temp.ts', 'wt-del');
    assert.strictEqual(deleted, true);

    const after = engine.queryMemory('TempClass', { worktreeId: 'wt-del' });
    assert.strictEqual(after.found, false);
    assert.strictEqual(saveCount, 2);
  } finally {
    hook.dispose();
  }
});
