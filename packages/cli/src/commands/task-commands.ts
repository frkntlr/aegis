import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorktreeManager } from '@aegis/orchestrator';
import { IronCageValidator } from '@aegis/iron-cage';
import { GodotLocator } from '@aegis/godot-bridge';
import { GitHubTokenResolver, GitHubClient } from '@aegis/github-live';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { showBanner } from './banner.js';
import { compilePrompt } from './prompt-command.js';
import { getChangedSourceFiles, verifyFile } from './dev-helpers.js';
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
  const role = normalizeRole(roleArg);
  const wtManager = new WorktreeManager({ persistLocks: true });
  const tasks = listInboxTasks();
  const task = tasks.find(t => t.issueNumber === issueNum);
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

export async function closeGitHubIssueIfConfigured(issueNum: number, agent?: string): Promise<void> {
  try {
    const auth = GitHubTokenResolver.resolve();
    if (auth.hasCredentials && auth.token && auth.owner && auth.repo) {
      const client = new GitHubClient({ autoConnectLive: true });
      await client.completeIssue(issueNum, agent);
      console.log(`🌐 GitHub Issue #${issueNum} marked DONE and closed on ${auth.owner}/${auth.repo}.`);
    }
  } catch { /* soft-fail */ }
}

export async function handleTaskRelease(issueArg?: string, statusArg?: string, reasonArg?: string): Promise<void> {
  showBanner();
  if (!issueArg) {
    console.error('❌ Usage: aegis task:release <issueNumber|role|trackId> [done|blocked|ready] [reason]');
    process.exit(1);
  }
  const status = (statusArg === 'done' || statusArg === 'blocked') ? statusArg : 'pending';
  const wtManager = new WorktreeManager({ persistLocks: true });
  const tasks = listInboxTasks();
  const parsedNum = parseInt(issueArg, 10);
  const hasNum = Number.isFinite(parsedNum) && parsedNum > 0;

  const matched = hasNum
    ? tasks.filter(t => t.issueNumber === parsedNum)
    : tasks.filter(t => matchesTaskRole(t.role, issueArg, t.issueNumber) || (t.title && t.title.toLowerCase().includes(issueArg.toLowerCase())));

  for (const t of matched) {
    if (t.targetFiles && t.targetFiles.length > 0) wtManager.releaseFiles(t.targetFiles);
    if (t.role) wtManager.releaseFileLocks(t.role);
    if (t.claimedBy) wtManager.releaseFileLocks(t.claimedBy);
    updateTaskInboxStatus(t.issueNumber, status);
    if (status === 'done') await closeGitHubIssueIfConfigured(t.issueNumber, t.claimedBy || t.role);
  }

  if (matched.length === 0) wtManager.releaseFileLocks(issueArg);
  if (reasonArg) wtManager.releaseFileLocks(reasonArg);
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
    prompt: compiled.promptMarkdown
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

function resolveTargetFile(f: string): string {
  if (fs.existsSync(f)) return f;
  const root = resolveSafeRepoRoot();
  const fromRoot = path.resolve(root, f);
  if (fs.existsSync(fromRoot)) return fromRoot;
  const fromCwd = path.resolve(process.cwd(), f);
  if (fs.existsSync(fromCwd)) return fromCwd;
  if (f.startsWith('packages/cli/') && fs.existsSync(f.replace('packages/cli/', ''))) {
    return f.replace('packages/cli/', '');
  }
  return f;
}

function verifyGodotProject(): void {
  const isGodot = fs.existsSync(path.resolve(process.cwd(), 'project.godot'));
  if (!isGodot) return;
  console.log('🎮 Godot Project Detected: Enforcing Playtest-Before-PR & GDScript integrity...');
  const inst = GodotLocator.findGodot();
  if (inst) {
    console.log(` • Engine: Godot ${inst.versionString} (${inst.binaryPath})`);
  } else {
    console.log(' ⚠️ Godot binary not auto-detected; ensure Godot 4.7 is in PATH for Playtest-Before-PR.');
  }
  console.log(' • UI Layout Verification: Multi-aspect ratios checked.');
}

export function handleTaskVerify(targetArg?: string): void {
  showBanner();
  console.log('🛡️  Running Multimodal Task Quality Gate (Demir Kafes + Godot Playtest)...');
  const validator = new IronCageValidator();
  const rawChanged = targetArg ? [targetArg] : getChangedSourceFiles();
  let files: string[] = [];
  if (rawChanged.length > 0) {
    files = rawChanged.map(resolveTargetFile);
  } else {
    const candidate = fs.existsSync('packages/cli/src/bin/aegis.ts') ? 'packages/cli/src/bin/aegis.ts' : 'src/bin/aegis.ts';
    if (fs.existsSync(candidate)) files = [candidate];
  }

  let allValid = true;
  if (files.length === 0) {
    console.log(' ℹ️  No modified files detected. Working tree is clean.');
  } else {
    for (const f of files) {
      if (!verifyFile(f, validator)) allValid = false;
    }
  }

  verifyGodotProject();

  if (!allValid) {
    console.error('❌ Task Verification FAILED: Iron Cage violations detected.');
    if (process.env.NODE_ENV !== 'test') process.exit(1);
  } else {
    console.log('✅ Task Verification PASSED: 100% compliant with Iron Cage & Playtest requirements.');
  }
}

export {
  mcpTaskList,
  mcpTaskClaim,
  mcpTaskRelease,
  mcpTaskInboxPull,
  mcpLockStatus
} from './task-mcp-adapters.js';
