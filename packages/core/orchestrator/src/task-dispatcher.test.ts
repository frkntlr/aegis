import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  TaskDispatcher,
  categorizeError,
  formatSocraticDiagnosis,
  type ILoopBreaker
} from './task-dispatcher.js';
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

test('TaskDispatcher releases locks on non-terminal task failure', async () => {
  const wt = new WorktreeManager();
  wt.acquireFileLocks('alice', ['src/Failing.ts']);
  assert.strictEqual(wt.getLockedFiles().get('src/Failing.ts'), 'alice');

  const breaker = createCountingBreaker(10, 3);
  const dispatcher = new TaskDispatcher(wt, breaker);

  // Attempt 1 of 3 (non-terminal failure)
  const res = await dispatcher.handleTaskFailure('alice', 10, 'transient test error');
  assert.strictEqual(res.blocked, false);
  // Lock must be released cleanly
  assert.strictEqual(wt.getLockedFiles().has('src/Failing.ts'), false);
});

test('TaskDispatcher skips closed or done issues even if present in queue', () => {
  const wt = new WorktreeManager();
  const dispatcher = new TaskDispatcher(wt);

  const doneIssue: GitHubIssue = {
    ...makeIssue(50, ['src/Done.ts']),
    status: 'done',
    labels: ['status:done']
  };

  const readyWithDoneLabel: GitHubIssue = {
    ...makeIssue(51, ['src/Stale.ts']),
    status: 'ready',
    labels: ['status:ready', 'status:done']
  };

  const res = dispatcher.dispatchNextTask(['solver'], [doneIssue, readyWithDoneLabel]);
  assert.strictEqual(res.dispatched, false);
});


test('TaskDispatcher prevents assigning tasks to incompatible specialized agents', () => {
  const wt = new WorktreeManager();
  const dispatcher = new TaskDispatcher(wt);

  const bugIssue: GitHubIssue = {
    ...makeIssue(60, ['packages/core/engine.ts']),
    title: 'Fix critical engine panic bug',
    labels: ['bug', 'status:ready']
  };

  // Only docs agent is idle in pool
  const res = dispatcher.dispatchNextTask(['docs'], [bugIssue]);
  assert.strictEqual(res.dispatched, false);
  assert.ok(res.reason?.includes('No compatible idle agents'));
});

test('TaskDispatcher completeTask clears loop breaker failure history', () => {
  let successRecorded: number | null = null;
  const breaker: ILoopBreaker = {
    isBlocked: () => false,
    recordFailure: () => ({ blocked: false, attempts: 1, maxFailures: 3 }),
    recordSuccess: (num: number) => { successRecorded = num; }
  };
  const wt = new WorktreeManager();
  const dispatcher = new TaskDispatcher(wt, breaker);

  dispatcher.completeTask('solver', 42);
  assert.strictEqual(successRecorded, 42);
});

test('TaskDispatcher dispatches QA/UI issues to idle ui agent', () => {
  const wt = new WorktreeManager();
  const dispatcher = new TaskDispatcher(wt);

  const uiIssue: GitHubIssue = {
    ...makeIssue(70, ['scenes/Menu.tscn']),
    title: 'Inspect mobile UI layout',
    labels: ['ui', 'status:ready']
  };

  const res = dispatcher.dispatchNextTask(['ui'], [uiIssue]);
  assert.strictEqual(res.dispatched, true);
  assert.strictEqual(res.agentName, 'ui');
});

test('TaskDispatcher categorizeError accurately identifies defect categories', () => {
  assert.strictEqual(categorizeError('SyntaxError: Unexpected identifier at app.ts:1'), 'syntax');
  assert.strictEqual(categorizeError('TS2304: Cannot find name "Foo"'), 'syntax');
  assert.strictEqual(categorizeError('TypeError: Cannot read property "id" of null'), 'runtime');
  assert.strictEqual(categorizeError('Null pointer exception in controller'), 'runtime');
  assert.strictEqual(categorizeError('AssertionError: expected true but got false'), 'test failure');
  assert.strictEqual(categorizeError('fail 1'), 'test failure');
  assert.strictEqual(categorizeError('Command timed out after 30000ms'), 'timeout');
  assert.strictEqual(categorizeError('ETIMEDOUT: Connection refused'), 'timeout');
});

test('TaskDispatcher formatSocraticDiagnosis produces concise hints with stack traces', () => {
  const v8Trace = 'TypeError: Cannot read property "foo" of undefined\n    at Object.run (src/app.ts:25:5)';
  const diag = formatSocraticDiagnosis(v8Trace);
  assert.ok(diag);
  assert.strictEqual(diag.category, 'runtime');
  assert.ok(diag.hint.startsWith('[Socratic Diagnosis] (runtime):'));
  assert.ok(diag.hint.includes('src/app.ts:25:5'));

  const godotTrace = 'SCRIPT ERROR: Invalid get index "player"\n   At: res://scripts/hero.gd:42:take_damage()';
  const godotDiag = formatSocraticDiagnosis(godotTrace);
  assert.ok(godotDiag);
  assert.ok(godotDiag.hint.includes('scripts/hero.gd:42'));

  assert.strictEqual(formatSocraticDiagnosis(''), null);
});

test('TaskDispatcher handleTaskFailure formats Socratic diagnosis and appends to reason', async () => {
  const wt = new WorktreeManager();
  const client = new GitHubClient();
  const issue = makeIssue(88, ['src/Solver.ts']);
  client.registerIssue(issue);

  const breaker = createCountingBreaker(88, 2);
  const dispatcher = new TaskDispatcher(wt, breaker);

  const rawError = 'TypeError: obj is undefined\n    at solve (src/Solver.ts:12:4)';
  const res1 = await dispatcher.handleTaskFailure('solver', 88, rawError, client);
  assert.strictEqual(res1.blocked, false);
  assert.strictEqual(res1.category, 'runtime');
  assert.ok(res1.diagnostic?.startsWith('[Socratic Diagnosis] (runtime):'));
  assert.ok(res1.diagnostic?.includes('src/Solver.ts:12:4'));

  const res2 = await dispatcher.handleTaskFailure('solver', 88, rawError, client);
  assert.strictEqual(res2.blocked, true);
  assert.ok(res2.reason?.includes('[Socratic Diagnosis] (runtime):'));
  assert.ok(client.getIssue(88)?.status === 'blocked');
});
