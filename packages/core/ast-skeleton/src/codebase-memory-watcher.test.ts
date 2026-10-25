import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CodebaseMemoryEngine } from './codebase-memory.js';
import { CodebaseMemoryWatcher } from './codebase-memory-watcher.js';

test('CodebaseMemoryWatcher: starts, watches, and stops cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-watch-test-'));
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const watcher = new CodebaseMemoryWatcher(engine, { worktreeId: 'watch-test' });

  assert.strictEqual(watcher.isWatching(), false);
  const started = watcher.start(tmpDir);
  assert.strictEqual(started, true);
  assert.strictEqual(watcher.isWatching(), true);
  assert.ok(watcher.getWatchedDir()?.includes(tmpDir));

  watcher.stop();
  assert.strictEqual(watcher.isWatching(), false);
  assert.strictEqual(watcher.getWatchedDir(), null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CodebaseMemoryWatcher: filters ignored files and flushes pending changes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-watch-events-'));
  const validFile = path.join(tmpDir, 'service.ts');
  fs.writeFileSync(validFile, 'export class MyService {}', 'utf8');

  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const watcher = new CodebaseMemoryWatcher(engine, {
    worktreeId: 'watch-test',
    debounceMs: 10,
    settlingMs: 0
  });

  watcher.handleRawEvent(tmpDir, 'service.ts');
  watcher.handleRawEvent(tmpDir, 'node_modules/bad.ts');
  watcher.handleRawEvent(tmpDir, 'image.png');

  const res = watcher.flushPendingFiles();
  assert.strictEqual(res.processed, 1, 'Only valid service.ts should be processed');
  assert.strictEqual(res.updated, 1, 'File should be indexed in engine');

  const stats = engine.getMemoryStats('watch-test');
  assert.strictEqual(stats.totalFiles, 1);
  assert.strictEqual(stats.totalSymbols, 1);

  watcher.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CodebaseMemoryWatcher: evicts deleted files from engine on flush', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-watch-del-'));
  const target = path.join(tmpDir, 'to_remove.ts');
  fs.writeFileSync(target, 'export class DeletedModel {}', 'utf8');

  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const watcher = new CodebaseMemoryWatcher(engine, {
    worktreeId: 'del-test',
    settlingMs: 0
  });

  watcher.handleRawEvent(tmpDir, 'to_remove.ts');
  watcher.flushPendingFiles();
  assert.strictEqual(engine.getMemoryStats('del-test').totalFiles, 1);

  fs.unlinkSync(target);
  watcher.handleRawEvent(tmpDir, 'to_remove.ts');
  const flushRes = watcher.flushPendingFiles();
  assert.strictEqual(flushRes.processed, 1);
  assert.strictEqual(engine.getMemoryStats('del-test').totalFiles, 0);

  watcher.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CodebaseMemoryWatcher: retries and recovers from EBUSY errors via backoff', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-watch-ebusy-'));
  const target = path.join(tmpDir, 'busy.ts');
  fs.writeFileSync(target, 'export class BusyService {}', 'utf8');

  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  let attempts = 0;
  const watcher = new CodebaseMemoryWatcher(engine, {
    worktreeId: 'ebusy-test',
    backoffDelays: [5, 10, 15],
    settlingMs: 0,
    fileReader: (filePath: string) => {
      if (attempts < 2) {
        attempts++;
        const err = new Error('EBUSY: resource busy or locked');
        (err as { code?: string }).code = 'EBUSY';
        throw err;
      }
      return fs.readFileSync(filePath, 'utf8');
    }
  });

  const content = watcher.readFileWithSettling(target);
  assert.strictEqual(attempts, 2, 'Should have retried twice on EBUSY');
  assert.ok(content?.includes('export class BusyService'));

  watcher.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CodebaseMemoryWatcher: returns null gracefully if EBUSY exceeds retry limit', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-watch-ebusy-fail-'));
  const target = path.join(tmpDir, 'locked.ts');
  fs.writeFileSync(target, 'export class LockedService {}', 'utf8');

  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const watcher = new CodebaseMemoryWatcher(engine, {
    worktreeId: 'ebusy-fail',
    backoffDelays: [5, 5],
    settlingMs: 0,
    fileReader: () => {
      const err = new Error('EPERM: operation not permitted');
      (err as { code?: string }).code = 'EPERM';
      throw err;
    }
  });

  const content = watcher.readFileWithSettling(target);
  assert.strictEqual(content, null, 'Should return null without throwing');

  watcher.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CodebaseMemoryWatcher: settles and detects file modification stability', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-watch-settle-'));
  const target = path.join(tmpDir, 'stable.ts');
  fs.writeFileSync(target, 'export class StableClass {}', 'utf8');

  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const watcher = new CodebaseMemoryWatcher(engine, {
    worktreeId: 'settle-test',
    settlingMs: 5
  });

  const content = watcher.readFileWithSettling(target);
  assert.ok(content?.includes('export class StableClass'));

  watcher.stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
