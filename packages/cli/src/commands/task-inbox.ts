import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeMutex } from '@aegis/orchestrator';

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

export function getInboxFilePath(baseDir?: string): string {
  const root = resolveSafeRepoRoot(baseDir);
  return path.resolve(root, '.aegis', 'task-inbox.json');
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
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { version: '1.0.0', updatedAt: new Date().toISOString(), tasks: parsed as TaskInboxItem[] };
    }
    if (parsed && Array.isArray(parsed.tasks)) return parsed as TaskInboxData;
  } catch {
    // Return empty on corrupt file
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
    fs.renameSync(tmp, filePath);
  } catch {
    fs.copyFileSync(tmp, filePath);
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
}

export function isTaskDependenciesSatisfied(task: TaskInboxItem, allTasks: TaskInboxItem[]): boolean {
  if (!task.dependsOn || task.dependsOn.length === 0) return true;
  return task.dependsOn.every(dep => {
    const depLower = dep.toLowerCase();
    const candidates = allTasks.filter(other =>
      other.issueNumber !== task.issueNumber && (
        String(other.issueNumber) === dep ||
        String(other.id) === dep ||
        (other.trackId && other.trackId.toLowerCase().includes(depLower)) ||
        other.role.toLowerCase().includes(depLower) ||
        other.title.toLowerCase().includes(depLower)
      )
    );
    if (candidates.length === 0) return true;
    const sameBatch = candidates.filter(c => Math.abs(c.issueNumber - task.issueNumber) < 50);
    if (sameBatch.length > 0) return sameBatch.every(c => c.status === 'done');
    const parent = candidates.reduce((best, curr) =>
      Math.abs(curr.issueNumber - task.issueNumber) < Math.abs(best.issueNumber - task.issueNumber) ? curr : best
    );
    return parent.status === 'done';
  });
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

    if (existingIndex >= 0) {
      data.tasks[existingIndex] = stagedItem;
    } else {
      data.tasks.push(stagedItem);
    }

    writeTaskInbox(data, baseDir);
    return stagedItem;
  });
}

function hasRoleMismatch(t: string, q: string): boolean {
  if (t.includes('solver') && (q.includes('qa') || q.includes('ui') || q.includes('doc'))) return true;
  if (t.includes('qa') && (q.includes('solver') || q.includes('ui') || q.includes('doc'))) return true;
  if (t.includes('ui') && (q.includes('solver') || q.includes('qa') || q.includes('doc'))) return true;
  if (t.includes('doc') && (q.includes('solver') || q.includes('qa') || q.includes('ui'))) return true;
  return false;
}

export function matchesTaskRole(taskRole: string, roleQuery: string, issueNumber?: number, trackId?: string): boolean {
  const cleanQ = roleQuery.toLowerCase().trim().replace(/^@/, '');
  const cleanT = taskRole.toLowerCase().trim().replace(/^@/, '');
  if (trackId && trackId.toLowerCase() === cleanQ) return true;
  if (issueNumber !== undefined && (String(issueNumber) === cleanQ || `#${issueNumber}` === cleanQ)) {
    return true;
  }
  if (hasRoleMismatch(cleanT, cleanQ)) return false;
  if (cleanT === cleanQ) return true;

  const qBracket = cleanQ.match(/\[(.*?)\]/);
  const tBracket = cleanT.match(/\[(.*?)\]/);
  if (qBracket) {
    const qLabel = qBracket[1].trim();
    if (tBracket) return qLabel === tBracket[1].trim();
    return cleanT.includes(qLabel);
  }
  if (tBracket) {
    const tLabel = tBracket[1].trim();
    if (cleanQ === tLabel || cleanQ.split(/[\s\-_]+/).includes(tLabel)) return true;
  }

  if (cleanT.startsWith(cleanQ) || cleanQ.startsWith(cleanT)) {
    return true;
  }
  const isGeneric = (k: string): boolean =>
    cleanQ === k || cleanQ === `${k}-specialist` || cleanQ === `${k}-hunter` || cleanQ === `${k}-architect`;
  if ((isGeneric('solver') || cleanQ === 'issue' || cleanQ === 'issue-solver') && cleanT.includes('solver')) return true;
  if ((isGeneric('qa') || cleanQ === 'audit') && cleanT.includes('qa')) return true;
  if (isGeneric('ui') && cleanT.includes('ui')) return true;
  if ((isGeneric('doc') || cleanQ === 'wiki') && cleanT.includes('doc')) return true;
  return false;
}

export function pullNextPendingTask(role?: string, baseDir?: string): TaskInboxItem | null {
  return withInboxLock(baseDir, () => {
    const data = readTaskInbox(baseDir);
    let reconciled = false;
    for (const t of data.tasks) {
      if (t.status === 'blocked' && isTaskDependenciesSatisfied(t, data.tasks)) {
        t.status = 'pending';
        reconciled = true;
      }
    }
    if (reconciled) writeTaskInbox(data, baseDir);

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

    if (status === 'done') {
      for (const other of data.tasks) {
        if (other.status === 'blocked' && isTaskDependenciesSatisfied(other, data.tasks)) {
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
  let reconciled = false;
  for (const t of data.tasks) {
    if (t.status === 'blocked' && isTaskDependenciesSatisfied(t, data.tasks)) {
      t.status = 'pending';
      reconciled = true;
    }
  }
  if (reconciled) writeTaskInbox(data, baseDir);

  if (!statusFilter || statusFilter === 'all') return data.tasks;
  return data.tasks.filter(t => t.status === statusFilter);
}

export function clearInboxTasks(statusFilter?: string, baseDir?: string): number {
  return withInboxLock(baseDir, () => {
    const data = readTaskInbox(baseDir);
    const before = data.tasks.length;
    if (!statusFilter || statusFilter === 'all') {
      data.tasks = [];
    } else {
      data.tasks = data.tasks.filter(t => t.status !== statusFilter);
    }
    writeTaskInbox(data, baseDir);
    return before - data.tasks.length;
  });
}
