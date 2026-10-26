import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { BranchReconciler } from './branch-reconciler.js';

test('BranchReconciler discoverWorktrees returns empty list gracefully on non-git dir', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-reconcile-test-'));
  const reconciler = new BranchReconciler(tmpDir);
  const wts = reconciler.discoverWorktrees();
  assert.deepStrictEqual(wts, []);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('BranchReconciler resolveBranchName resolves custom branch or defaults to aegis/agent', () => {
  const reconciler = new BranchReconciler(process.cwd());
  const resolved = reconciler.resolveBranchName('contributor', 'non-existent-dir');
  assert.strictEqual(resolved, 'aegis/contributor');

  const prefixed = reconciler.resolveBranchName('aegis/custom', 'non-existent-dir');
  assert.strictEqual(prefixed, 'aegis/custom');
});

test('BranchReconciler withStashGuard executes wrapped callback seamlessly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-stash-test-'));
  const reconciler = new BranchReconciler(tmpDir);
  const result = reconciler.withStashGuard(tmpDir, () => {
    return 42;
  });
  assert.strictEqual(result, 42);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('BranchReconciler syncWorktree reports failure gracefully on non-git directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-sync-test-'));
  const reconciler = new BranchReconciler(tmpDir);
  const report = reconciler.syncWorktree('contributor', tmpDir, 'master');
  assert.strictEqual(report.passed, false);
  assert.ok(report.message.includes('Failed to synchronize sibling'));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
