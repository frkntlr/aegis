import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLogIgnored, readJsonSafe, resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeMutex } from '@aegis/orchestrator';
import { isTaskDependenciesSatisfied, matchesTaskRole, reconcileBlockedTasks } from './task-inbox-matching.js';

export { isTaskDependenciesSatisfied, matchesTaskRole } from './task-inbox-matching.js';

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

function isTestEnvironment(targetDir?: string): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.AEGIS_TEST === '1' || process.env.AEGIS_TEST_SHIELD === '1') {
    return true;
  }
  const check = (targetDir || process.cwd()).toLowerCase();
  return check.includes('tmp') || check.includes('temp') || check.includes('.test') || check.includes('-test');
}

function resolveCustomInboxPath(rawPath: string): string {
  const custom = path.resolve(rawPath.trim());
  if (custom.endsWith('.json')) return custom;
  return path.basename(custom) === '.aegis'
    ? path.join(custom, 'task-inbox.json')
    : path.join(custom, '.aegis', 'task-inbox.json');
}

export function getInboxFilePath(baseDir?: string): string {
  if (baseDir) {
    const resolved = path.resolve(baseDir);
    if (resolved.endsWith('.json')) return resolved;
    if (path.basename(resolved) === '.aegis') return path.join(resolved, 'task-inbox.json');
    if (!fs.existsSync(resolved) || isTestEnvironment(resolved)) {
      return path.join(resolved, '.aegis', 'task-inbox.json');
    }
    return path.join(resolveSafeRepoRoot(baseDir), '.aegis', 'task-inbox.json');
  }
  if (process.env.AEGIS_INBOX_PATH?.trim()) {
    return resolveCustomInboxPath(process.env.AEGIS_INBOX_PATH);
  }
  if (isTestEnvironment()) {
    const testPath = path.resolve(os.tmpdir(), `aegis-test-${process.pid}`, '.aegis', 'task-inbox.json');
    process.env.AEGIS_INBOX_PATH = testPath;
    return testPath;
  }
  return path.resolve(resolveSafeRepoRoot(), '.aegis', 'task-inbox.json');
}

export function withInboxLock<T>(baseDir: string | undefined, fn: () => T): T {
  const filePath = getInboxFilePath(baseDir);
  const unlock = WorktreeMutex.acquire(filePath);
  try {
    return fn();
  } finally {
    unlock();
  }
}

export function readTaskInbox(baseDir?: string): TaskInboxData {
  const filePath = getInboxFilePath(baseDir);
  if (!fs.existsSync(filePath)) {
    return { version: '1.0.0', updatedAt: new Date().toISOString(), tasks: [] };
  }
  try {
    const parsed = readJsonSafe<unknown>(filePath);
    if (Array.isArray(parsed)) {
      return { version: '1.0.0', updatedAt: new Date().toISOString(), tasks: parsed as TaskInboxItem[] };
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tasks?: unknown[] }).tasks)) {
      return parsed as TaskInboxData;
    }
  } catch (err: unknown) {
    debugLogIgnored('TaskInbox:readTaskInbox', err);
  }
  return { version: '1.0.0', updatedAt: new Date().toISOString(), tasks: [] };
}

export function writeTaskInbox(data: TaskInboxData, baseDir?: string): void {
  const filePath = getInboxFilePath(baseDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  data.updatedAt = new Date().toISOString();
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data.tasks, null, 2), 'utf8');
  try {
    try {
      fs.renameSync(tmp, filePath);
    } catch (renameErr: unknown) {
      debugLogIgnored('TaskInbox:renameTmp', renameErr);
      fs.copyFileSync(tmp, filePath);
    }
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    } catch (cleanupErr: unknown) {
      debugLogIgnored('TaskInbox:cleanupTmp', cleanupErr);
    }
  }
}

export function stageTaskInInbox(
  item: Omit<TaskInboxItem, 'id' | 'stagedAt' | 'status'>,
  baseDir?: string
): TaskInboxItem {
  return withInboxLock(baseDir, () => {
    const data = readTaskInbox(baseDir);
    const existingIndex = data.tasks.findIndex(t => t.issueNumber === item.issueNumber);
    const initialStatus = item.dependsOn && item.dependsOn.length > 0 ? 'blocked' : 'pending';
    const stagedItem: TaskInboxItem = {
      ...item,
      id: item.issueNumber,
      status: initialStatus,
      stagedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) data.tasks[existingIndex] = stagedItem;
    else data.tasks.push(stagedItem);

    writeTaskInbox(data, baseDir);
    return stagedItem;
  });
}

export function pullNextPendingTask(role?: string, baseDir?: string): TaskInboxItem | null {
  return withInboxLock(baseDir, () => {
    const data = readTaskInbox(baseDir);
    reconcileBlockedTasks(data, writeTaskInbox, baseDir);

    const task = data.tasks.find(t => {
      if (t.status !== 'pending') return false;
      if (!isTaskDependenciesSatisfied(t, data.tasks)) return false;
      if (!role || role === 'auto' || role === 'all') return true;
      return matchesTaskRole(t.role, role, t.issueNumber, t.trackId);
    });

    if (!task) return null;
    task.status = 'in_progress';
    task.claimedBy = role || task.role;
    task.claimedAt = new Date().toISOString();
    writeTaskInbox(data, baseDir);
    return task;
  });
}

export function updateTaskInboxStatus(
  issueNumber: number,
  status: TaskInboxItem['status'],
  claimedBy?: string,
  baseDir?: string
): boolean {
  return withInboxLock(baseDir, () => {
    const data = readTaskInbox(baseDir);
    const task = data.tasks.find(t => t.issueNumber === issueNumber);
    if (!task) return false;
    task.status = status;
    if (claimedBy) task.claimedBy = claimedBy;
    if (status === 'in_progress' && !task.claimedAt) task.claimedAt = new Date().toISOString();

    if (status === 'done' || status === 'blocked') {
      for (const other of data.tasks) {
        if (other.issueNumber !== issueNumber && other.status === 'blocked' && other.dependsOn && other.dependsOn.length > 0 && isTaskDependenciesSatisfied(other, data.tasks)) {
          other.status = 'pending';
        }
      }
    }

    writeTaskInbox(data, baseDir);
    return true;
  });
}

export function listInboxTasks(statusFilter?: string, baseDir?: string): TaskInboxItem[] {
  const data = readTaskInbox(baseDir);
  reconcileBlockedTasks(data, writeTaskInbox, baseDir);

  if (!statusFilter || statusFilter === 'all') return data.tasks;
  return data.tasks.filter(t => t.status === statusFilter);
}

export function clearInboxTasks(statusFilter?: string, baseDir?: string): number {
  return withInboxLock(baseDir, () => {
    const data = readTaskInbox(baseDir);
    const before = data.tasks.length;
    data.tasks = (!statusFilter || statusFilter === 'all') ? [] : data.tasks.filter(t => t.status !== statusFilter);
    writeTaskInbox(data, baseDir);
    return before - data.tasks.length;
  });
}
