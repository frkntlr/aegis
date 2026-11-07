import test from 'node:test';
import * as assert from 'node:assert';
import { TeamworkGitHubSynchronizer } from './teamwork-github-synchronizer.js';

test('TeamworkGitHubSynchronizer operates in safe test mode without live network calls', async () => {
  const sync = new TeamworkGitHubSynchronizer();
  const disc = await sync.publishOrAttachDiscussion('Test Mission Objective');
  assert.ok(disc.url);

  const track = {
    id: 'tw-test-t1',
    subagentName: 'issue-solver [Logic]',
    title: 'Implement logic',
    phase: 1,
    targetFiles: ['src/logic.ts']
  };
  const entry = await sync.createTrackingIssue(track, disc.url);
  assert.strictEqual(entry.trackId, 'tw-test-t1');
  assert.ok(entry.issueNumber > 0);
  assert.ok(entry.issueUrl);

  // syncProgress and closeIssueWithProof should execute safely
  await sync.syncProgress(entry.issueNumber, 'issue-solver', 'Refactored logic AST', ['src/logic.ts']);
  await sync.closeIssueWithProof(entry.issueNumber, 'commit123', 'All tests passing');
});
