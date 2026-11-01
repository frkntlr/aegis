import * as fs from 'node:fs';
import * as path from 'node:path';

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
}

export interface TaskInboxData {
  version: string;
  updatedAt: string;
  tasks: TaskInboxItem[];
}

export function getInboxFilePath(baseDir = process.cwd()): string {
  return path.resolve(baseDir, '.aegis', 'task-inbox.json');
}

export function readTaskInbox(baseDir = process.cwd()): TaskInboxData {
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

export function writeTaskInbox(data: TaskInboxData, baseDir = process.cwd()): void {
  const filePath = getInboxFilePath(baseDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(data.tasks, null, 2), 'utf8');
}

export function isTaskDependenciesSatisfied(task: TaskInboxItem, allTasks: TaskInboxItem[]): boolean {
  if (!task.dependsOn || task.dependsOn.length === 0) return true;
  return task.dependsOn.every(dep => {
    const depLower = dep.toLowerCase();
    const parent = allTasks.find(other =>
      String(other.issueNumber) === dep ||
      String(other.id) === dep ||
      other.role.toLowerCase().includes(depLower) ||
      other.title.toLowerCase().includes(depLower)
    );
    return parent ? parent.status === 'done' : true;
  });
}

export function stageTaskInInbox(
  item: Omit<TaskInboxItem, 'id' | 'stagedAt' | 'status'>,
  baseDir = process.cwd()
): TaskInboxItem {
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
}

function matchesTaskRole(taskRole: string, roleQuery: string): boolean {
  const t = taskRole.toLowerCase().trim();
  const q = roleQuery.toLowerCase().trim();
  if (t === q || t.startsWith(q) || q.startsWith(t)) return true;
  if ((q.includes('solver') || q === 'issue') && t.includes('solver')) return true;
  if (q.includes('qa') && t.includes('qa')) return true;
  if (q.includes('ui') && t.includes('ui')) return true;
  if ((q.includes('doc') || q === 'wiki') && t.includes('doc')) return true;
  return false;
}

export function pullNextPendingTask(role?: string, baseDir = process.cwd()): TaskInboxItem | null {
  const data = readTaskInbox(baseDir);
  const task = data.tasks.find(t => {
    if (t.status !== 'pending') return false;
    if (!isTaskDependenciesSatisfied(t, data.tasks)) return false;
    if (!role || role === 'auto' || role === 'all') return true;
    return matchesTaskRole(t.role, role);
  });

  if (!task) return null;
  task.status = 'in_progress';
  task.claimedBy = role || task.role;
  task.claimedAt = new Date().toISOString();
  writeTaskInbox(data, baseDir);
  return task;
}

export function updateTaskInboxStatus(
  issueNumber: number,
  status: TaskInboxItem['status'],
  claimedBy?: string,
  baseDir = process.cwd()
): boolean {
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
}

export function listInboxTasks(statusFilter?: string, baseDir = process.cwd()): TaskInboxItem[] {
  const data = readTaskInbox(baseDir);
  if (!statusFilter || statusFilter === 'all') return data.tasks;
  return data.tasks.filter(t => t.status === statusFilter);
}
