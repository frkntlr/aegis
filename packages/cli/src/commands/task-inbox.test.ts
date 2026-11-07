import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readTaskInbox,
  stageTaskInInbox,
  pullNextPendingTask,
  updateTaskInboxStatus,
  listInboxTasks,
  getInboxFilePath
} from './task-inbox.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-task-inbox-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

test('readTaskInbox returns empty structure when file absent', () => {
  const data = readTaskInbox(tmpDir);
  assert.strictEqual(data.version, '1.0.0');
  assert.strictEqual(data.tasks.length, 0);
});

test('stageTaskInInbox writes task and pulls correctly', () => {
  const staged = stageTaskInInbox({
    issueNumber: 101,
    title: 'Fix Audio Bus Latency',
    role: 'issue-solver',
    worktree: 'experimental/solver',
    targetFiles: ['scripts/Audio.gd'],
    acceptanceCriteria: ['Zero latency', 'Pass playtest'],
    prompt: 'Implement zero latency audio stream.'
  }, tmpDir);

  assert.strictEqual(staged.id, 101);
  assert.strictEqual(staged.status, 'pending');

  const filePath = getInboxFilePath(tmpDir);
  assert.strictEqual(fs.existsSync(filePath), true);

  const pulled = pullNextPendingTask('issue-solver', tmpDir);
  assert.ok(pulled);
  assert.strictEqual(pulled.issueNumber, 101);
  assert.strictEqual(pulled.status, 'in_progress');
});

test('updateTaskInboxStatus updates status and records claimedBy', () => {
  stageTaskInInbox({
    issueNumber: 102,
    title: 'Audit UI Shaders',
    role: 'ui-specialist',
    worktree: 'experimental/ui',
    targetFiles: ['shaders/blur.gdshader'],
    acceptanceCriteria: ['Validate shader'],
    prompt: 'Audit UI shaders'
  }, tmpDir);

  const updated = updateTaskInboxStatus(102, 'done', 'ui-specialist', tmpDir);
  assert.strictEqual(updated, true);

  const tasks = listInboxTasks('done', tmpDir);
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].status, 'done');
  assert.strictEqual(tasks[0].claimedBy, 'ui-specialist');
});

test('listInboxTasks filters tasks by status correctly', () => {
  stageTaskInInbox({
    issueNumber: 103,
    title: 'Task A',
    role: 'qa-hunter',
    worktree: 'experimental/qa',
    targetFiles: [],
    acceptanceCriteria: [],
    prompt: 'QA Task'
  }, tmpDir);

  const pending = listInboxTasks('pending', tmpDir);
  assert.strictEqual(pending.length, 1);

  const done = listInboxTasks('done', tmpDir);
  assert.strictEqual(done.length, 0);

  const all = listInboxTasks('all', tmpDir);
  assert.strictEqual(all.length, 1);
});

test('readTaskInbox handles polymorphic raw array file format cleanly', () => {
  const filePath = getInboxFilePath(tmpDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify([
    { issueNumber: 201, title: 'Legacy Array Task', role: 'issue-solver', status: 'pending', targetFiles: [] }
  ]), 'utf8');

  const data = readTaskInbox(tmpDir);
  assert.strictEqual(data.tasks.length, 1);
  assert.strictEqual(data.tasks[0].issueNumber, 201);
});

test('pullNextPendingTask matches multi-instance subagent roles flexibly', () => {
  stageTaskInInbox({
    issueNumber: 301,
    title: 'AST Parser Optimization',
    role: 'issue-solver [Parser]',
    worktree: 'experimental/solver',
    targetFiles: ['src/parser.ts'],
    acceptanceCriteria: ['Optimize AST'],
    prompt: 'Implement AST optimization'
  }, tmpDir);

  const pulled = pullNextPendingTask('solver', tmpDir);
  assert.ok(pulled);
  assert.strictEqual(pulled.issueNumber, 301);
  assert.strictEqual(pulled.role, 'issue-solver [Parser]');
});

test('pullNextPendingTask blocks on unfulfilled dependencies and unblocks on completion', () => {
  stageTaskInInbox({
    issueNumber: 401,
    title: 'Core Engine Logic',
    role: 'issue-solver [Core]',
    worktree: 'experimental/solver',
    targetFiles: ['src/core.ts'],
    acceptanceCriteria: ['Write core'],
    prompt: 'Implement core'
  }, tmpDir);

  stageTaskInInbox({
    issueNumber: 402,
    title: 'Audit Core Engine',
    role: 'qa-hunter [Audit]',
    worktree: 'experimental/qa',
    targetFiles: ['src/core.ts'],
    acceptanceCriteria: ['Pass audits'],
    prompt: 'Audit core',
    dependsOn: ['Core'],
    phase: 2
  }, tmpDir);

  const blockedPull = pullNextPendingTask('qa-hunter', tmpDir);
  assert.strictEqual(blockedPull, null);

  const updateResult = updateTaskInboxStatus(401, 'done', 'issue-solver [Core]', tmpDir);
  assert.strictEqual(updateResult, true);

  const unblockedPull = pullNextPendingTask('qa-hunter', tmpDir);
  assert.ok(unblockedPull);
  assert.strictEqual(unblockedPull?.issueNumber, 402);
  assert.strictEqual(unblockedPull?.status, 'in_progress');
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
