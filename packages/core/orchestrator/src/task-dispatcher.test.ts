import { test } from 'node:test';
import * as assert from 'node:assert';
import { TaskDispatcher, type ILoopBreaker } from './task-dispatcher.js';
import { WorktreeManager } from './worktree-manager.js';
import { GitHubClient, type GitHubIssue } from '@aegis/github-live';

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

function createCountingBreaker(targetNum: number, maxFailures: number): ILoopBreaker & { count: number } {
  const state = { count: 0 };
  return {
    get count() { return state.count; },
    isBlocked: (num: number) => num === targetNum && state.count >= maxFailures,
    recordFailure: (_num: number, err: string) => {
      state.count++;
      return {
        blocked: state.count >= maxFailures,
        attempts: state.count,
        maxFailures,
        reason: state.count >= maxFailures ? `Exceeded: ${err}` : undefined
      };
    }
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

test('TaskDispatcher handles repeated task failures and marks issue blocked', async () => {
  const wt = new WorktreeManager();
  const client = new GitHubClient();
  const issue = makeIssue(42, ['src/Failing.ts']);
  client.registerIssue(issue);

  const breaker = createCountingBreaker(42, 3);
  const dispatcher = new TaskDispatcher(wt, breaker);

  await dispatcher.handleTaskFailure('alice', 42, 'fail 1', client);
  const f2 = await dispatcher.handleTaskFailure('alice', 42, 'fail 2', client);
  assert.strictEqual(f2.blocked, false);

  const f3 = await dispatcher.handleTaskFailure('alice', 42, 'fail 3', client);
  assert.strictEqual(f3.blocked, true);
  assert.strictEqual(client.getIssue(42)?.status, 'blocked');
});

test('TaskDispatcher skips blocked issues during dispatching', () => {
  const wt = new WorktreeManager();
  const issue = makeIssue(42, ['src/Blocked.ts']);
  issue.status = 'blocked';

  const breaker = createCountingBreaker(42, 3);
  const dispatcher = new TaskDispatcher(wt, breaker);

  const result = dispatcher.dispatchNextTask(['alice'], [issue]);
  assert.strictEqual(result.dispatched, false);
});
