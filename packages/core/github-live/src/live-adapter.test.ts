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
    body: '## Acceptance Criteria\n- [ ] Connect with GITHUB_TOKEN\n- [x] Extract acceptance criteria from checkboxes',
    labels: [{ name: 'status:ready' }, { name: 'lock:packages/core/github-live/src/live-adapter.ts' }],
    state: 'open'
  };

  const transformed = adapter.transformRawIssue(rawIssue);
  assert.strictEqual(transformed.number, 42);
  assert.strictEqual(transformed.status, 'ready');
  assert.deepStrictEqual(transformed.targetFiles, ['packages/core/github-live/src/live-adapter.ts']);
  assert.strictEqual(transformed.acceptanceCriteria.length, 2);

  const closedRaw = {
    id: 43,
    number: 43,
    title: 'Closed Task with Stale in_progress Label',
    body: '',
    labels: [{ name: 'status:in_progress' }, { name: 'status:ready' }],
    state: 'closed'
  };
  const transformedClosed = adapter.transformRawIssue(closedRaw);
  assert.strictEqual(transformedClosed.status, 'done');
  assert.strictEqual(transformedClosed.labels.includes('status:ready'), false);
  assert.strictEqual(transformedClosed.labels.includes('status:in_progress'), false);
  assert.strictEqual(transformedClosed.labels.includes('status:done'), true);
});

function createMockFetch(): typeof fetch {
  return async (url, init) => {
    const urlStr = url.toString();
    const auth = init?.headers instanceof Headers
      ? (init.headers.get('Authorization') || '')
      : ((init?.headers as Record<string, string>)?.[`Authorization`] || '');
    assert.ok(auth.includes('Bearer secret_token_abc'));

    if (urlStr.includes('/user')) {
      return new Response(JSON.stringify({ login: 'octocat', id: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4982' }
      });
    }
    if (urlStr.includes('/comments')) {
      return new Response(JSON.stringify({ id: 999 }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4980' }
      });
    }
    if (urlStr.includes('/pulls')) {
      return new Response(JSON.stringify({ number: 55 }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4979' }
      });
    }
    if (urlStr.includes('/issues/101')) {
      return new Response(JSON.stringify({
        id: 101, number: 101, title: 'Live 1', body: '', labels: ['status:in_progress'], state: 'open'
      }), { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4978' } });
    }
    if (urlStr.includes('/issues')) {
      return new Response(JSON.stringify([
        { id: 101, number: 101, title: 'Live 1', body: '', labels: ['status:ready', 'lock:src/Live.ts'], state: 'open' }
      ]), { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4981' } });
    }
    return new Response('Not found', { status: 404 });
  };
}

test('GitHubLiveAdapter executes mockable HTTP requests with rate-limit parsing', async () => {
  const adapter = new GitHubLiveAdapter({
    token: 'secret_token_abc',
    owner: 'octocat',
    repo: 'hello-world',
    fetchFn: createMockFetch()
  });

  const userRes = await adapter.getAuthenticatedUser();
  assert.strictEqual(userRes.user.login, 'octocat');
  const issuesRes = await adapter.listIssues();
  assert.strictEqual(issuesRes.issues.length, 1);
  const commentRes = await adapter.addComment(101, 'Testing comment');
  assert.strictEqual(commentRes.id, 999);
  const prRes = await adapter.createPullRequest({ title: 'feat', head: 'f', base: 'm', body: 'b' });
  assert.strictEqual(prRes.number, 55);

  const client = new GitHubClient({ liveAdapter: adapter });
  assert.strictEqual(await client.syncFromLive(), 1);
  const claimRes = await client.claimLiveIssue(101, 'alice');
  assert.strictEqual(claimRes.success, true);
});

test('GitHubLiveAdapter retries on 429 rate limit with exponential backoff', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: { 'retry-after': '0', 'x-ratelimit-remaining': '0' }
      });
    }
    return new Response(JSON.stringify({ login: 'octocat', id: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4999' }
    });
  };

  const adapter = new GitHubLiveAdapter({
    token: 'fake',
    fetchFn: mockFetch,
    maxRetries: 2,
    retryDelayMs: 10
  });

  const res = await adapter.getAuthenticatedUser();
  assert.strictEqual(res.user.login, 'octocat');
  assert.strictEqual(callCount, 2);
});

test('GitHubLiveAdapter caps retry delay avoiding overflow', async () => {
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return new Response('Rate limited', {
        status: 429,
        headers: { 'retry-after': '999999', 'x-ratelimit-remaining': '0' }
      });
    }
    return new Response(JSON.stringify({ login: 'octocat', id: 1 }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4999' }
    });
  };

  const adapter = new GitHubLiveAdapter({
    token: 'fake',
    fetchFn: mockFetch,
    maxRetries: 0
  });

  await assert.rejects(async () => adapter.getAuthenticatedUser(), /Rate limited/);
});
