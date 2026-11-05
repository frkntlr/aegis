/**
 * @file task-mcp-adapters.ts
 * MCP JSON-RPC adapters for Task Ingestion Protocol (TIP) and lock queries.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { WorktreeManager } from '@aegis/orchestrator';
import {
  listInboxTasks,
  updateTaskInboxStatus,
  pullNextPendingTask,
  matchesTaskRole
} from './task-inbox.js';
import { normalizeRole, closeGitHubIssueIfConfigured } from './task-commands.js';

export function mcpTaskList(args: Record<string, unknown> = {}): string {
  const status = typeof args.status === 'string' ? args.status : undefined;
  const tasks = listInboxTasks(status);
  return JSON.stringify({ count: tasks.length, tasks }, null, 2);
}

export function mcpTaskClaim(args: Record<string, unknown> = {}): string {
  const issueNum = Number(args.issueNumber || 0);
  const role = normalizeRole(typeof args.agentRole === 'string' ? args.agentRole : undefined);
  const wtManager = new WorktreeManager({ persistLocks: true });
  const tasks = listInboxTasks();
  const task = tasks.find(t => t.issueNumber === issueNum);
  if (task && task.targetFiles.length > 0) {
    const lockRes = wtManager.acquireFileLocks(role, task.targetFiles);
    if (!lockRes.success) {
      return JSON.stringify({ success: false, error: `Lock conflict on ${lockRes.conflictingFiles.join(', ')}` });
    }
  }
  updateTaskInboxStatus(issueNum, 'in_progress', role);
  return JSON.stringify({ success: true, issueNumber: issueNum, role, status: 'in_progress' }, null, 2);
}

export async function mcpTaskRelease(args: Record<string, unknown> = {}): Promise<string> {
  const issueNum = Number(args.issueNumber || 0);
  const roleQuery = typeof args.agentRole === 'string' ? args.agentRole : (typeof args.taskId === 'string' ? args.taskId : undefined);
  const status = (args.status === 'done' || args.status === 'blocked') ? args.status : 'pending';
  const wtManager = new WorktreeManager({ persistLocks: true });
  const tasks = listInboxTasks();

  const matched = issueNum > 0
    ? tasks.filter(t => t.issueNumber === issueNum)
    : (roleQuery ? tasks.filter(t => (t.trackId && t.trackId.toLowerCase() === roleQuery.toLowerCase()) || matchesTaskRole(t.role, roleQuery, t.issueNumber, t.trackId)) : []);

  for (const t of matched) {
    if (t.targetFiles && t.targetFiles.length > 0) wtManager.releaseFiles(t.targetFiles);
    if (t.role) wtManager.releaseFileLocks(t.role);
    if (t.claimedBy) wtManager.releaseFileLocks(t.claimedBy);
    updateTaskInboxStatus(t.issueNumber, status);
    if (status === 'done' && t.isGitHubIssue === true) await closeGitHubIssueIfConfigured(t.issueNumber, t.claimedBy || t.role);
  }

  if (roleQuery) wtManager.releaseFileLocks(roleQuery);
  return JSON.stringify({ success: true, count: matched.length, status }, null, 2);
}

export function mcpTaskInboxPull(args: Record<string, unknown> = {}): string {
  const role = typeof args.agentRole === 'string' ? args.agentRole.trim() : undefined;
  const task = pullNextPendingTask(role);
  if (!task) return JSON.stringify({ task: null, message: 'No pending tasks found in inbox' });
  return JSON.stringify({ task }, null, 2);
}

export function mcpLockStatus(): string {
  const wtManager = new WorktreeManager({ persistLocks: true });
  const lockedFiles = Object.fromEntries(wtManager.getLockedFiles().entries());
  return JSON.stringify({ count: Object.keys(lockedFiles).length, lockedFiles }, null, 2);
}
