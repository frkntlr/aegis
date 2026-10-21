export interface AgentWorktree {
  agentName: string;
  branch: string;
  path: string;
  status: 'idle' | 'running' | 'blocked' | 'review' | 'merged';
  currentIssueId?: number;
  lockedFiles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorktreeListResult {
  worktrees: AgentWorktree[];
  activeCount: number;
}
