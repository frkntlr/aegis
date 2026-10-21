import type { GitHubIssue } from './types.js';

export interface GitHubClientOptions {
  repo?: string;
  maxSelfSpawnedIssues?: number;
}

export class GitHubClient {
  private issues: Map<number, GitHubIssue> = new Map();
  private selfSpawnCounter: Map<number, number> = new Map(); // parentIssueId -> count
  private readonly maxSelfSpawned: number;

  constructor(options: GitHubClientOptions = {}) {
    this.maxSelfSpawned = options.maxSelfSpawnedIssues ?? 3;
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

  public updateIssueStatus(issueNumber: number, status: GitHubIssue['status']): boolean {
    const issue = this.issues.get(issueNumber);
    if (!issue) return false;
    issue.status = status;
    return true;
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
