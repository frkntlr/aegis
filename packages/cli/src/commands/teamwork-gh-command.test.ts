import test, { before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleTeamworkGitHub, handleTeamworkGitHubClose } from './teamwork-gh-command.js';

let workspace: string;
const previousWorkspace = process.env.AEGIS_WORKSPACE;
const previousTestMode = process.env.AEGIS_TEST;
before(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-teamwork-gh-test-'));
  process.env.AEGIS_WORKSPACE = workspace;
  process.env.AEGIS_TEST = '1';
});
after(() => {
  if (previousWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
  else process.env.AEGIS_WORKSPACE = previousWorkspace;
  if (previousTestMode === undefined) delete process.env.AEGIS_TEST;
  else process.env.AEGIS_TEST = previousTestMode;
  fs.rmSync(workspace, { recursive: true, force: true });
});

test('handleTeamworkGitHub handles empty objective gracefully', async () => {
  await handleTeamworkGitHub('');
  assert.ok(true);
});

test('handleTeamworkGitHub executes dry-run plan cleanly', async () => {
  await handleTeamworkGitHub('Build user profile UI', 'src/profile.ts', '--dry-run');
  assert.ok(true);
});

test('handleTeamworkGitHub executes safe test mode with mock discussion and tracking issues', async () => {
  await handleTeamworkGitHub('Autonomous Lifecycle Sync Mission', 'src/sync.ts');
  const inbox = JSON.parse(fs.readFileSync(path.join(workspace, '.aegis/task-inbox.json'), 'utf8')) as Array<{ targetFiles: string[] }>;
  assert.ok(inbox.some(task => task.targetFiles.includes('src/sync.ts')));
});

test('handleTeamworkGitHubClose executes cleanly', async () => {
  await handleTeamworkGitHubClose('abc1234', 'Verified test suite');
  assert.ok(true);
});
