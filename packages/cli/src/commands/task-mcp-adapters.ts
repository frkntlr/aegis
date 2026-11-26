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
import { normalizeRole, closeGitHubIssueIfConfigured } from './task-role-helpers.js';

export function mcpTaskList(args: Record<string, unknown> = {}): string {
  const status = typeof args.status === 'string' ? args.status : undefined;
  const tasks = listInboxTasks(status);
  return JSON.stringify({ count: tasks.length, tasks }, null, 2);
}

export function mcpTaskClaim(args: Record<string, unknown> = {}): string {
  const issueNum = Number(args.issueNumber || 0);
  const wtManager = new WorktreeManager({ persistLocks: true });
  const tasks = listInboxTasks();
  const task = tasks.find(t => t.issueNumber === issueNum);
  const role = task?.role || normalizeRole(typeof args.agentRole === 'string' ? args.agentRole : undefined);
  if (task && task.targetFiles.length > 0) {
    const lockRes = wtManager.acquireFileLocks(role, task.targetFiles);
    if (!lockRes.success) {
      return JSON.stringify({ success: false, error: `Lock conflict on ${lockRes.conflictingFiles.join(', ')}` });
    }
  }
  updateTaskInboxStatus(issueNum, 'in_progress', role);
  return JSON.stringify({ success: true, issueNumber: issueNum, role, status: 'in_progress' }, null, 2);
}

type InboxTaskItem = ReturnType<typeof listInboxTasks>[number];

function resolveRoleQuery(args: Record<string, unknown>): string | undefined {
  if (typeof args.agentRole === 'string') return args.agentRole;
  return typeof args.taskId === 'string' ? args.taskId : undefined;
}

function findTasksForRelease(tasks: InboxTaskItem[], issueNum: number, roleQuery?: string): InboxTaskItem[] {
  if (issueNum > 0) {
    return tasks.filter(t => t.issueNumber === issueNum);
  }
  if (!roleQuery) return [];
  const lower = roleQuery.toLowerCase();
  return tasks.filter(t => t.trackId?.toLowerCase() === lower || matchesTaskRole(t.role, roleQuery, t.issueNumber, t.trackId));
}

async function releaseMatchedTask(
  wtManager: WorktreeManager,
  task: InboxTaskItem,
  status: 'done' | 'blocked' | 'pending'
): Promise<void> {
  if (task.targetFiles.length > 0) wtManager.releaseFiles(task.targetFiles);
  updateTaskInboxStatus(task.issueNumber, status);
  if (status === 'done' && task.isGitHubIssue === true) {
    await closeGitHubIssueIfConfigured(task.issueNumber, task.claimedBy || task.role);
  }
}

export async function mcpTaskRelease(args: Record<string, unknown> = {}): Promise<string> {
  const issueNum = Number(args.issueNumber || 0);
  const roleQuery = resolveRoleQuery(args);
  const status = (args.status === 'done' || args.status === 'blocked') ? args.status : 'pending';
  const wtManager = new WorktreeManager({ persistLocks: true });
  const matched = findTasksForRelease(listInboxTasks(), issueNum, roleQuery);

  for (const t of matched) {
    await releaseMatchedTask(wtManager, t, status);
  }
  if (matched.length === 0 && roleQuery) wtManager.releaseFileLocks(roleQuery);
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
