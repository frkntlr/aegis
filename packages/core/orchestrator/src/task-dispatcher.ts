import { WorktreeManager } from './worktree-manager.js';
import { RoleClassifier } from './role-classifier.js';
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
  private roleClassifier: RoleClassifier;

  constructor(worktreeManager?: WorktreeManager, loopBreaker?: ILoopBreaker, roleClassifier?: RoleClassifier) {
    this.worktreeManager = worktreeManager ?? new WorktreeManager();
    this.loopBreaker = loopBreaker;
    this.roleClassifier = roleClassifier ?? new RoleClassifier();
  }

  public dispatchNextTask(
    availableAgents: string[] = ['solver', 'qa', 'docs'],
    readyIssues: GitHubIssue[]
  ): DispatchResult {
    if (availableAgents.length === 0) {
      return { dispatched: false, reason: 'No idle agents available in pool.' };
    }
    const filteredIssues = readyIssues.filter(
      i => i.status === 'ready' && !i.labels.includes('status:done') && !this.loopBreaker?.isBlocked(i.number)
    );
    if (filteredIssues.length === 0) {
      return { dispatched: false, reason: 'No ready issues found in GitHub queue.' };
    }

    const isRoleCompatible = (agent: string, role: string): boolean => {
      if (agent === role) return true;
      const specialized = ['solver', 'qa', 'docs'];
      return !specialized.includes(agent);
    };

    for (const issue of filteredIssues) {
      const inference = this.roleClassifier.classify(issue);
      const eligibleAgent = availableAgents.find(a => a === inference.role)
        ?? availableAgents.find(a => isRoleCompatible(a, inference.role));
      if (eligibleAgent) {
        const lockAttempt = this.worktreeManager.acquireFileLocks(eligibleAgent, issue.targetFiles);
        if (lockAttempt.success) {
          return { dispatched: true, agentName: eligibleAgent, issue };
        }
      }
    }

    return {
      dispatched: false,
      reason: 'No compatible idle agents or available ready issues without file conflicts.'
    };
  }

  public async handleTaskFailure(
    agentName: string,
    issueNumber: number,
    error: string,
    client?: GitHubClient,
    retainLocks = false
  ): Promise<{ blocked: boolean; reason?: string }> {
    if (!retainLocks) {
      this.worktreeManager.releaseFileLocks(agentName);
    }

    if (!this.loopBreaker) {
      return { blocked: false };
    }

    const evalResult = this.loopBreaker.recordFailure(issueNumber, error);
    if (evalResult.blocked) {
      if (retainLocks) {
        this.worktreeManager.releaseFileLocks(agentName);
      }
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
