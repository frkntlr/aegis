import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import {
  normalizeRole,
  mcpTaskList,
  mcpTaskClaim,
  mcpTaskRelease,
  mcpTaskInboxPull,
  mcpLockStatus,
  handleTaskList,
  handleTaskPull,
  handleLockStatus,
  handleTaskVerify
} from './task-commands.js';

test('normalizeRole maps agent variants accurately', () => {
  assert.strictEqual(normalizeRole('qa'), 'qa-hunter');
  assert.strictEqual(normalizeRole('qa-hunter'), 'qa-hunter');
  assert.strictEqual(normalizeRole('ui'), 'ui-specialist');
  assert.strictEqual(normalizeRole('ui-specialist'), 'ui-specialist');
  assert.strictEqual(normalizeRole('docs'), 'doc-architect');
  assert.strictEqual(normalizeRole('doc-architect'), 'doc-architect');
  assert.strictEqual(normalizeRole('solver'), 'issue-solver');
  assert.strictEqual(normalizeRole('default'), 'issue-solver');
});

test('mcpTaskList returns valid JSON task list', () => {
  const res = JSON.parse(mcpTaskList());
  assert.ok(typeof res.count === 'number');
  assert.ok(Array.isArray(res.tasks));
});

test('mcpTaskClaim and mcpTaskRelease operate cleanly', () => {
  const claimRes = JSON.parse(mcpTaskClaim({ issueNumber: 999, agentRole: 'solver' }));
  assert.strictEqual(claimRes.success, true);
  assert.strictEqual(claimRes.issueNumber, 999);
  assert.strictEqual(claimRes.role, 'issue-solver');

  const releaseRes = JSON.parse(mcpTaskRelease({ issueNumber: 999, status: 'done', agentRole: 'solver' }));
  assert.strictEqual(releaseRes.success, true);
  assert.strictEqual(releaseRes.status, 'done');
});

test('mcpTaskInboxPull handles empty queue gracefully', () => {
  const res = JSON.parse(mcpTaskInboxPull({ agentRole: 'qa-hunter' }));
  assert.ok('task' in res);
});

test('mcpLockStatus returns locked files structure', () => {
  const res = JSON.parse(mcpLockStatus());
  assert.ok(typeof res.count === 'number');
  assert.ok(typeof res.lockedFiles === 'object');
});

test('handleTaskList and handleTaskPull execute without throwing', () => {
  assert.doesNotThrow(() => handleTaskList());
  assert.doesNotThrow(() => handleTaskPull('qa'));
  assert.doesNotThrow(() => handleLockStatus());
});

test('handleTaskVerify runs without error in test environment', () => {
  const target = fs.existsSync('src/bin/aegis.ts') ? 'src/bin/aegis.ts' : 'packages/cli/src/bin/aegis.ts';
  assert.doesNotThrow(() => handleTaskVerify(target));
});
