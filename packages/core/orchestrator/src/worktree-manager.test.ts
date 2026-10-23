import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorktreeManager } from './worktree-manager.js';

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
