import { test } from 'node:test';
import * as assert from 'node:assert';
import { TaskDispatcher } from './task-dispatcher.js';
import { WorktreeManager } from './worktree-manager.js';
import type { GitHubIssue } from '@aegis/github-live';

test('TaskDispatcher dispatches non-conflicting tasks to available agents', () => {
  const wt = new WorktreeManager();
  const dispatcher = new TaskDispatcher(wt);

  const issue1: GitHubIssue = {
    id: 1,
    number: 1,
    title: 'Task 1',
    body: 'desc',
    labels: ['status:ready'],
    status: 'ready',
    targetFiles: ['src/Header.tsx'],
    acceptanceCriteria: []
  };

  const issue2: GitHubIssue = {
    id: 2,
    number: 2,
    title: 'Task 2 (Conflicting with Task 1)',
    body: 'desc',
    labels: ['status:ready'],
    status: 'ready',
    targetFiles: ['src/Header.tsx', 'src/Nav.tsx'],
    acceptanceCriteria: []
  };

  const issue3: GitHubIssue = {
    id: 3,
    number: 3,
    title: 'Task 3 (Independent)',
    body: 'desc',
    labels: ['status:ready'],
    status: 'ready',
    targetFiles: ['src/Footer.tsx'],
    acceptanceCriteria: []
  };

  // 1. Alice claims issue1 (locks src/Header.tsx)
  const res1 = dispatcher.dispatchNextTask(['alice'], [issue1, issue2, issue3]);
  assert.strictEqual(res1.dispatched, true);
  assert.strictEqual(res1.agentName, 'alice');
  assert.strictEqual(res1.issue?.number, 1);

  // 2. Bob asks for a task.
  // Issue 2 wants src/Header.tsx which is locked by Alice!
  // Dispatcher must automatically skip Issue 2 and dispatch Issue 3!
  const res2 = dispatcher.dispatchNextTask(['bob'], [issue2, issue3]);
  assert.strictEqual(res2.dispatched, true);
  assert.strictEqual(res2.agentName, 'bob');
  assert.strictEqual(res2.issue?.number, 3);
});
