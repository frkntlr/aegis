import { test } from 'node:test';
import * as assert from 'node:assert';
import { TaskDispatcher } from './task-dispatcher.js';
import { WorktreeManager } from './worktree-manager.js';
import type { GitHubIssue } from '@aegis/github-live';

function makeIssue(num: number, targetFiles: string[]): GitHubIssue {
  return {
    id: num,
    number: num,
    title: `Task ${num}`,
    body: 'desc',
    labels: ['status:ready'],
    status: 'ready',
    targetFiles,
    acceptanceCriteria: []
  };
}

test('TaskDispatcher dispatches non-conflicting tasks to available agents', () => {
  const wt = new WorktreeManager();
  const dispatcher = new TaskDispatcher(wt);

  const issue1 = makeIssue(1, ['src/Header.tsx']);
  const issue2 = makeIssue(2, ['src/Header.tsx', 'src/Nav.tsx']);
  const issue3 = makeIssue(3, ['src/Footer.tsx']);

  const res1 = dispatcher.dispatchNextTask(['alice'], [issue1, issue2, issue3]);
  assert.strictEqual(res1.dispatched, true);
  assert.strictEqual(res1.agentName, 'alice');
  assert.strictEqual(res1.issue?.number, 1);

  const res2 = dispatcher.dispatchNextTask(['bob'], [issue1, issue2, issue3]);
  assert.strictEqual(res2.dispatched, true);
  assert.strictEqual(res2.agentName, 'bob');
  assert.strictEqual(res2.issue?.number, 3);

  const res3 = dispatcher.dispatchNextTask(['charlie'], [issue1, issue2, issue3]);
  assert.strictEqual(res3.dispatched, false);
});
