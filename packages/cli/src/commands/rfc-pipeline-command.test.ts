import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { handleRfcPipeline } from './rfc-pipeline-command.js';
import { readTaskInbox } from './task-inbox.js';

test('handleRfcPipeline decomposes RFC into issue and stages in task-inbox', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-rfc-pipeline-'));
  const previousCwd = process.cwd();
  const previousEnv = { AEGIS_TEST: process.env.AEGIS_TEST, AEGIS_WORKSPACE: process.env.AEGIS_WORKSPACE,
    AEGIS_INBOX_PATH: process.env.AEGIS_INBOX_PATH };
  t.after(() => {
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  process.env.AEGIS_TEST = '1';
  process.env.AEGIS_WORKSPACE = root;
  process.env.AEGIS_INBOX_PATH = path.join(root, '.aegis/task-inbox.json');
  process.chdir(root);
  const rfcDir = path.resolve(root, 'docs', 'rfc');
  fs.mkdirSync(rfcDir, { recursive: true });
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
});
