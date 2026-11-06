import { test } from 'node:test';
import * as assert from 'node:assert';
import { GitPushManager, mcpGitPush } from './git-push-command.js';

test('GitPushManager detects current branch', () => {
  const mgr = new GitPushManager();
  const branch = mgr.detectCurrentBranch();
  assert.ok(typeof branch === 'string');
  assert.ok(branch.length > 0);
});

test('GitPushManager checks auth status safely without hanging', () => {
  const mgr = new GitPushManager();
  const auth = mgr.checkAuthStatus();
  assert.ok(typeof auth.authenticated === 'boolean');
});

test('GitPushManager checks ahead status', () => {
  const mgr = new GitPushManager();
  const branch = mgr.detectCurrentBranch();
  const ahead = mgr.isAheadOfRemote(branch);
  assert.ok(typeof ahead.ahead === 'boolean');
  assert.ok(typeof ahead.count === 'number');
});

test('mcpGitPush dryRun returns valid JSON response', async () => {
  const resStr = mcpGitPush({ dryRun: true });
  const parsed = JSON.parse(resStr);
  assert.ok(typeof parsed === 'object');
  assert.ok(parsed.branch || parsed.error);
});
