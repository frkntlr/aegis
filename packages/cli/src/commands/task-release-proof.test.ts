import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { GitHubClient } from '@aegis/github-live';
import { closeGitHubIssueIfConfigured } from './task-commands.js';

test('local completion cannot bypass the explicit remote proof closure workflow', async t => {
  const close = t.mock.method(GitHubClient.prototype, 'completeIssue', async () => { throw new Error('Unexpected closure'); });
  const output: string[] = [];
  t.mock.method(console, 'log', (message: string) => output.push(message));
  await closeGitHubIssueIfConfigured(42, 'worker');
  assert.equal(close.mock.callCount(), 0);
  assert.match(output.join('\n'), /remains open until explicit proof-based closure/);
  assert.match(output.join('\n'), /tw:gh:close/);
});
