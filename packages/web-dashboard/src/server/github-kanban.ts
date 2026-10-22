import { GitHubLiveAdapter, GitHubTokenResolver, RateLimitInfo } from '@aegis/github-live';
import type { SystemIssue } from './realtime-metrics.js';

export interface GitHubKanbanOptions {
  repoRoot?: string;
  offline?: boolean;
  adapter?: GitHubLiveAdapter;
}

export interface GitHubKanbanStatus {
  connected: boolean;
  owner: string;
  repo: string;
  user: string;
  issuesCount: number;
  rateRemaining?: number;
}

export class GitHubKanbanService {
  private adapter?: GitHubLiveAdapter;
  private owner: string = 'frkntlr';
  private repo: string = 'aegis';
  private user: string = 'autonomous-agent';
  private connected: boolean = false;
  private issues: SystemIssue[] = [];
  private lastRateLimit?: RateLimitInfo;

  constructor(options: GitHubKanbanOptions = {}) {
    this.initOfflineDefaults();
    if (!options.offline) {
      this.initAdapter(options.adapter);
    }
  }

  private initOfflineDefaults(): void {
    this.issues = [
      {
        id: 1,
        number: 1,
        title: 'feat(kanban): Real-time GitHub Projects & Kanban Live Synchronization',
        status: 'in_progress',
        targetFiles: ['packages/web-dashboard/src/server/github-kanban.ts'],
        labels: ['status:in_progress', 'aegis:task'],
        assignedAgent: 'alice',
        assignedIde: 'Google Antigravity'
      },
      {
        id: 2,
        number: 2,
        title: 'feat(ast): Multi-Language AST Skeleton Extraction for C/C++ and Go',
        status: 'ready',
        targetFiles: ['packages/core/ast-skeleton/src/index.ts'],
        labels: ['status:ready', 'aegis:task']
      }
    ];
  }

  private initAdapter(customAdapter?: GitHubLiveAdapter): void {
    if (customAdapter) {
      this.adapter = customAdapter;
      this.connected = true;
      return;
    }
    const auth = GitHubTokenResolver.resolve();
    if (auth.hasCredentials && auth.token) {
      this.owner = auth.owner || this.owner;
      this.repo = auth.repo || this.repo;
      this.adapter = new GitHubLiveAdapter({
        token: auth.token,
        owner: this.owner,
        repo: this.repo
      });
      this.connected = true;
      this.fetchUser();
    }
  }

  private async fetchUser(): Promise<void> {
    if (!this.adapter) return;
    try {
      const { user, rateLimit } = await this.adapter.getAuthenticatedUser();
      this.user = user.login;
      this.lastRateLimit = rateLimit;
    } catch {
      this.user = 'github-user';
    }
  }

  public async fetchLiveIssues(): Promise<SystemIssue[]> {
    if (!this.adapter || !this.connected) return [...this.issues];
    try {
      const { issues, rateLimit } = await this.adapter.listIssues(this.owner, this.repo, 'all');
      this.lastRateLimit = rateLimit;
      const mapped: SystemIssue[] = issues.map(iss => {
        const existing = this.issues.find(i => i.number === iss.number);
        return {
          id: iss.id,
          number: iss.number,
          title: iss.title,
          status: iss.status,
          targetFiles: iss.targetFiles,
          labels: iss.labels,
          assignedAgent: existing?.assignedAgent ?? (iss.status === 'in_progress' ? 'alice' : undefined),
          assignedIde: existing?.assignedIde ?? (iss.status === 'in_progress' ? 'Google Antigravity' : undefined),
          body: iss.body,
          acceptanceCriteria: iss.acceptanceCriteria,
          url: iss.url || `https://github.com/${this.owner}/${this.repo}/issues/${iss.number}`
        };
      });
      this.issues = mapped;
      return mapped;
    } catch {
      if (this.issues.length === 0) this.initOfflineDefaults();
      return [...this.issues];
    }
  }

  public async createIssue(title: string, targetFiles: string[] = []): Promise<SystemIssue> {
    const defaultBody = this.buildIssueBody(title, targetFiles);
    const labels = ['status:ready', 'aegis:task', ...targetFiles.map(f => `lock:${f}`)];

    if (this.adapter && this.connected) {
      try {
        const { issue, rateLimit } = await this.adapter.createIssue(title, defaultBody, labels);
        this.lastRateLimit = rateLimit;
        const newIssue: SystemIssue = {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          status: 'ready',
          targetFiles,
          labels,
          body: defaultBody,
          acceptanceCriteria: issue.acceptanceCriteria,
          url: issue.url || `https://github.com/${this.owner}/${this.repo}/issues/${issue.number}`
        };
        this.issues.unshift(newIssue);
        return newIssue;
      } catch {}
    }
    const nextNum = this.issues.length > 0 ? Math.max(...this.issues.map(i => i.number)) + 1 : 1;
    const localIssue: SystemIssue = {
      id: nextNum,
      number: nextNum,
      title,
      status: 'ready',
      targetFiles,
      labels,
      url: `https://github.com/${this.owner}/${this.repo}/issues/${nextNum}`
    };
    this.issues.unshift(localIssue);
    return localIssue;
  }

  private buildIssueBody(title: string, targetFiles: string[]): string {
    return [
      `### Objective`,
      title,
      '',
      `### Target Files`,
      targetFiles.map(f => `- \`${f}\``).join('\n') || '- None specified',
      '',
      `### Acceptance Criteria`,
      `- [ ] Strict compliance with Demir Kafes (max 40 lines/function, max 300 lines/file).`,
      `- [ ] All unit tests pass locally before requesting atomic merge.`,
      `- [ ] Zero token bloat: only surgical unified diffs are accepted.`
    ].join('\n');
  }

  public updateIssueStatus(num: number, targetStatus: SystemIssue['status'], agent?: string, ide?: string): SystemIssue | null {
    const issue = this.issues.find(i => i.number === num);
    if (!issue) return null;
    issue.status = targetStatus;
    issue.labels = [...issue.labels.filter(l => !l.startsWith('status:')), `status:${targetStatus}`];
    if (targetStatus === 'in_progress') {
      issue.assignedAgent = agent || 'alice';
      issue.assignedIde = ide || 'Google Antigravity';
    } else if (targetStatus === 'ready' || targetStatus === 'done') {
      issue.assignedAgent = undefined;
      issue.assignedIde = undefined;
    }
    this.dispatchGitHubStatusUpdate(num, targetStatus, issue, agent, ide);
    return issue;
  }

  private dispatchGitHubStatusUpdate(num: number, targetStatus: SystemIssue['status'], issue: SystemIssue, agent?: string, ide?: string): void {
    if (!this.adapter || !this.connected) return;
    const remainingLabels = issue.labels.filter(l => !l.startsWith('status:'));
    const newLabels = [...remainingLabels, `status:${targetStatus}`];
    const state = targetStatus === 'done' ? 'closed' : 'open';

    this.adapter.updateIssue(num, { state, labels: newLabels }).then(() => {
      if (targetStatus === 'in_progress') {
        const ag = agent || 'alice';
        const tool = ide || 'Google Antigravity';
        this.adapter?.addComment(num, `🤖 **Aegis Fleet**: Agent \`@${ag}\` (${tool}) claimed this task.\nLocks: ${issue.targetFiles.map(f => `\`${f}\``).join(', ')}`);
      } else if (targetStatus === 'done') {
        this.adapter?.addComment(num, `✅ **Aegis Fleet**: Task verified and completed. Closed automatically.`);
      } else if (targetStatus === 'blocked') {
        this.adapter?.addComment(num, `🛑 **Aegis Loop Breaker**: Task marked as blocked. Locks released.`);
      }
    }).catch(() => {});
  }

  public getIssues(): SystemIssue[] {
    return [...this.issues];
  }

  public getStatus(): GitHubKanbanStatus {
    return {
      connected: this.connected,
      owner: this.owner,
      repo: this.repo,
      user: this.user,
      issuesCount: this.issues.length,
      rateRemaining: this.lastRateLimit?.remaining
    };
  }
}
