import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLogIgnored } from '@aegis/shared';
import {
  stageTaskInInbox,
  pullNextPendingTask,
  updateTaskInboxStatus,
  listInboxTasks
} from './task-inbox.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-task-inbox-match-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err: unknown) {
    debugLogIgnored('TaskInboxMatchingTest:cleanup', err);
  }
});

test('pullNextPendingTask pulls specifically by issue number or subagent label', () => {
  stageTaskInInbox({
    issueNumber: 501,
    title: 'Task A',
    role: 'issue-solver [Parser]',
    worktree: 'experimental/solver',
    targetFiles: ['src/parser.ts'],
    acceptanceCriteria: [],
    prompt: 'Prompt A'
  }, tmpDir);

  stageTaskInInbox({
    issueNumber: 502,
    title: 'Task B',
    role: 'issue-solver [Cache]',
    worktree: 'experimental/solver',
    targetFiles: ['src/cache.ts'],
    acceptanceCriteria: [],
    prompt: 'Prompt B'
  }, tmpDir);

  const pulledCache = pullNextPendingTask('Cache', tmpDir);
  assert.ok(pulledCache);
  assert.strictEqual(pulledCache.issueNumber, 502);

  const pulledNum = pullNextPendingTask('501', tmpDir);
  assert.ok(pulledNum);
  assert.strictEqual(pulledNum.issueNumber, 501);
});

test('pullNextPendingTask prevents role collision across multiple solver instances with brackets', () => {
  stageTaskInInbox({
    issueNumber: 601,
    title: 'Logic Subtask',
    role: 'issue-solver [Logic]',
    worktree: 'experimental/solver',
    targetFiles: ['src/logic.ts'],
    acceptanceCriteria: [],
    prompt: 'Implement logic'
  }, tmpDir);

  stageTaskInInbox({
    issueNumber: 602,
    title: 'Çoklu Sharded Subtask',
    role: 'issue-solver [Çoklu]',
    worktree: 'experimental/solver',
    targetFiles: ['src/coklu.ts'],
    acceptanceCriteria: [],
    prompt: 'Implement coklu'
  }, tmpDir);

  const pulledCoklu = pullNextPendingTask('issue-solver [Çoklu]', tmpDir);
  assert.ok(pulledCoklu);
  assert.strictEqual(pulledCoklu.issueNumber, 602);
  assert.strictEqual(pulledCoklu.role, 'issue-solver [Çoklu]');

  const pulledLogic = pullNextPendingTask('@issue-solver [Logic]', tmpDir);
  assert.ok(pulledLogic);
  assert.strictEqual(pulledLogic.issueNumber, 601);
});

test('pullNextPendingTask and updateTaskInboxStatus operate atomically with mutex protection', () => {
  stageTaskInInbox({
    issueNumber: 701,
    title: 'Atomic Task',
    role: 'issue-solver [Atomic]',
    worktree: 'experimental/solver',
    targetFiles: ['src/atomic.ts'],
    acceptanceCriteria: [],
    prompt: 'Atomic task'
  }, tmpDir);

  const pulled = pullNextPendingTask('Atomic', tmpDir);
  assert.ok(pulled);
  assert.strictEqual(pulled.status, 'in_progress');

  const updated = updateTaskInboxStatus(701, 'done', 'issue-solver [Atomic]', tmpDir);
  assert.strictEqual(updated, true);
  const tasks = listInboxTasks('done', tmpDir);
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].issueNumber, 701);
});

test('isTaskDependenciesSatisfied waits for ALL candidates in the same batch', () => {
  const baseItem = { worktree: 'experimental/solver', targetFiles: [], acceptanceCriteria: [] };
  stageTaskInInbox({ ...baseItem, issueNumber: 801, title: 'Track A', role: 'issue-solver [A]', prompt: 'A', trackId: 'track-solver-a' }, tmpDir);
  stageTaskInInbox({ ...baseItem, issueNumber: 802, title: 'Track B', role: 'issue-solver [B]', prompt: 'B', trackId: 'track-solver-b' }, tmpDir);
  stageTaskInInbox({
    ...baseItem,
    issueNumber: 803,
    title: 'Audit Track',
    role: 'qa-hunter [Audit]',
    worktree: 'experimental/qa',
    prompt: 'Audit',
    dependsOn: ['track-solver-a', 'B'],
    phase: 2
  }, tmpDir);

  assert.strictEqual(pullNextPendingTask('qa-hunter', tmpDir), null);
  updateTaskInboxStatus(801, 'done', 'issue-solver [A]', tmpDir);
  assert.strictEqual(pullNextPendingTask('qa-hunter', tmpDir), null);
  updateTaskInboxStatus(802, 'done', 'issue-solver [B]', tmpDir);
  const unblocked = pullNextPendingTask('qa-hunter', tmpDir);
  assert.ok(unblocked);
  assert.strictEqual(unblocked.issueNumber, 803);
});

test('isTaskDependenciesSatisfied unblocks diagnostic QA role on blocked upstream failure', () => {
  const baseItem = { worktree: 'experimental/solver', targetFiles: [], acceptanceCriteria: [] };
  stageTaskInInbox({ ...baseItem, issueNumber: 901, title: 'Failing Solver', role: 'issue-solver', prompt: 'Solve' }, tmpDir);
  stageTaskInInbox({
    ...baseItem,
    issueNumber: 902,
    title: 'Diagnostic QA Triage',
    role: 'qa-hunter',
    worktree: 'experimental/qa',
    prompt: 'Diagnose defect',
    dependsOn: ['901']
  }, tmpDir);

  updateTaskInboxStatus(901, 'blocked', 'issue-solver', tmpDir);
  const unblockedQa = pullNextPendingTask('qa-hunter', tmpDir);
  assert.ok(unblockedQa);
  assert.strictEqual(unblockedQa.issueNumber, 902);
});
