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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function stageTaskInInbox(
  item: Omit<TaskInboxItem, 'id' | 'stagedAt' | 'status'>,
  baseDir = process.cwd()
): TaskInboxItem {
  const data = readTaskInbox(baseDir);
  const existingIndex = data.tasks.findIndex(t => t.issueNumber === item.issueNumber);
  const stagedItem: TaskInboxItem = {
    ...item,
    id: item.issueNumber,
    status: 'pending',
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

export function pullNextPendingTask(role?: string, baseDir = process.cwd()): TaskInboxItem | null {
  const data = readTaskInbox(baseDir);
  const task = data.tasks.find(t => {
    if (t.status !== 'pending') return false;
    if (!role || role === 'auto' || role === 'all') return true;
    return t.role.toLowerCase() === role.toLowerCase();
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
  writeTaskInbox(data, baseDir);
  return true;
}

export function listInboxTasks(statusFilter?: string, baseDir = process.cwd()): TaskInboxItem[] {
  const data = readTaskInbox(baseDir);
  if (!statusFilter || statusFilter === 'all') return data.tasks;
  return data.tasks.filter(t => t.status === statusFilter);
}
