import { test, type TestContext } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '@aegis/shared';
import { GitPushManager, handleGitPush, mcpGitPush } from './git-push-command.js';

function mockPush(t: TestContext): void {
  t.mock.method(GitPushManager.prototype, 'detectCurrentBranch', () => 'main');
  t.mock.method(GitPushManager.prototype, 'checkAuthStatus', () => ({ authenticated: true }));
  t.mock.method(GitPushManager.prototype, 'hasUncommittedChanges', () => true);
  t.mock.method(GitPushManager.prototype, 'isAheadOfRemote', () => ({ ahead: true, count: 1 }));
  t.mock.method(console, 'log', () => undefined);
  t.mock.method(console, 'error', () => undefined);
}

test('a failed real fetch produces an error instead of claiming a synchronized branch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-push-check-'));
  try {
    const options = { cwd: root, env: cleanGitEnv(), stdio: 'pipe' as const, windowsHide: true };
    execFileSync('git', ['init', '--initial-branch=main'], options);
    execFileSync('git', ['remote', 'add', 'origin', path.join(root, 'missing-origin.git')], options);
    const ahead = new GitPushManager(root).isAheadOfRemote('main');
    assert.equal(ahead.ahead, false);
    assert.match(ahead.error ?? '', /Could not verify origin\/main/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('MCP propagates fetch failure and never calls push', t => {
  mockPush(t);
  t.mock.method(GitPushManager.prototype, 'isAheadOfRemote', () => ({ ahead: false, count: 0, error: 'fetch failed' }));
  const push = t.mock.method(GitPushManager.prototype, 'executePush');
  const result = JSON.parse(mcpGitPush({ dryRun: true, autoCommit: false }));
  assert.equal(result.success, false);
  assert.equal(result.error, 'fetch failed');
  assert.equal(push.mock.callCount(), 0);
});

test('CLI propagates fetch failure and never calls push', async t => {
  mockPush(t);
  t.mock.method(GitPushManager.prototype, 'isAheadOfRemote', () => ({ ahead: false, count: 0, error: 'fetch failed' }));
  const push = t.mock.method(GitPushManager.prototype, 'executePush');
  assert.equal(await handleGitPush('--dry-run'), false);
  assert.equal(push.mock.callCount(), 0);
});

test('CLI dry-run with --commit never stages or commits working tree changes', async t => {
  mockPush(t);
  const commit = t.mock.method(GitPushManager.prototype, 'commitAll');
  const push = t.mock.method(GitPushManager.prototype, 'executePush', () => ({ success: true, message: 'checked' }));
  assert.equal(await handleGitPush('--dry-run', '--commit'), true);
  assert.equal(commit.mock.callCount(), 0);
  assert.deepEqual(push.mock.calls[0].arguments, ['main', true]);
});

test('CLI only commits when --commit was supplied', async t => {
  mockPush(t);
  const commit = t.mock.method(GitPushManager.prototype, 'commitAll');
  t.mock.method(GitPushManager.prototype, 'executePush', () => ({ success: true, message: 'pushed' }));
  assert.equal(await handleGitPush(), true);
  assert.equal(commit.mock.callCount(), 0);
});

test('MCP dry-run never stages or commits working tree changes', t => {
  mockPush(t);
  const commit = t.mock.method(GitPushManager.prototype, 'commitAll');
  t.mock.method(GitPushManager.prototype, 'executePush', () => ({ success: true, message: 'checked' }));
  assert.equal(JSON.parse(mcpGitPush({ dryRun: true, autoCommit: true })).success, true);
  assert.equal(commit.mock.callCount(), 0);
});

test('a failed auto-commit prevents MCP push', t => {
  mockPush(t);
  t.mock.method(GitPushManager.prototype, 'commitAll', () => false);
  const push = t.mock.method(GitPushManager.prototype, 'executePush');
  const result = JSON.parse(mcpGitPush({ autoCommit: true }));
  assert.equal(result.success, false);
  assert.match(result.error, /Commit failed/);
  assert.equal(push.mock.callCount(), 0);
});

test('a failed explicit CLI commit prevents push', async t => {
  mockPush(t);
  t.mock.method(GitPushManager.prototype, 'commitAll', () => false);
  const push = t.mock.method(GitPushManager.prototype, 'executePush');
  assert.equal(await handleGitPush('--commit'), false);
  assert.equal(push.mock.callCount(), 0);
});
