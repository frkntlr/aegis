import { WorktreeManager } from './worktree-manager.js';
import type { GitHubIssue, GitHubClient } from '@aegis/github-live';

export interface ILoopBreaker {
  isBlocked(issueNumber: number): boolean;
  recordFailure(issueNumber: number, errorMessage: string): {
    blocked: boolean;
    attempts: number;
    maxFailures: number;
    reason?: string;
  };
}

export interface DispatchResult {
  dispatched: boolean;
  agentName?: string;
  issue?: GitHubIssue;
  reason?: string;
}

export class TaskDispatcher {
  private worktreeManager: WorktreeManager;
  private loopBreaker?: ILoopBreaker;

  constructor(worktreeManager?: WorktreeManager, loopBreaker?: ILoopBreaker) {
    this.worktreeManager = worktreeManager ?? new WorktreeManager();
    this.loopBreaker = loopBreaker;
  }

  public dispatchNextTask(
    availableAgents: string[],
    readyIssues: GitHubIssue[]
  ): DispatchResult {
    if (availableAgents.length === 0) {
      return { dispatched: false, reason: 'No idle agents available in pool.' };
    }
    const filteredIssues = readyIssues.filter(
      i => i.status !== 'blocked' && !this.loopBreaker?.isBlocked(i.number)
    );
    if (filteredIssues.length === 0) {
      return { dispatched: false, reason: 'No ready issues found in GitHub queue.' };
    }

    for (const agent of availableAgents) {
      for (const issue of filteredIssues) {
        const lockAttempt = this.worktreeManager.acquireFileLocks(agent, issue.targetFiles);
        if (lockAttempt.success) {
          return { dispatched: true, agentName: agent, issue };
        }
      }
    }

    return {
      dispatched: false,
      reason: 'All available ready issues have file conflicts with currently running tasks.'
    };
  }

  public async handleTaskFailure(
    agentName: string,
    issueNumber: number,
    error: string,
    client?: GitHubClient
  ): Promise<{ blocked: boolean; reason?: string }> {
    if (!this.loopBreaker) {
      this.worktreeManager.releaseFileLocks(agentName);
      return { blocked: false };
    }

    const evalResult = this.loopBreaker.recordFailure(issueNumber, error);
    if (evalResult.blocked) {
      this.worktreeManager.releaseFileLocks(agentName);
      if (client) {
        await client.blockIssue(issueNumber, evalResult.reason ?? 'Threshold reached');
      }
      return { blocked: true, reason: evalResult.reason };
    }

    return { blocked: false };
  }

  public completeTask(agentName: string): void {
    this.worktreeManager.releaseFileLocks(agentName);
  }
}
