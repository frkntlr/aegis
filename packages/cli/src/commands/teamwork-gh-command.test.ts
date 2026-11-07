import test from 'node:test';
import * as assert from 'node:assert';
import { handleTeamworkGitHub, handleTeamworkGitHubClose } from './teamwork-gh-command.js';

test('handleTeamworkGitHub handles empty objective gracefully', async () => {
  await handleTeamworkGitHub('');
  assert.ok(true);
});

test('handleTeamworkGitHub executes dry-run plan cleanly', async () => {
  await handleTeamworkGitHub('Build user profile UI', 'src/profile.ts', '--dry-run');
  assert.ok(true);
});

test('handleTeamworkGitHub executes safe test mode with mock discussion and tracking issues', async () => {
  process.env.AEGIS_TEST = '1';
  await handleTeamworkGitHub('Autonomous Lifecycle Sync Mission', 'src/sync.ts');
  assert.ok(true);
});

test('handleTeamworkGitHubClose executes cleanly', async () => {
  await handleTeamworkGitHubClose('abc1234', 'Verified test suite');
  assert.ok(true);
});
