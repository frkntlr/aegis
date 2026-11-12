/** GitHub lifecycle synchronization. Success requires a real adapter response. */
import { GitHubLiveAdapter } from './live-adapter.js';
import { GitHubTokenResolver, type GitHubAuthContext } from './token-resolver.js';

export interface GitHubTrackingEntry {
  trackId: string;
  issueNumber: number;
  issueUrl: string;
  discussionUrl?: string;
  status: 'open' | 'closed';
}
export interface GitHubCompletionProof {
  checks: Array<{ command: string; outcome: 'passed'; evidence: string }>;
}
export interface GitHubSynchronizerDependencies {
  adapter?: Pick<GitHubLiveAdapter, 'graphqlQuery' | 'createIssue' | 'addComment' | 'updateIssue'>;
  auth?: GitHubAuthContext;
}
function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.AEGIS_TEST) ||
    Boolean(process.env.VITEST) || Boolean(process.env.NODE_TEST_CONTEXT);
}
function requireIssueNumber(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('A real positive GitHub issue number is required');
}
export class TeamworkGitHubSynchronizer {
  private adapter?: GitHubSynchronizerDependencies['adapter'];
  private owner?: string;
  private repo?: string;
  private unavailableReason: string;

  constructor(token?: string, owner?: string, repo?: string, dependencies: GitHubSynchronizerDependencies = {}) {
    const auth = dependencies.auth ?? GitHubTokenResolver.resolve(token);
    this.owner = owner ?? auth.owner;
    this.repo = repo ?? auth.repo;
    const configured = Boolean(auth.hasCredentials && auth.token && this.owner && this.repo);
    this.unavailableReason = isTestEnv() ? 'Live GitHub operations are disabled in test mode; inject a test adapter'
      : 'GitHub unavailable: configure credentials and repository owner/name';
    if (dependencies.adapter) this.adapter = dependencies.adapter;
    else if (!isTestEnv() && configured && auth.token) {
      this.adapter = new GitHubLiveAdapter({ token: auth.token, owner: this.owner, repo: this.repo });
    }
  }
  private requireAdapter(): NonNullable<GitHubSynchronizerDependencies['adapter']> {
    if (!this.adapter || !this.owner || !this.repo) throw new Error(this.unavailableReason);
    return this.adapter;
  }
  public get repository(): string | undefined {
    return this.owner && this.repo ? `${this.owner}/${this.repo}` : undefined;
  }
  private requireUrl(value: string | undefined, operation: string): string {
    if (!value || !/^https:\/\//.test(value)) throw new Error(`GitHub ${operation} response did not contain a real HTTPS URL`);
    return value;
  }
  public async publishOrAttachDiscussion(objective: string): Promise<{ url: string; number?: number }> {
    const adapter = this.requireAdapter();
    if (!objective.trim()) throw new Error('Discussion objective is required');
    const query = 'query($o: String!, $r: String!) { repository(owner: $o, name: $r) { id discussionCategories(first: 10) { nodes { id name } } } }';
    const data = await adapter.graphqlQuery<{ repository?: { id: string; discussionCategories?: { nodes: Array<{ id: string; name: string }> } } }>(query, { o: this.owner, r: this.repo });
    const repository = data.repository;
    const categories = repository?.discussionCategories?.nodes ?? [];
    const category = categories.find(item => item.name.toLowerCase() === 'ideas') ?? categories[0];
    if (!repository?.id || !category) throw new Error('GitHub discussions unavailable: repository or discussion category was not returned');
    const mutation = 'mutation($repo: ID!, $cat: ID!, $t: String!, $b: String!) { createDiscussion(input: { repositoryId: $repo, categoryId: $cat, title: $t, body: $b }) { discussion { url number } } }';
    const result = await adapter.graphqlQuery<{ createDiscussion?: { discussion?: { url: string; number?: number } } }>(mutation, {
      repo: repository.id, cat: category.id, t: `Mission: ${objective}`,
      b: `### Aegis Teamwork Mission: ${objective}\nMulti-agent orchestration; progress and verification are reported separately.`
    });
    const discussion = result.createDiscussion?.discussion;
    const url = this.requireUrl(discussion?.url, 'discussion creation');
    if (discussion?.number !== undefined) requireIssueNumber(discussion.number);
    return { url, number: discussion?.number };
  }
  public async createTrackingIssue(
    track: { id: string; subagentName: string; title: string; phase: number; targetFiles: string[] },
    discussionUrl?: string
  ): Promise<GitHubTrackingEntry> {
    const adapter = this.requireAdapter();
    const title = `[Teamwork Phase ${track.phase}] ${track.subagentName}: ${track.title}`;
    const body = [
      `### Subagent Track: ${track.subagentName}`, `- **Phase**: ${track.phase}`,
      `- **Target Files**: ${track.targetFiles.join(', ') || 'Read-only analysis; no writable files assigned'}`,
      discussionUrl ? `- **Parent Discussion**: ${discussionUrl}` : '', '', '### Acceptance Criteria',
      '- [ ] Complete assigned work within its file scope',
      '- [ ] Record commands, outcomes and evidence for applicable quality checks',
      '- [ ] Report changes, limitations and verification results to the coordinator'
    ].filter(Boolean).join('\n');
    const result = await adapter.createIssue(title, body, ['status:ready', 'teamwork:active']);
    requireIssueNumber(result.issue.number);
    return { trackId: track.id, issueNumber: result.issue.number,
      issueUrl: this.requireUrl(result.issue.url, 'issue creation'), discussionUrl, status: 'open' };
  }
  public async syncProgress(issueNumber: number, agentName: string, activity: string, files: string[]): Promise<void> {
    requireIssueNumber(issueNumber);
    const adapter = this.requireAdapter();
    const body = `**[${agentName}] Progress Update:**\n- **Activity**: ${activity}\n- **Files Touched**: ${files.join(', ') || 'None'}\n- **Timestamp**: ${new Date().toISOString()}`;
    const comment = await adapter.addComment(issueNumber, body);
    requireIssueNumber(comment.id);
    this.requireUrl(comment.url, 'progress comment');
  }
  public async closeIssueWithProof(issueNumber: number, commitHash: string, summary: string, proof: GitHubCompletionProof): Promise<void> {
    requireIssueNumber(issueNumber);
    if (!/^[a-f0-9]{40}$/i.test(commitHash) || !summary?.trim()) throw new Error('Closure requires a full commit hash and a nonempty summary');
    if (!Array.isArray(proof?.checks) || !proof.checks.length || proof.checks.some(check =>
      check.outcome !== 'passed' || !check.command?.trim() || !check.evidence?.trim())) {
      throw new Error('Closure requires concrete passed check commands and evidence');
    }
    const adapter = this.requireAdapter();
    const checks = proof.checks.map(check => `- Command: \`${check.command}\`\n  Reported outcome: ${check.outcome}\n  Evidence: ${check.evidence}`);
    const body = [`### Task completion evidence reported by the coordinator`, `- Commit: \`${commitHash}\``,
      `- Summary: ${summary}`, ...checks,
      'Only the checks listed above are reported; no unperformed checks or blanket compliance are asserted.'
    ].join('\n');
    const comment = await adapter.addComment(issueNumber, body);
    requireIssueNumber(comment.id);
    this.requireUrl(comment.url, 'completion comment');
    const closed = await adapter.updateIssue(issueNumber, { state: 'closed' });
    if (closed.issue.number !== issueNumber || closed.state !== 'closed') {
      throw new Error('GitHub issue closure was not confirmed by the response');
    }
  }
}
