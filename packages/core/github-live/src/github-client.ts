import type { GitHubIssue } from './types.js';
import { GitHubLiveAdapter } from './live-adapter.js';
import { GitHubTokenResolver } from './token-resolver.js';

export interface GitHubClientOptions {
  repo?: string;
  maxSelfSpawnedIssues?: number;
  liveAdapter?: GitHubLiveAdapter;
  autoConnectLive?: boolean;
}

export class GitHubClient {
  private issues: Map<number, GitHubIssue> = new Map();
  private selfSpawnCounter: Map<number, number> = new Map(); // parentIssueId -> count
  private readonly maxSelfSpawned: number;
  private liveAdapter?: GitHubLiveAdapter;

  constructor(options: GitHubClientOptions = {}) {
    this.maxSelfSpawned = options.maxSelfSpawnedIssues ?? 3;
    if (options.liveAdapter) {
      this.liveAdapter = options.liveAdapter;
    } else if (options.autoConnectLive) {
      const auth = GitHubTokenResolver.resolve();
      if (auth.hasCredentials && auth.token) {
        this.liveAdapter = new GitHubLiveAdapter({
          token: auth.token,
          owner: auth.owner,
          repo: auth.repo
        });
      }
    }
  }

  public isLive(): boolean {
    return !!this.liveAdapter;
  }

  public setLiveAdapter(adapter: GitHubLiveAdapter): void {
    this.liveAdapter = adapter;
  }

  public getLiveAdapter(): GitHubLiveAdapter | undefined {
    return this.liveAdapter;
  }

  public async syncFromLive(): Promise<number> {
    if (!this.liveAdapter) return 0;
    const { issues } = await this.liveAdapter.listIssues();
    let count = 0;
    for (const issue of issues) {
      this.registerIssue(issue);
      count++;
    }
    return count;
  }

  public registerIssue(issue: GitHubIssue): void {
    this.issues.set(issue.number, issue);
  }

  public listReadyIssues(): GitHubIssue[] {
    return Array.from(this.issues.values()).filter(i => i.status === 'ready');
  }

  public getIssue(issueNumber: number): GitHubIssue | undefined {
    return this.issues.get(issueNumber);
  }

  public async fetchIssue(issueNumber: number): Promise<GitHubIssue | undefined> {
    const existing = this.issues.get(issueNumber);
    if (existing) return existing;
    if (!this.liveAdapter) return undefined;
    try {
      const { issues } = await this.liveAdapter.listIssues(undefined, undefined, 'all');
      for (const i of issues) this.registerIssue(i);
      return this.issues.get(issueNumber);
    } catch {
      return undefined;
    }
  }

  public claimIssue(issueNumber: number, agentName: string): { success: boolean; issue?: GitHubIssue; error?: string } {
    const issue = this.issues.get(issueNumber);
    if (!issue) {
      return { success: false, error: `Issue #${issueNumber} not found.` };
    }
    if (issue.status !== 'ready') {
      return { success: false, error: `Issue #${issueNumber} is not in ready state (current: ${issue.status}).` };
    }

    issue.status = 'in_progress';
    issue.assignee = agentName;
    return { success: true, issue };
  }

  public async claimLiveIssue(issueNumber: number, agentName: string): Promise<{ success: boolean; issue?: GitHubIssue; error?: string }> {
    const claimRes = this.claimIssue(issueNumber, agentName);
    if (!claimRes.success || !claimRes.issue || !this.liveAdapter) {
      return claimRes;
    }

    try {
      const remainingLabels = claimRes.issue.labels.filter(l => !l.startsWith('status:'));
      await this.liveAdapter.updateIssue(issueNumber, {
        labels: [...remainingLabels, 'status:in_progress']
      });
      const lockNotice = claimRes.issue.targetFiles.map(f => `\`${f}\``).join(', ');
      await this.liveAdapter.addComment(
        issueNumber,
        `🤖 **Aegis Fleet**: Agent \`@${agentName}\` claimed this task in \`experimental/${agentName}\`.\nLocks acquired: ${lockNotice}`
      );
    } catch {
      // Soft-fail: retain local claim even if network request fails
    }
    return claimRes;
  }

  public updateIssueStatus(issueNumber: number, status: GitHubIssue['status']): boolean {
    const issue = this.issues.get(issueNumber);
    if (!issue) return false;
    issue.status = status;
    return true;
  }

  public async blockIssue(
    issueNumber: number,
    reason: string
  ): Promise<{ success: boolean; issue?: GitHubIssue; error?: string }> {
    const issue = this.issues.get(issueNumber);
    if (!issue) {
      return { success: false, error: `Issue #${issueNumber} not found.` };
    }

    issue.status = 'blocked';
    issue.labels = issue.labels.filter(l => !l.startsWith('status:'));
    issue.labels.push('status:blocked');

    if (this.liveAdapter) {
      try {
        await this.liveAdapter.updateIssue(issueNumber, { labels: issue.labels });
        await this.liveAdapter.addComment(
          issueNumber,
          `🛑 **Aegis Loop Breaker**: Task halted after repeated failures.\n**Reason**: ${reason}\nLocks released.`
        );
      } catch {
        // Soft-fail: retain local blocked state
      }
    }

    return { success: true, issue };
  }

  public spawnSubIssue(parentIssueNumber: number, title: string, body: string, targetFiles: string[]): { success: boolean; createdIssue?: GitHubIssue; error?: string } {
    const currentSpawns = this.selfSpawnCounter.get(parentIssueNumber) ?? 0;
    if (currentSpawns >= this.maxSelfSpawned) {
      return {
        success: false,
        error: `Self-spawning limit reached (${this.maxSelfSpawned} max sub-issues per task). Blocked to prevent runaway task recursion.`
      };
    }

    const nextNumber = this.issues.size + 1;
    const subIssue: GitHubIssue = {
      id: nextNumber,
      number: nextNumber,
      title: `[Subtask of #${parentIssueNumber}] ${title}`,
      body,
      labels: ['status:ready', ...targetFiles.map(f => `lock:${f}`)],
      status: 'ready',
      targetFiles,
      acceptanceCriteria: ['Pass unit tests', 'Comply with Iron Cage']
    };

    this.issues.set(nextNumber, subIssue);
    this.selfSpawnCounter.set(parentIssueNumber, currentSpawns + 1);

    return { success: true, createdIssue: subIssue };
  }
}
