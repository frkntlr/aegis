import test from 'node:test';
import * as assert from 'node:assert/strict';
import { GitHubLiveAdapter } from './live-adapter.js';
import { TeamworkGitHubSynchronizer, type GitHubCompletionProof } from './teamwork-github-synchronizer.js';

const track = { id: 'track-a', subagentName: 'solver', title: 'Implement A', phase: 1, targetFiles: ['src/a.ts'] };
const commit = 'a'.repeat(40);
const proof: GitHubCompletionProof = { checks: [{ command: 'npm test -- focused', outcome: 'passed', evidence: '3 focused tests passed' }] };
interface RequestRecord { url: string; method: string; body: Record<string, unknown> }
function fixture(respond: (request: RequestRecord) => unknown) {
  const requests: RequestRecord[] = [];
  const adapter = new GitHubLiveAdapter({ token: 'test-only', owner: 'owner', repo: 'repo',
    fetchFn: async (input, init) => {
      const request = { url: String(input), method: init?.method ?? 'GET', body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> };
      requests.push(request);
      return new Response(JSON.stringify(respond(request)), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const sync = new TeamworkGitHubSynchronizer(undefined, 'owner', 'repo', {
    adapter, auth: { source: 'none', hasCredentials: false }
  });
  return { sync, requests, adapter };
}

test('offline and test-disabled operations reject explicitly without fabricated identifiers', async () => {
  const sync = new TeamworkGitHubSynchronizer(undefined, undefined, undefined, {
    auth: { source: 'none', hasCredentials: false }
  });
  await assert.rejects(sync.publishOrAttachDiscussion('Mission'), /disabled|unavailable/);
  await assert.rejects(sync.createTrackingIssue(track), /disabled|unavailable/);
  await assert.rejects(sync.syncProgress(7, 'solver', 'working', []), /disabled|unavailable/);
  await assert.rejects(sync.closeIssueWithProof(7, commit, 'Done', proof), /disabled|unavailable/);
});

test('injected responses preserve real identifiers and explicit owner/repository', async () => {
  const { sync, requests } = fixture(request => {
    const query = String(request.body.query ?? '');
    if (query.startsWith('query')) return { data: { repository: { id: 'repo-id', discussionCategories: { nodes: [{ id: 'category-id', name: 'Ideas' }] } } } };
    if (query.startsWith('mutation')) return { data: { createDiscussion: { discussion: { number: 51, url: 'https://github.com/owner/repo/discussions/51' } } } };
    return { id: 100, number: 72, title: 'Track', html_url: 'https://github.com/owner/repo/issues/72', labels: [] };
  });
  const discussion = await sync.publishOrAttachDiscussion('Mission');
  assert.equal(sync.repository, 'owner/repo');
  assert.equal(discussion.number, 51);
  assert.deepEqual(requests[0].body.variables, { o: 'owner', r: 'repo' });
  const entry = await sync.createTrackingIssue(track, discussion.url);
  assert.equal(entry.issueNumber, 72);
  assert.equal(entry.issueUrl, 'https://github.com/owner/repo/issues/72');
  assert.equal(requests[2].url, 'https://api.github.com/repos/owner/repo/issues');
  assert.doesNotMatch(String(requests[2].body.body), /100%|mutation testing/);
});

test('API errors propagate from discussions, issue creation, progress and closure', async () => {
  const { sync, requests } = fixture(() => { throw new Error('Injected API outage'); });
  await assert.rejects(sync.publishOrAttachDiscussion('Mission'), /API outage/);
  await assert.rejects(sync.createTrackingIssue(track), /API outage/);
  await assert.rejects(sync.syncProgress(72, 'solver', 'working', []), /API outage/);
  await assert.rejects(sync.closeIssueWithProof(72, commit, 'Done', proof), /API outage/);
  assert.ok(requests.every(request => request.method !== 'PATCH'));
});

test('missing repository/category and missing response URLs cannot become success', async () => {
  const unavailable = fixture(() => ({ data: { repository: null } }));
  await assert.rejects(unavailable.sync.publishOrAttachDiscussion('Mission'), /unavailable/);
  assert.equal(unavailable.requests.length, 1);
  const noUrl = fixture(() => ({ id: 7, number: 72, title: 'Track', labels: [] }));
  const original = noUrl.adapter.createIssue.bind(noUrl.adapter);
  noUrl.adapter.createIssue = async (...args) => {
    const result = await original(...args);
    delete result.issue.url;
    return result;
  };
  await assert.rejects(noUrl.sync.createTrackingIssue(track), /real HTTPS URL/);
});

test('closure rejects missing proof and posts only concrete supplied checks before closing', async () => {
  const { sync, requests } = fixture(request => request.method === 'PATCH'
    ? { id: 1, number: 72, title: 'Track', state: 'closed', labels: [] }
    : { id: 44, html_url: 'https://github.com/owner/repo/issues/72#issuecomment-44' });
  await assert.rejects(sync.closeIssueWithProof(72, 'HEAD', 'Done', proof), /full commit/);
  await assert.rejects(sync.closeIssueWithProof(72, commit, 'Done', { checks: [] }), /concrete passed/);
  await assert.rejects(sync.closeIssueWithProof(72, commit, 'Done', undefined as unknown as GitHubCompletionProof), /concrete passed/);
  assert.equal(requests.length, 0);
  await sync.closeIssueWithProof(72, commit, 'Implemented A', proof);
  assert.deepEqual(requests.map(request => request.method), ['POST', 'PATCH']);
  assert.match(String(requests[0].body.body), /3 focused tests passed/);
  assert.doesNotMatch(String(requests[0].body.body), /100%|Quality Gate Verified|Verified Commit/);
  assert.equal(requests[1].body.state, 'closed');
});

test('closure mutation failure remains a failure even after its proof comment succeeds', async () => {
  const { sync, requests } = fixture(request => {
    if (request.method === 'PATCH') throw new Error('Close rejected');
    return { id: 44, html_url: 'https://github.com/owner/repo/issues/72#issuecomment-44' };
  });
  await assert.rejects(sync.closeIssueWithProof(72, commit, 'Done', proof), /Close rejected/);
  assert.equal(requests.length, 2);
});

test('successful HTTP responses without real issue/comment IDs are rejected', async () => {
  const invalidIssue = fixture(() => ({ id: 1, number: 0, title: 'Track', labels: [] }));
  await assert.rejects(invalidIssue.sync.createTrackingIssue(track), /positive GitHub issue number/);
  const invalidComment = fixture(() => ({}));
  await assert.rejects(invalidComment.sync.syncProgress(72, 'solver', 'working', []), /positive GitHub issue number/);
  await assert.rejects(invalidComment.sync.closeIssueWithProof(72, commit, 'Done', proof), /positive GitHub issue number/);
  assert.ok(invalidComment.requests.every(request => request.method !== 'PATCH'));
});

test('closure cannot succeed when returned issue remains open', async () => {
  const { sync } = fixture(request => request.method === 'PATCH'
    ? { id: 1, number: 72, title: 'Track', state: 'open', labels: [] }
    : { id: 44, html_url: 'https://github.com/owner/repo/issues/72#issuecomment-44' });
  await assert.rejects(sync.closeIssueWithProof(72, commit, 'Done', proof), /not confirmed/);
});

test('a done label on an open issue is not confirmation of remote closure', async () => {
  const { sync } = fixture(request => request.method === 'PATCH'
    ? { id: 1, number: 72, title: 'Track', state: 'open', labels: ['status:done'] }
    : { id: 44, html_url: 'https://github.com/owner/repo/issues/72#issuecomment-44' });
  await assert.rejects(sync.closeIssueWithProof(72, commit, 'Done', proof), /not confirmed/);
});
