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

test('WikiMemoryManager extracts selective tagged memory summaries', () => {
  const wiki = new WikiMemoryManager();
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
});
