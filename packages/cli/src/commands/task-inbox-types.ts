/**
 * @file task-inbox-types.ts
 * Shared types for Aegis Task Inbox Protocol (TIP).
 * Leaf module to avoid circular type imports between task-inbox and task-inbox-matching.
 */

export interface TaskInboxItem {
  id: number;
  issueNumber: number;
  title: string;
  role: string;
  worktree: string;
  targetFiles: string[];
  acceptanceCriteria: string[];
  prompt: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  stagedAt: string;
  claimedBy?: string;
  claimedAt?: string;
  dependsOn?: string[];
  phase?: number;
  isGitHubIssue?: boolean;
  trackId?: string;
}

export interface TaskInboxData {
  version: string;
  updatedAt: string;
  tasks: TaskInboxItem[];
}
