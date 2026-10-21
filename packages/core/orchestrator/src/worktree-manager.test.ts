import { test } from 'node:test';
import * as assert from 'node:assert';
import { WorktreeManager } from './worktree-manager.js';

test('WorktreeManager correctly resolves worktree path', () => {
  const manager = new WorktreeManager({ repoRoot: 'C:/mock/repo', worktreePrefix: 'experimental' });
  const p = manager.getWorktreePath('alice');
  assert.ok(p.includes('experimental'));
  assert.ok(p.includes('alice'));
});

test('WorktreeManager acquires conflict-free file locks', () => {
  const manager = new WorktreeManager();

  // Alice locks Header.tsx
  const res1 = manager.acquireFileLocks('alice', ['src/Header.tsx', 'src/Navbar.tsx']);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.conflictingFiles.length, 0);

  // Bob attempts to lock Header.tsx -> conflict
  const res2 = manager.acquireFileLocks('bob', ['src/Header.tsx', 'src/Footer.tsx']);
  assert.strictEqual(res2.success, false);
  assert.deepStrictEqual(res2.conflictingFiles, ['src/Header.tsx']);

  // Bob can lock an independent file Footer.tsx
  const res3 = manager.acquireFileLocks('bob', ['src/Footer.tsx']);
  assert.strictEqual(res3.success, true);

  // Alice releases locks -> now Bob can lock Header.tsx
  manager.releaseFileLocks('alice');
  const res4 = manager.acquireFileLocks('bob', ['src/Header.tsx']);
  assert.strictEqual(res4.success, true);
});
