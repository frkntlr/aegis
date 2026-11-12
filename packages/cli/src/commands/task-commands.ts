import { WorktreeManager, TeamworkMesh } from '@aegis/orchestrator';
import { showBanner } from './banner.js';
import { compilePrompt } from './prompt-command.js';
export { handleTaskVerify } from './task-verification.js';
import {
  stageTaskInInbox,
  pullNextPendingTask,
  updateTaskInboxStatus,
  listInboxTasks,
  clearInboxTasks,
  matchesTaskRole
} from './task-inbox.js';

export function normalizeRole(rawRole?: string): string {
  const r = (rawRole || 'solver').toLowerCase().trim();
  if (r.includes('qa')) return 'qa-hunter';
  if (r.includes('ui')) return 'ui-specialist';
  if (r.includes('doc')) return 'doc-architect';
  return 'issue-solver';
}

function roleToWorktree(role: string): string {
  if (role === 'qa-hunter') return 'experimental/qa';
  if (role === 'ui-specialist') return 'experimental/ui';
  if (role === 'doc-architect') return 'experimental/docs';
  return 'experimental/solver';
}

export function handleTaskList(filterStatus?: string): void {
  showBanner();
  const tasks = listInboxTasks(filterStatus);
  console.log(`📋 Aegis Task Queue & Inbox (${tasks.length} tasks):`);
  if (tasks.length === 0) {
    console.log(' • No tasks found in .aegis/task-inbox.json. Use "aegis task:inject <id>" to stage tasks.');
    return;
  }
  for (const t of tasks) {
    const icon = t.status === 'done' ? '✅' : t.status === 'in_progress' ? '🔄' : t.status === 'blocked' ? '🛑' : '⏳';
    console.log(` ${icon} #${t.issueNumber} [${t.status.toUpperCase()}] Role: @${t.role} - "${t.title}"`);
    console.log(`    Target: ${t.targetFiles.join(', ') || 'General'}`);
  }
}

export function handleTaskClaim(issueArg?: string, roleArg?: string): void {
  showBanner();
  const issueNum = parseInt(issueArg || '0', 10);
  if (!issueNum) {
    console.error('❌ Usage: aegis task:claim <issueNumber> [agentRole]');
    process.exit(1);
  }
  const wtManager = new WorktreeManager({ persistLocks: true });
  const tasks = listInboxTasks();
  const task = tasks.find(t => t.issueNumber === issueNum);
  const role = task?.role || normalizeRole(roleArg);
  const targetFiles = task ? task.targetFiles : [];

  if (targetFiles.length > 0) {
    const lockResult = wtManager.acquireFileLocks(role, targetFiles);
    if (!lockResult.success) {
      console.error(`❌ Could not claim task #${issueNum}: File lock conflict on ${lockResult.conflictingFiles.join(', ')}`);
      return;
    }
  }
  updateTaskInboxStatus(issueNum, 'in_progress', role);
  console.log(`🎯 Task #${issueNum} claimed by [${role.toUpperCase()}]! Status: IN_PROGRESS.`);
}

/** Local completion is not remote quality proof; closure uses the explicit evidence workflow. */
export async function closeGitHubIssueIfConfigured(issueNum: number, _agent?: string): Promise<void> {
  console.log(`Local task complete; GitHub issue #${issueNum} remains open until explicit proof-based closure.`);
  console.log('Use aegis tw:gh:close <full-commit-hash> "<summary>" <remote-issue-number> <proof.json>.');
}

function parseReleaseArgs(args: string[]): { issueArg: string; status: 'pending' | 'in_progress' | 'done' | 'blocked'; reasonArg?: string } {
  const statusIdx = args.findIndex(a => {
    const l = a.toLowerCase();
    return l === 'done' || l === 'blocked' || l === 'ready' || l === 'pending';
  });
  if (statusIdx >= 0) {
    const issueArg = args.slice(0, statusIdx).join(' ').trim();
    const rawStatus = args[statusIdx].toLowerCase();
    const status = (rawStatus === 'done' || rawStatus === 'blocked') ? rawStatus : 'pending';
    const reasonArg = args.slice(statusIdx + 1).join(' ').trim() || undefined;
    return { issueArg, status, reasonArg };
  }
  const issueArg = args[0];
  const status = (args[1] === 'done' || args[1] === 'blocked') ? args[1] : 'pending';
  const reasonArg = args.slice(2).join(' ').trim() || undefined;
  return { issueArg, status, reasonArg };
}

export async function handleTaskRelease(...args: string[]): Promise<void> {
  showBanner();
  if (args.length === 0 || !args[0]) {
    console.error('❌ Usage: aegis task:release <issueNumber|role|trackId> [done|blocked|ready] [reason]');
    process.exit(1);
  }
  const { issueArg, status, reasonArg } = parseReleaseArgs(args);
  const wtManager = new WorktreeManager({ persistLocks: true });
  const tasks = listInboxTasks();
  const parsedNum = parseInt(issueArg, 10);
  const hasNum = Number.isFinite(parsedNum) && parsedNum > 0;

  const rawMatched = hasNum
    ? tasks.filter(t => t.issueNumber === parsedNum)
    : tasks.filter(t => (t.trackId && t.trackId.toLowerCase() === issueArg.toLowerCase()) || matchesTaskRole(t.role, issueArg, t.issueNumber, t.trackId) || (t.title && t.title.toLowerCase().includes(issueArg.toLowerCase())));
  const matched = (!hasNum && rawMatched.some(t => t.status === 'in_progress')) ? rawMatched.filter(t => t.status === 'in_progress') : rawMatched;

  const mesh = new TeamworkMesh();
  for (const t of matched) {
    if (t.targetFiles && t.targetFiles.length > 0) wtManager.releaseFiles(t.targetFiles);
    updateTaskInboxStatus(t.issueNumber, status);
    if (status === 'done' || status === 'blocked') {
      try { mesh.postActivity(t.claimedBy || t.role, { status, activity: `Task #${t.issueNumber} marked ${status}` }); } catch { /* ignore */ }
    }
    if (status === 'done' && t.isGitHubIssue === true) await closeGitHubIssueIfConfigured(t.issueNumber, t.claimedBy || t.role);
  }

  if (matched.length === 0) wtManager.releaseFileLocks(issueArg);
  if (reasonArg) console.log(`Reason: ${reasonArg}`);
  console.log(`🔓 Task release complete for "${issueArg}". New Status: [${status.toUpperCase()}]`);
}

export function handleLockClear(): void {
  showBanner();
  const wtManager = new WorktreeManager({ persistLocks: true });
  const cleared = wtManager.clearAllLocks();
  console.log(`🔓 Cleared all ${cleared} active file lock(s) from .aegis/locks.json.`);
}

export function handleTaskClear(statusArg?: string): void {
  showBanner();
  const cleared = clearInboxTasks(statusArg);
  console.log(`🧹 Cleared ${cleared} task(s) from .aegis/task-inbox.json${statusArg ? ` (filter: ${statusArg})` : ''}.`);
}

export async function handleTaskInject(issueArg?: string, roleArg?: string, flag?: string): Promise<void> {
  const issueNum = parseInt(issueArg || '0', 10);
  const isJson = flag === '--json';
  if (!isJson) showBanner();
  if (!issueNum) {
    console.error('❌ Usage: aegis task:inject <issueNumber> [agentRole] [--json]');
    process.exit(1);
  }

  const role = normalizeRole(roleArg);
  const compiled = await compilePrompt(role.replace('-hunter', '').replace('issue-', '').replace('-specialist', '').replace('-architect', ''), issueNum);
  const wtManager = new WorktreeManager({ persistLocks: true });
  wtManager.acquireFileLocks(role, compiled.issue.targetFiles);

  const item = stageTaskInInbox({
    issueNumber: issueNum,
    title: compiled.issue.title,
    role,
    worktree: roleToWorktree(role),
    targetFiles: compiled.issue.targetFiles,
    acceptanceCriteria: compiled.issue.acceptanceCriteria,
    prompt: compiled.promptMarkdown,
    isGitHubIssue: true
  });

  if (isJson) {
    console.log(JSON.stringify(item, null, 2));
    return;
  }
  console.log(`📥 Task #${issueNum} Injected into TIP Inbox (.aegis/task-inbox.json)!`);
  console.log(` • Designated Role: @${role.toUpperCase()} in ${item.worktree}`);
  console.log(` • Target Files:    ${item.targetFiles.join(', ')} (Locked)`);
}

export function handleTaskPull(roleArg?: string): void {
  showBanner();
  const role = roleArg ? roleArg.trim() : undefined;
  const task = pullNextPendingTask(role);
  if (!task) {
    console.log(`⏳ No pending tasks waiting in inbox${role ? ` for @${role}` : ''}.`);
    return;
  }
  console.log(`🚀 Task Pulled: #${task.issueNumber} - "${task.title}"`);
  console.log(` • Assigned Role: @${task.role} (${task.worktree})`);
  console.log(` • Target Files:  ${task.targetFiles.join(', ')}`);
}

export function handleLockStatus(): void {
  showBanner();
  const wtManager = new WorktreeManager({ persistLocks: true });
  const lockedFiles = Object.fromEntries(wtManager.getLockedFiles().entries());
  console.log(`🔒 Active File Locks (${Object.keys(lockedFiles).length}):`);
  for (const [file, agent] of Object.entries(lockedFiles)) {
    console.log(` • ${file} -> Locked by @${agent}`);
  }
}

export {
  mcpTaskList,
  mcpTaskClaim,
  mcpTaskRelease,
  mcpTaskInboxPull,
  mcpLockStatus
} from './task-mcp-adapters.js';
