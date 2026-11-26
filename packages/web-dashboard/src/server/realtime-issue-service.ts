import { debugLogIgnored } from '@aegis/shared';
import { GitHubKanbanService } from './github-kanban.js';
import { compilePromptFile } from './metrics-helpers.js';
import type { GitHubKanbanStatus, SystemIssue } from './metrics-types.js';

export interface RealtimeMetricsOptions {
  repoRoot?: string;
  githubService?: GitHubKanbanService;
  offline?: boolean;
}

export class RealtimeIssueService {
  protected repoRoot: string;
  protected githubService: GitHubKanbanService;

  constructor(options?: string | RealtimeMetricsOptions) {
    if (typeof options === 'string') {
      this.repoRoot = options;
      this.githubService = new GitHubKanbanService({ repoRoot: this.repoRoot });
    } else {
      this.repoRoot = options?.repoRoot ?? process.cwd();
      this.githubService = options?.githubService ?? new GitHubKanbanService({ repoRoot: this.repoRoot, offline: options?.offline });
    }
    this.githubService.fetchLiveIssues().catch((err: unknown) => debugLogIgnored('realtime-metrics:fetchLiveIssues', err));
  }

  public getIssues(): SystemIssue[] {
    return this.githubService.getIssues();
  }

  public async fetchLiveIssues(): Promise<SystemIssue[]> {
    return this.githubService.fetchLiveIssues();
  }

  public async createIssue(title: string, targetFiles: string[] = []): Promise<SystemIssue> {
    return this.githubService.createIssue(title, targetFiles);
  }

  public moveTask(num: number, targetStatus: SystemIssue['status'], agent?: string, ide?: string): SystemIssue | null {
    const issue = this.githubService.updateIssueStatus(num, targetStatus, agent, ide);
    if (issue && targetStatus === 'in_progress') {
      this.compilePromptFile(issue, agent || 'solver');
    }
    return issue;
  }

  public compilePromptFile(issue: SystemIssue, agentName: string): string {
    return compilePromptFile(issue, agentName, this.repoRoot);
  }

  public assignIssue(num: number, agentName: string, ideType = 'Universal IDE'): SystemIssue | null {
    return this.moveTask(num, 'in_progress', agentName, ideType);
  }

  public completeIssue(num: number): SystemIssue | null {
    return this.moveTask(num, 'done');
  }

  public releaseIssueLocks(agentName?: string): void {
    for (const issue of this.getIssues()) {
      if (issue.status === 'in_progress' && (!agentName || issue.assignedAgent === agentName)) {
        this.moveTask(issue.number, 'ready');
      }
    }
  }

  public getGitHubStatus(): GitHubKanbanStatus {
    return this.githubService.getStatus();
  }
}
