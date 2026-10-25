import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GitFastSyncEngine } from './git-fast-sync.js';
import { CodebaseMemoryEngine } from './codebase-memory.js';

test('GitFastSyncEngine: retrieves head commit and porcelain status', () => {
  const head = GitFastSyncEngine.getHeadCommit();
  assert.ok(head === null || typeof head === 'string');

  const status = GitFastSyncEngine.getPorcelainStatus();
  assert.ok(status === null || Array.isArray(status));
});

test('GitFastSyncEngine: evaluateFastSync handles match and mismatch', () => {
  const head = GitFastSyncEngine.getHeadCommit();
  if (head) {
    const resSame = GitFastSyncEngine.evaluateFastSync(head);
    assert.strictEqual(typeof resSame.canSkipScan, 'boolean');
    assert.strictEqual(resSame.headCommit, head);

    const resDiff = GitFastSyncEngine.evaluateFastSync('0000000000000000000000000000000000000000');
    assert.strictEqual(resDiff.canSkipScan, false);
  }
});

test('GitFastSyncEngine: getFileFingerprint formats mtimeMs and size', () => {
  const tmpFile = path.join(os.tmpdir(), `aegis-fp-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, 'hello fast sync', 'utf8');

  const fp = GitFastSyncEngine.getFileFingerprint(tmpFile);
  assert.ok(fp);
  assert.match(fp, /^\d+:\d+$/);

  fs.unlinkSync(tmpFile);
  assert.strictEqual(GitFastSyncEngine.getFileFingerprint(tmpFile), null);
});

test('CodebaseMemoryEngine: fastSync skips disk scan when cache is valid and clean', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-fs-dir-'));
  const f1 = path.join(tmpDir, 'service.ts');
  fs.writeFileSync(f1, 'export class FastService {}', 'utf8');

  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const first = engine.indexDirectory(tmpDir, 'fs-test');
  assert.strictEqual(first.indexed, 1);
  assert.strictEqual(first.cached, 0);

  // Second scan with unchanged file uses mtime fingerprint cache
  const second = engine.indexDirectory(tmpDir, 'fs-test');
  assert.strictEqual(second.indexed, 0);
  assert.strictEqual(second.cached, 1);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
