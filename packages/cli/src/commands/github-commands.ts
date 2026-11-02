import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitHubTokenResolver, GitHubLiveAdapter, GitHubClient, type GitHubIssue } from '@aegis/github-live';
import { WorktreeManager, TaskDispatcher } from '@aegis/orchestrator';
import { stageTaskInInbox } from './task-inbox.js';
import { resolveSafeAegisDir } from '@aegis/shared';
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

function stageDispatchedIssue(agentName: string, issue: GitHubIssue): void {
  console.log(`🎯 Live Issue #${issue.number} Claimed!`);
  console.log(` • Agent: ${agentName.toUpperCase()} in experimental/${agentName}`);
  console.log(` • Locks: ${issue.targetFiles.join(', ') || 'General'}`);
  const pDir = path.join(resolveSafeAegisDir(), 'prompts');
  try { fs.mkdirSync(pDir, { recursive: true }); } catch { /* ignore */ }
  const pFile = path.resolve(pDir, `${agentName}-issue-${issue.number}.md`);
  const pContent = `# 🎯 Task: #${issue.number} ${issue.title}\n` +
    `Agent: @${agentName.toUpperCase()} | Status: IN_PROGRESS\n` +
    `Target Files: ${issue.targetFiles.join(', ') || 'General'}\n\n` +
    `## Acceptance Criteria\n` +
    issue.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n');
  fs.writeFileSync(pFile, pContent, 'utf8');
  stageTaskInInbox({
    issueNumber: issue.number,
    title: issue.title,
    role: agentName,
    worktree: `experimental/${agentName}`,
    targetFiles: issue.targetFiles,
    acceptanceCriteria: issue.acceptanceCriteria,
    prompt: pContent
  });
  console.log(` • Staged in TIP Inbox: .aegis/task-inbox.json`);
  console.log(` • Prompt: ${pFile}`);
}

function stageRemainingReadyIssues(ready: GitHubIssue[], claimedNumber?: number): void {
  for (const iss of ready) {
    if (iss.number !== claimedNumber) {
      stageTaskInInbox({
        issueNumber: iss.number,
        title: iss.title,
        role: 'issue-solver',
        worktree: 'experimental/solver',
        targetFiles: iss.targetFiles,
        acceptanceCriteria: iss.acceptanceCriteria,
        prompt: `Task #${iss.number}: ${iss.title}\n\n${iss.body}`
      });
    }
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
  const wtManager = new WorktreeManager({ persistLocks: true });
  const dispatcher = new TaskDispatcher(wtManager);

  const syncedCount = await client.syncFromLive('all');
  console.log(`📥 Downloaded ${syncedCount} issues from ${auth.owner}/${auth.repo}.`);

  const ready = client.listReadyIssues();
  console.log(`📋 Found ${ready.length} ready issue(s) with acceptance criteria.`);

  const dispatchResult = dispatcher.dispatchNextTask(['solver', 'qa', 'docs', 'ui'], ready);
  if (dispatchResult.dispatched && dispatchResult.agentName && dispatchResult.issue) {
    await client.claimLiveIssue(dispatchResult.issue.number, dispatchResult.agentName);
    stageDispatchedIssue(dispatchResult.agentName, dispatchResult.issue);
  } else {
    console.log(`⏸️  No tasks dispatched: ${dispatchResult.reason}`);
  }

  stageRemainingReadyIssues(ready, dispatchResult.issue?.number);
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
