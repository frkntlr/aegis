import { test } from 'node:test';
import * as assert from 'node:assert';
import { GitHubTokenResolver } from './token-resolver.js';
import { GitHubLiveAdapter } from './live-adapter.js';
import { GitHubClient } from './github-client.js';

test('GitHubTokenResolver resolves direct custom tokens and env fallback', () => {
  const direct = GitHubTokenResolver.resolve('ghp_test1234567890');
  assert.strictEqual(direct.hasCredentials, true);
  assert.strictEqual(direct.token, 'ghp_test1234567890');
  assert.strictEqual(direct.source, 'env');

  // Without credentials or resolved from machine
  const resolved = GitHubTokenResolver.resolve('');
  assert.ok(typeof resolved.hasCredentials === 'boolean');
  assert.ok(['env', 'gh-cli', 'git-credential', 'none'].includes(resolved.source));
});

test('GitHubLiveAdapter parses markdown acceptance criteria and lock labels', () => {
  const adapter = new GitHubLiveAdapter({
    token: 'fake-token',
    owner: 'antigravity',
    repo: 'happy-maxwell'
  });

  const rawIssue = {
    id: 42,
    number: 42,
    title: 'Build Live GitHub Adapter',
    body: `
# Feature Description
Build network adapter for live GitHub communication.

## Acceptance Criteria
- [ ] Connect with GITHUB_TOKEN
- [x] Extract acceptance criteria from checkboxes
- [ ] Support rate limit monitoring
    `.trim(),
    labels: [
      { name: 'status:ready' },
      { name: 'lock:packages/core/github-live/src/live-adapter.ts' }
    ],
    state: 'open'
  };

  const transformed = adapter.transformRawIssue(rawIssue);
  assert.strictEqual(transformed.number, 42);
  assert.strictEqual(transformed.status, 'ready');
  assert.deepStrictEqual(transformed.targetFiles, [
    'packages/core/github-live/src/live-adapter.ts'
  ]);
  assert.strictEqual(transformed.acceptanceCriteria.length, 3);
  assert.strictEqual(transformed.acceptanceCriteria[0], 'Connect with GITHUB_TOKEN');
  assert.strictEqual(transformed.acceptanceCriteria[1], 'Extract acceptance criteria from checkboxes');
});

test('GitHubLiveAdapter executes mockable HTTP requests with rate-limit parsing', async () => {
  // Mock fetch function simulating GitHub API
  const mockFetch: typeof fetch = async (url, init) => {
    const urlStr = url.toString();
    const authHeader = (init?.headers as any)?.get?.('Authorization') || (init?.headers as any)?.Authorization;
    assert.ok(authHeader.includes('Bearer secret_token_abc'));

    if (urlStr.includes('/user')) {
      return new Response(JSON.stringify({ login: 'octocat', name: 'Mona Lisa Octocat', id: 1 }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4982',
          'x-ratelimit-reset': '1700000000'
        }
      });
    }

    if (urlStr.includes('/comments')) {
      return new Response(JSON.stringify({ id: 999, html_url: 'https://github.com/octocat/hello-world/issues/101#issuecomment-999' }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4980' }
      });
    }

    if (urlStr.includes('/pulls')) {
      return new Response(JSON.stringify({ number: 55, html_url: 'https://github.com/octocat/hello-world/pull/55' }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4979' }
      });
    }

    if (urlStr.includes('/issues/101')) {
      return new Response(JSON.stringify({
        id: 101,
        number: 101,
        title: 'Live Issue 1',
        body: '- [ ] criterion 1',
        labels: ['status:in_progress', 'lock:src/Live.ts'],
        state: 'open'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4978' }
      });
    }

    if (urlStr.includes('/issues')) {
      return new Response(JSON.stringify([
        {
          id: 101,
          number: 101,
          title: 'Live Issue 1',
          body: '- [ ] criterion 1',
          labels: ['status:ready', 'lock:src/Live.ts'],
          state: 'open'
        }
      ]), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4981',
          'x-ratelimit-reset': '1700000000'
        }
      });
    }

    return new Response('Not found', { status: 404 });
  };

  const adapter = new GitHubLiveAdapter({
    token: 'secret_token_abc',
    owner: 'octocat',
    repo: 'hello-world',
    fetchFn: mockFetch
  });

  // 1. Authenticated user test
  const userRes = await adapter.getAuthenticatedUser();
  assert.strictEqual(userRes.user.login, 'octocat');
  assert.strictEqual(userRes.rateLimit.remaining, 4982);

  // 2. List issues test
  const issuesRes = await adapter.listIssues();
  assert.strictEqual(issuesRes.issues.length, 1);
  assert.strictEqual(issuesRes.issues[0].number, 101);
  assert.strictEqual(issuesRes.issues[0].targetFiles[0], 'src/Live.ts');
  assert.strictEqual(issuesRes.rateLimit.remaining, 4981);

  // 3. Add comment test
  const commentRes = await adapter.addComment(101, 'Testing comment from Aegis');
  assert.strictEqual(commentRes.id, 999);
  assert.strictEqual(commentRes.rateLimit.remaining, 4980);

  // 4. Create Pull Request test
  const prRes = await adapter.createPullRequest({
    title: 'feat: live integration',
    head: 'feature/live',
    base: 'main',
    body: 'Automated PR by Aegis agent'
  });
  assert.strictEqual(prRes.number, 55);
  assert.strictEqual(prRes.rateLimit.remaining, 4979);

  // 5. Client sync & claimLiveIssue test
  const client = new GitHubClient({ liveAdapter: adapter });
  const syncedCount = await client.syncFromLive();
  assert.strictEqual(syncedCount, 1);

  const claimRes = await client.claimLiveIssue(101, 'alice');
  assert.strictEqual(claimRes.success, true);
  assert.strictEqual(claimRes.issue?.status, 'in_progress');
  assert.strictEqual(claimRes.issue?.assignee, 'alice');
});
