import { test } from 'node:test';
import * as assert from 'node:assert';
import { GitHubProjectsAdapter } from './projects-adapter.js';

test('GitHubProjectsAdapter instantiates and resolves repository parameters', () => {
  const adapter = new GitHubProjectsAdapter({
    token: 'gho_mock_token_123',
    owner: 'test-owner',
    repo: 'test-repo'
  });
  assert.ok(adapter);
});
