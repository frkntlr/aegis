import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorktreeManager } from './worktree-manager.js';
import { WorktreeMutex } from './worktree-mutex.js';

test('WorktreeManager correctly resolves worktree path', () => {
  const manager = new WorktreeManager({ repoRoot: 'C:/mock/repo', worktreePrefix: 'experimental' });
  const p = manager.getWorktreePath('alice');
  assert.ok(p.includes('experimental'));
  assert.ok(p.includes('alice'));
});

test('WorktreeManager acquires conflict-free file locks', () => {
  const manager = new WorktreeManager();

  const res1 = manager.acquireFileLocks('alice', ['src/Header.tsx', 'src/Navbar.tsx']);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.conflictingFiles.length, 0);

  const res2 = manager.acquireFileLocks('bob', ['src/Header.tsx', 'src/Footer.tsx']);
  assert.strictEqual(res2.success, false);
  assert.deepStrictEqual(res2.conflictingFiles, ['src/Header.tsx']);

  const res3 = manager.acquireFileLocks('bob', ['src/Footer.tsx']);
  assert.strictEqual(res3.success, true);

  manager.releaseFileLocks('alice');
  const res4 = manager.acquireFileLocks('bob', ['src/Header.tsx']);
  assert.strictEqual(res4.success, true);
});

test('WorktreeManager safely synchronizes locks across multiple instances without race conditions', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-locks-race-'));
  try {
    const managerA = new WorktreeManager({ repoRoot: tmpRepo, persistLocks: true });
    const managerB = new WorktreeManager({ repoRoot: tmpRepo, persistLocks: true });

    const lockA = managerA.acquireFileLocks('solver', ['src/solver.ts']);
    assert.strictEqual(lockA.success, true);

    const lockB = managerB.acquireFileLocks('qa', ['src/solver.ts']);
    assert.strictEqual(lockB.success, false);
    assert.deepStrictEqual(lockB.conflictingFiles, ['src/solver.ts']);

    const lockB2 = managerB.acquireFileLocks('qa', ['src/qa.ts']);
    assert.strictEqual(lockB2.success, true);

    const allLocks = managerA.getLockedFiles();
    assert.strictEqual(allLocks.get('src/solver.ts'), 'solver');
    assert.strictEqual(allLocks.get('src/qa.ts'), 'qa');

    const lockFile = path.resolve(tmpRepo, '.aegis', 'locks.json');
    assert.ok(fs.existsSync(lockFile));
    const json = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.strictEqual(json['src/solver.ts'], 'solver');
    assert.strictEqual(json['src/qa.ts'], 'qa');
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('WorktreeManager cleans up stale lock when owner PID is dead', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-locks-stale-'));
  try {
    const lockDir = path.resolve(tmpRepo, '.aegis', 'locks.json.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'pid'), '99999999', 'utf8');

    const manager = new WorktreeManager({ repoRoot: tmpRepo, persistLocks: true });
    const res = manager.acquireFileLocks('solver', ['src/recovered.ts']);
    assert.strictEqual(res.success, true);
    assert.strictEqual(manager.getLockedFiles().get('src/recovered.ts'), 'solver');
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('WorktreeManager normalizes path separators preventing cross-platform lock bypass', () => {
  const manager = new WorktreeManager();
  const res1 = manager.acquireFileLocks('alice', ['packages/core/foo.ts']);
  assert.strictEqual(res1.success, true);

  const res2 = manager.acquireFileLocks('bob', ['packages\\core\\foo.ts']);
  assert.strictEqual(res2.success, false);
  assert.deepStrictEqual(res2.conflictingFiles, ['packages/core/foo.ts']);

  const allLocks = manager.getLockedFiles();
  assert.strictEqual(allLocks.get('packages/core/foo.ts'), 'alice');
});

test('WorktreeManager recovers from corrupted locks.json and creates backup', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-locks-corrupt-'));
  try {
    const aegisDir = path.resolve(tmpRepo, '.aegis');
    fs.mkdirSync(aegisDir, { recursive: true });
    const lockFile = path.resolve(aegisDir, 'locks.json');
    fs.writeFileSync(lockFile, 'INVALID_JSON_CORRUPTED_DATA', 'utf8');

    const manager = new WorktreeManager({ repoRoot: tmpRepo, persistLocks: true });
    assert.strictEqual(manager.getLockedFiles().size, 0);

    const backups = fs.readdirSync(aegisDir).filter(f => f.startsWith('locks.json.corrupt.'));
    assert.strictEqual(backups.length, 1);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('WorktreeMutex marks lock as stale when age exceeds TTL even if process appears alive', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mutex-ttl-'));
  try {
    const lockDir = path.resolve(tmpRepo, 'test.lock');
    fs.mkdirSync(lockDir, { recursive: true });
    const pidFile = path.join(lockDir, 'pid');
    fs.writeFileSync(pidFile, String(process.pid), 'utf8');

    // Simulate old mtime > 60s
    const oldTime = (Date.now() - 70000) / 1000;
    fs.utimesSync(lockDir, oldTime, oldTime);

    assert.strictEqual(WorktreeMutex.isLockStale(lockDir, pidFile), true);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});
