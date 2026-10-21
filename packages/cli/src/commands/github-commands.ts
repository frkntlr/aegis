import { GitHubTokenResolver, GitHubLiveAdapter, GitHubClient } from '@aegis/github-live';
import { WorktreeManager, TaskDispatcher } from '@aegis/orchestrator';
import { showBanner } from './banner.js';

export async function handleGhStatus(tokenArg?: string): Promise<void> {
  showBanner();
  console.log('🌐 Resolving GitHub Live API Connection...');
  const auth = GitHubTokenResolver.resolve(tokenArg);
  console.log(` • Token Source:    ${auth.source.toUpperCase()}`);
  console.log(` • Has Credentials: ${auth.hasCredentials ? 'YES ✅' : 'NO ❌'}`);
  if (auth.owner && auth.repo) {
    console.log(` • Bound Repo:      ${auth.owner}/${auth.repo}`);
  }

  if (!auth.hasCredentials || !auth.token) {
    console.log('\n💡 Set GITHUB_TOKEN=ghp_... or run `aegis gh:status <token>`');
    return;
  }

  try {
    const adapter = new GitHubLiveAdapter({ token: auth.token, owner: auth.owner, repo: auth.repo });
    const { user, rateLimit } = await adapter.getAuthenticatedUser();
    console.log(` • Authenticated As: @${user.login} (${user.name || 'Developer'})`);
    console.log(` • Rate Limit:      ${rateLimit.remaining} / ${rateLimit.limit} remaining`);
    console.log(` • Rate Reset:      ${rateLimit.resetDate}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ GitHub Connection Failed: ${msg}`);
  }
}

export async function handleGhSync(tokenArg?: string): Promise<void> {
  showBanner();
  console.log('🔄 Syncing live issues from GitHub...');
  const auth = GitHubTokenResolver.resolve(tokenArg);
  if (!auth.hasCredentials || !auth.token) {
    console.error('❌ Authentication failed: GITHUB_TOKEN is required to sync.');
    process.exit(1);
  }

  const adapter = new GitHubLiveAdapter({ token: auth.token, owner: auth.owner, repo: auth.repo });
  const client = new GitHubClient({ liveAdapter: adapter });
  const wtManager = new WorktreeManager();
  const dispatcher = new TaskDispatcher(wtManager);

  const syncedCount = await client.syncFromLive();
  console.log(`📥 Downloaded ${syncedCount} issues from ${auth.owner}/${auth.repo}.`);

  const ready = client.listReadyIssues();
  console.log(`📋 Found ${ready.length} ready issue(s) with acceptance criteria.`);

  const dispatchResult = dispatcher.dispatchNextTask(['alice', 'bob'], ready);
  if (dispatchResult.dispatched && dispatchResult.agentName && dispatchResult.issue) {
    await client.claimLiveIssue(dispatchResult.issue.number, dispatchResult.agentName);
    console.log(`🎯 Live Issue #${dispatchResult.issue.number} Claimed!`);
    console.log(` • Agent: ${dispatchResult.agentName.toUpperCase()} in experimental/${dispatchResult.agentName}`);
    console.log(` • Locks: ${dispatchResult.issue.targetFiles.join(', ')}`);
  } else {
    console.log(`⏸️  No tasks dispatched: ${dispatchResult.reason}`);
  }
}

export async function handleGhComment(issueNumberStr: string, commentBody: string, tokenArg?: string): Promise<void> {
  showBanner();
  const issueNum = parseInt(issueNumberStr, 10);
  if (isNaN(issueNum) || !commentBody) {
    console.error('❌ Usage: aegis gh:comment <issueNumber> "<commentBody>" [token]');
    process.exit(1);
  }

  const auth = GitHubTokenResolver.resolve(tokenArg);
  if (!auth.token) {
    console.error('❌ GITHUB_TOKEN required.');
    process.exit(1);
  }

  const adapter = new GitHubLiveAdapter({ token: auth.token, owner: auth.owner, repo: auth.repo });
  const res = await adapter.addComment(issueNum, commentBody);
  console.log(`✅ Comment posted to issue #${issueNum}! (ID: ${res.id})`);
}

export async function handleGhPr(head: string, base: string, title: string, body: string, tokenArg?: string): Promise<void> {
  showBanner();
  if (!head || !base || !title) {
    console.error('❌ Usage: aegis gh:pr <headBranch> <baseBranch> "<title>" "<body>" [token]');
    process.exit(1);
  }

  const auth = GitHubTokenResolver.resolve(tokenArg);
  if (!auth.token) {
    console.error('❌ GITHUB_TOKEN required.');
    process.exit(1);
  }

  const adapter = new GitHubLiveAdapter({ token: auth.token, owner: auth.owner, repo: auth.repo });
  const res = await adapter.createPullRequest({ head, base, title, body: body || 'Automated PR by Aegis agent' });
  console.log(`🎉 Pull Request #${res.number} created successfully!`);
  console.log(`🔗 URL: ${res.htmlUrl}`);
}
