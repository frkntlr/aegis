import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorktreeLockManager } from './worktree-lock-manager.js';

test('WorktreeLockManager acquires conflict-free locks and reports conflicts', () => {
  const manager = new WorktreeLockManager();
  const res1 = manager.acquireFileLocks('alice', ['src/a.ts', 'src/b.ts']);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.conflictingFiles.length, 0);

  const res2 = manager.acquireFileLocks('bob', ['src/b.ts', 'src/c.ts']);
  assert.strictEqual(res2.success, false);
  assert.deepStrictEqual(res2.conflictingFiles, ['src/b.ts']);

  manager.releaseFileLocks('alice');
  const res3 = manager.acquireFileLocks('bob', ['src/b.ts']);
  assert.strictEqual(res3.success, true);
});

test('WorktreeLockManager handles batch locks atomically', () => {
  const manager = new WorktreeLockManager();
  const batch1 = [
    { agentName: 'alice', files: ['src/1.ts'] },
    { agentName: 'bob', files: ['src/2.ts'] }
  ];
  const res1 = manager.acquireBatchLocks(batch1);
  assert.strictEqual(res1.success, true);

  const batch2 = [
    { agentName: 'charlie', files: ['src/2.ts', 'src/3.ts'] }
  ];
  const res2 = manager.acquireBatchLocks(batch2);
  assert.strictEqual(res2.success, false);
  assert.deepStrictEqual(res2.conflictingFiles, ['src/2.ts']);
  assert.strictEqual(manager.getLockedFiles().has('src/3.ts'), false);
});

test('WorktreeLockManager automatically prunes stale locks older than staleTimeoutMs', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-stale-prune-'));
  try {
    const manager = new WorktreeLockManager({ repoRoot: tmpRepo, persistLocks: true, staleTimeoutMs: 2000 });
    manager.acquireFileLocks('alice', ['src/old.ts']);
    assert.strictEqual(manager.getLockedFiles().get('src/old.ts'), 'alice');

    // Simulate lock age > 2000ms
    const metaFile = manager.getMetaFilePath();
    const metaData = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    metaData['src/old.ts'].acquiredAt = Date.now() - 5000;
    fs.writeFileSync(metaFile, JSON.stringify(metaData), 'utf8');

    // Re-instantiate or prune
    const manager2 = new WorktreeLockManager({ repoRoot: tmpRepo, persistLocks: true, staleTimeoutMs: 2000 });
    assert.strictEqual(manager2.getLockedFiles().has('src/old.ts'), false);

    const prunedCount = manager.pruneStaleLocks(2000);
    assert.ok(prunedCount >= 0);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('WorktreeLockManager prunes orphaned locks when owner PID is dead', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-orphaned-prune-'));
  try {
    const aegisDir = path.resolve(tmpRepo, '.aegis');
    fs.mkdirSync(aegisDir, { recursive: true });

    // Write lock with dead PID
    fs.writeFileSync(path.join(aegisDir, 'locks.json'), JSON.stringify({
      'src/orphan.ts': { agent: 'ghost-agent', pid: 99999999, acquiredAt: Date.now() }
    }), 'utf8');

    const manager = new WorktreeLockManager({ repoRoot: tmpRepo, persistLocks: true });
    assert.strictEqual(manager.getLockedFiles().has('src/orphan.ts'), false);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('WorktreeLockManager recovers from corrupted lock files safely', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-corrupt-lockmgr-'));
  try {
    const aegisDir = path.resolve(tmpRepo, '.aegis');
    fs.mkdirSync(aegisDir, { recursive: true });
    fs.writeFileSync(path.join(aegisDir, 'locks.json'), '{"corrupt":', 'utf8');

    const manager = new WorktreeLockManager({ repoRoot: tmpRepo, persistLocks: true });
    assert.strictEqual(manager.getLockedFiles().size, 0);

    const backups = fs.readdirSync(aegisDir).filter(f => f.startsWith('locks.json.corrupt.'));
    assert.strictEqual(backups.length, 1);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('WorktreeLockManager normalizes paths and releases files correctly', () => {
  const manager = new WorktreeLockManager();
  manager.acquireFileLocks('alice', ['dir\\sub\\file.ts']);
  assert.strictEqual(manager.getLockedFiles().has('dir/sub/file.ts'), true);

  manager.releaseFiles(['dir/sub/file.ts']);
  assert.strictEqual(manager.getLockedFiles().size, 0);
});

test('WorktreeLockManager supports non-conflicting intra-file AST section mutex locks', () => {
  const manager = new WorktreeLockManager();
  const aliceRes = manager.acquireFileLocks('alice', ['src/service.ts#logic']);
  assert.strictEqual(aliceRes.success, true);

  // Bob can concurrently lock a different section of the EXACT same file
  const bobRes = manager.acquireFileLocks('bob', ['src/service.ts#contract']);
  assert.strictEqual(bobRes.success, true);

  // Charlie cannot lock the same section that Alice owns
  const charlieRes = manager.acquireFileLocks('charlie', ['src/service.ts#logic']);
  assert.strictEqual(charlieRes.success, false);
  assert.ok(charlieRes.conflictingFiles.includes('src/service.ts#logic'));

  // Dave cannot lock the whole file while sections are held
  const daveRes = manager.acquireFileLocks('dave', ['src/service.ts']);
  assert.strictEqual(daveRes.success, false);
  assert.ok(daveRes.conflictingFiles.includes('src/service.ts'));
});
