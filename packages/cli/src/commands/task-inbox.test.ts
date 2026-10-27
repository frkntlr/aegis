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
