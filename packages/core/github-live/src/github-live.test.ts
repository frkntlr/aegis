import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { test } from 'node:test';
import * as assert from 'node:assert';
import { GitHubClient } from './github-client.js';
import { WikiMemoryManager } from './wiki-memory.js';

test('GitHubClient claims ready issue and locks status', () => {
  const client = new GitHubClient();
  client.registerIssue({
    id: 1,
    number: 1,
    title: 'Implement Navigation Header',
    body: 'Create Header with responsive toggle',
    labels: ['status:ready', 'lock:src/Header.tsx', 'wiki:ui-header'],
    status: 'ready',
    targetFiles: ['src/Header.tsx'],
    acceptanceCriteria: ['Responsive on 390px', 'Pass unit test']
  });

  const ready = client.listReadyIssues();
  assert.strictEqual(ready.length, 1);

  const claim = client.claimIssue(1, 'alice');
  assert.strictEqual(claim.success, true);
  assert.strictEqual(claim.issue?.assignee, 'alice');
  assert.strictEqual(claim.issue?.status, 'in_progress');

  // Second claim fails
  const claim2 = client.claimIssue(1, 'bob');
  assert.strictEqual(claim2.success, false);
});

test('GitHubClient blocks self-spawning beyond limit', () => {
  const client = new GitHubClient({ maxSelfSpawnedIssues: 2 });
  
  const spawn1 = client.spawnSubIssue(10, 'Subtask 1', 'desc', ['file1.ts']);
  assert.strictEqual(spawn1.success, true);

  const spawn2 = client.spawnSubIssue(10, 'Subtask 2', 'desc', ['file2.ts']);
  assert.strictEqual(spawn2.success, true);

  // Third attempt must be blocked
  const spawn3 = client.spawnSubIssue(10, 'Subtask 3', 'desc', ['file3.ts']);
  assert.strictEqual(spawn3.success, false);
  assert.ok(spawn3.error?.includes('limit reached'));
});

test('GitHubClient blocks failed issue and assigns status:blocked', async () => {
  const client = new GitHubClient();
  client.registerIssue({
    id: 42,
    number: 42,
    title: 'Failing Task',
    body: 'Fails repeatedly',
    labels: ['status:in_progress'],
    status: 'in_progress',
    targetFiles: ['src/Buggy.ts'],
    acceptanceCriteria: ['Fix test']
  });

  const result = await client.blockIssue(42, '3 consecutive test failures');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.issue?.status, 'blocked');
  assert.ok(result.issue?.labels.includes('status:blocked'));
  assert.ok(!result.issue?.labels.includes('status:in_progress'));
});

test('WikiMemoryManager extracts selective tagged memory summaries', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-gh-test-'));
  try {
    const wiki = new WikiMemoryManager(tmpDir);
    wiki.setPage('ui-header', 'Navigation Header', [
      'Uses React + CSS Modules with flexbox',
      'Mobile breakpoint is 768px',
      'Never hardcode user avatar URL; use auth context'
    ]);

    const context = wiki.getContextForLabels(['status:ready', 'wiki:ui-header']);
    assert.ok(context.includes('Navigation Header'));
    assert.ok(context.includes('Mobile breakpoint is 768px'));

    // Irrelevant wiki pages are NOT pulled in, avoiding context bloat
    const irrelevant = wiki.getContextForLabels(['status:ready', 'wiki:unrelated']);
    assert.ok(!irrelevant.includes('Navigation Header'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitHubClient completes issue and filters out done issues from ready list', async () => {
  const client = new GitHubClient();
  client.registerIssue({
    id: 99,
    number: 99,
    title: 'Completed Task',
    body: 'Some description',
    labels: ['status:in_progress'],
    status: 'in_progress',
    targetFiles: ['src/Completed.ts'],
    acceptanceCriteria: ['All tests pass']
  });

  const res = await client.completeIssue(99, 'solver');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.issue?.status, 'done');
  assert.strictEqual(res.issue?.assignee, undefined);
  assert.strictEqual(res.issue?.labels.includes('status:done'), true);
  assert.strictEqual(res.issue?.labels.includes('status:in_progress'), false);

  const ready = client.listReadyIssues();
  assert.strictEqual(ready.length, 0);
});

test('GitHubClient spawnSubIssue avoids ID collisions with non-sequential issue numbers', () => {
  const client = new GitHubClient();
  client.registerIssue({
    id: 100,
    number: 100,
    title: 'High ID Task',
    body: 'desc',
    labels: ['status:ready'],
    status: 'ready',
    targetFiles: ['src/index.ts'],
    acceptanceCriteria: []
  });

  const spawned = client.spawnSubIssue(100, 'Subtask', 'body', ['src/sub.ts']);
  assert.strictEqual(spawned.success, true);
  assert.strictEqual(spawned.createdIssue?.number, 101);
  assert.strictEqual(client.getIssue(100)?.title, 'High ID Task');
  assert.strictEqual(client.getIssue(101)?.title, '[Subtask of #100] Subtask');
});

test('GitHubClient updateIssueStatus synchronizes status labels and resets assignee on ready or done', () => {
  const client = new GitHubClient();
  client.registerIssue({
    id: 50,
    number: 50,
    title: 'In Progress Task',
    body: 'desc',
    labels: ['status:in_progress', 'lock:src/Task.ts'],
    status: 'in_progress',
    assignee: 'solver',
    targetFiles: ['src/Task.ts'],
    acceptanceCriteria: []
  });

  const updatedReady = client.updateIssueStatus(50, 'ready');
  assert.strictEqual(updatedReady, true);
  const issue = client.getIssue(50);
  assert.strictEqual(issue?.status, 'ready');
  assert.strictEqual(issue?.assignee, undefined);
  assert.strictEqual(issue?.labels.includes('status:ready'), true);
  assert.strictEqual(issue?.labels.includes('status:in_progress'), false);

  client.claimIssue(50, 'bob');
  assert.strictEqual(client.getIssue(50)?.assignee, 'bob');

  const updatedDone = client.updateIssueStatus(50, 'done');
  assert.strictEqual(updatedDone, true);
  assert.strictEqual(client.getIssue(50)?.status, 'done');
  assert.strictEqual(client.getIssue(50)?.assignee, undefined);
  assert.strictEqual(client.getIssue(50)?.labels.includes('status:done'), true);
});
