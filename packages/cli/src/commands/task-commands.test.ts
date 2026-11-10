import { test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorktreeManager } from '@aegis/orchestrator';
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
  handleTaskVerify,
  handleTaskClaim,
  handleTaskRelease
} from './task-commands.js';

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-task-test-'));
  process.env.AEGIS_WORKSPACE = testTmpDir;
  process.env.AEGIS_INBOX_PATH = path.join(testTmpDir, '.aegis/task-inbox.json');
});

afterEach(() => {
  delete process.env.AEGIS_WORKSPACE;
  delete process.env.AEGIS_INBOX_PATH;
  try {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

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

test('mcpTaskClaim and mcpTaskRelease operate cleanly', async () => {
  const claimRes = JSON.parse(mcpTaskClaim({ issueNumber: 999, agentRole: 'solver' }));
  assert.strictEqual(claimRes.success, true);
  assert.strictEqual(claimRes.issueNumber, 999);
  assert.strictEqual(claimRes.role, 'issue-solver');

  const releaseRes = JSON.parse(await mcpTaskRelease({ issueNumber: 999, status: 'done', agentRole: 'solver' }));
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

function writeParallelTasks(): WorktreeManager {
  const tasks = [101, 102].map(id => ({
    id, issueNumber: id, title: `Task ${id}`, role: 'issue-solver [Codex]',
    worktree: 'experimental/solver', targetFiles: [`src/${id}.ts`],
    acceptanceCriteria: [], prompt: '', status: 'pending', stagedAt: new Date().toISOString()
  }));
  fs.mkdirSync(path.join(testTmpDir, '.aegis'), { recursive: true });
  fs.writeFileSync(path.join(testTmpDir, '.aegis/task-inbox.json'), JSON.stringify(tasks));
  const manager = new WorktreeManager({ repoRoot: testTmpDir, persistLocks: true });
  manager.acquireFileLocks('issue-solver [Codex]', ['src/101.ts', 'src/102.ts']);
  manager.acquireFileLocks('diagnostic text', ['src/unrelated.ts']);
  return manager;
}

test('CLI claim keeps staged owner and release preserves sibling and reason-named locks', async () => {
  const manager = writeParallelTasks();
  handleTaskClaim('101', 'solver');
  const tasks = JSON.parse(mcpTaskList()).tasks;
  assert.strictEqual(tasks.find((t: { id: number }) => t.id === 101).claimedBy, 'issue-solver [Codex]');
  await handleTaskRelease('101', 'done', 'diagnostic text');
  assert.strictEqual(manager.getLockedFiles().has('src/101.ts'), false);
  assert.strictEqual(manager.getLockedFiles().get('src/102.ts'), 'issue-solver [Codex]');
  assert.strictEqual(manager.getLockedFiles().get('src/unrelated.ts'), 'diagnostic text');
});

test('MCP claim keeps staged owner and release preserves same-role sibling locks', async () => {
  const manager = writeParallelTasks();
  const claimed = JSON.parse(mcpTaskClaim({ issueNumber: 101, agentRole: 'solver' }));
  assert.strictEqual(claimed.success, true);
  assert.strictEqual(claimed.role, 'issue-solver [Codex]');
  await mcpTaskRelease({ issueNumber: 101, status: 'done', agentRole: 'solver' });
  assert.strictEqual(manager.getLockedFiles().has('src/101.ts'), false);
  assert.strictEqual(manager.getLockedFiles().get('src/102.ts'), 'issue-solver [Codex]');
});
