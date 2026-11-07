import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { handleRfcPipeline } from './rfc-pipeline-command.js';
import { readTaskInbox, writeTaskInbox } from './task-inbox.js';

test('handleRfcPipeline decomposes RFC into issue and stages in task-inbox', async () => {
  process.env.AEGIS_TEST = '1';
  const root = resolveSafeRepoRoot();
  const rfcDir = path.resolve(root, 'docs', 'rfc');
  fs.mkdirSync(rfcDir, { recursive: true });
  for (const f of fs.readdirSync(rfcDir).filter(f => f.includes('test-autonomous-dynamic-pipeline'))) {
    try { fs.unlinkSync(path.join(rfcDir, f)); } catch { /* ignore */ }
  }

  const testTitle = 'Test Autonomous Dynamic Pipeline';
  const testDesc = 'Verify end-to-end discussion, issue cross-linking and TIP task staging';
  await handleRfcPipeline(testTitle, testDesc);

  const files = fs.readdirSync(rfcDir).filter(f => f.includes('test-autonomous-dynamic-pipeline'));
  assert.ok(files.length > 0, 'Expected generated RFC file');

  const rfcFile = path.join(rfcDir, files[0]);
  const content = fs.readFileSync(rfcFile, 'utf8');
  assert.ok(content.includes('Test Autonomous Dynamic Pipeline'));
  assert.ok(content.includes('Durum:') || content.includes('Status:'));
  assert.ok(content.includes('Issue:'));

  const inbox = readTaskInbox();
  assert.ok(inbox.tasks.length > 0);
  const staged = inbox.tasks.find(t => t.title.includes('Test Autonomous'));
  assert.ok(staged, 'Task should be staged in TIP inbox');
  assert.strictEqual(staged?.role, 'issue-solver');
  assert.strictEqual(staged?.isGitHubIssue, true);

  // Clean up test file and task
  try { fs.unlinkSync(rfcFile); } catch { /* ignore */ }
  inbox.tasks = inbox.tasks.filter(t => !t.title.includes('Test Autonomous'));
  writeTaskInbox(inbox);
});
