import { WorktreeManager } from './worktree-manager.js';
import type { GitHubIssue } from '@aegis/github-live';

export interface DispatchResult {
  dispatched: boolean;
  agentName?: string;
  issue?: GitHubIssue;
  reason?: string;
}

export class TaskDispatcher {
  private worktreeManager: WorktreeManager;

  constructor(worktreeManager?: WorktreeManager) {
    this.worktreeManager = worktreeManager ?? new WorktreeManager();
  }

  public dispatchNextTask(
    availableAgents: string[],
    readyIssues: GitHubIssue[]
  ): DispatchResult {
    if (availableAgents.length === 0) {
      return { dispatched: false, reason: 'No idle agents available in pool.' };
    }
    if (readyIssues.length === 0) {
      return { dispatched: false, reason: 'No ready issues found in GitHub queue.' };
    }

    for (const agent of availableAgents) {
      for (const issue of readyIssues) {
        // Attempt to acquire lock on issue's target files
        const lockAttempt = this.worktreeManager.acquireFileLocks(agent, issue.targetFiles);
        if (lockAttempt.success) {
          return {
            dispatched: true,
            agentName: agent,
            issue
          };
        }
        // If conflict exists, continue loop to look for a non-conflicting task
      }
    }

    return {
      dispatched: false,
      reason: 'All available ready issues have file conflicts with currently running tasks.'
    };
  }

  public completeTask(agentName: string): void {
    this.worktreeManager.releaseFileLocks(agentName);
  }
}
