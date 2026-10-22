import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorktreeManager, TaskDispatcher, MergePipeline } from '@aegis/orchestrator';
import { GitHubClient } from '@aegis/github-live';
import { DashboardServer } from '@aegis/web-dashboard';
import { showBanner } from './banner.js';

function setupIdeExclusions(repoRoot: string): void {
  const vscodeDir = path.resolve(repoRoot, '.vscode');
  const settingsFile = path.resolve(vscodeDir, 'settings.json');
  fs.mkdirSync(vscodeDir, { recursive: true });

  let settings: Record<string, any> = {};
  if (fs.existsSync(settingsFile)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {
      settings = {};
    }
  }

  settings['files.exclude'] = {
    ...(settings['files.exclude'] || {}),
    'experimental/**': true
  };
  settings['search.exclude'] = {
    ...(settings['search.exclude'] || {}),
    'experimental/**': true
  };

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
}

export function handleInit(): void {
  showBanner();
  console.log('🚀 Initializing Aegis environment...');
  const wtManager = new WorktreeManager({ persistLocks: true });
  const alice = wtManager.ensureWorktree('alice');
  const bob = wtManager.ensureWorktree('bob');
  console.log(`✅ Worktree ready: ${alice.agentName} -> ${alice.path}`);
  console.log(`✅ Worktree ready: ${bob.agentName} -> ${bob.path}`);

  setupIdeExclusions(process.cwd());
  console.log('✅ Antigravity & IDE isolation rules configured (.vscode/settings.json).');
  console.log('✅ Constitution & Toolchain loaded.');
  console.log('🎯 Aegis initialization complete.');
}

export function handleStatus(): void {
  showBanner();
  const wtManager = new WorktreeManager({ persistLocks: true });
  const list = wtManager.listWorktrees();
  console.log(`Active Worktrees: ${list.activeCount}`);
  for (const wt of list.worktrees) {
    console.log(` - Agent [${wt.agentName}] | Branch: ${wt.branch} | Path: ${wt.path}`);
  }
  const locked = wtManager.getLockedFiles();
  console.log(`Active Locks: ${locked.size}`);
  for (const [file, agent] of locked.entries()) {
    console.log(` - [${agent}] locked: ${file}`);
  }
}

export function handleAuto(): void {
  showBanner();
  console.log('🤖 Running Autonomous Task Dispatcher (/auto)...');
  const ghClient = new GitHubClient();
  const wtManager = new WorktreeManager({ persistLocks: true });
  const dispatcher = new TaskDispatcher(wtManager);

  ghClient.registerIssue({
    id: 101,
    number: 101,
    title: 'Implement User Avatar Component',
    body: 'Create avatar with fallback initials',
    labels: ['status:ready', 'lock:src/Avatar.tsx', 'wiki:ui-components'],
    status: 'ready',
    targetFiles: ['src/Avatar.tsx'],
    acceptanceCriteria: ['Pass unit tests', 'No spagetti code']
  });

  const ready = ghClient.listReadyIssues();
  const result = dispatcher.dispatchNextTask(['alice', 'bob'], ready);

  if (result.dispatched && result.agentName && result.issue) {
    ghClient.claimIssue(result.issue.number, result.agentName);
    console.log(`🎯 Task Claimed!`);
    console.log(` • Agent:  ${result.agentName.toUpperCase()} (in worktree: experimental/${result.agentName})`);
    console.log(` • Issue:  #${result.issue.number} - "${result.issue.title}"`);
    console.log(` • Target: ${result.issue.targetFiles.join(', ')} (Locked)`);
  } else {
    console.log(`⏸️  No dispatchable tasks: ${result.reason}`);
  }
}

export async function handleMerge(agentName?: string, baseBranch = 'master'): Promise<void> {
  showBanner();
  if (!agentName || agentName === '--help' || agentName === '-h') {
    console.error('❌ Usage: aegis merge <alice|bob> [baseBranch]');
    process.exit(1);
  }

  const pipeline = new MergePipeline({ baseBranch });
  const wtManager = new WorktreeManager({ persistLocks: true });
  console.log(`🔀 Running 4-Step Atomic Merge Pipeline for Agent [${agentName}] into [${baseBranch}]...`);
  const res = await pipeline.executePipeline(agentName, ['alice', 'bob'], true);

  for (const s of res.steps) {
    const icon = s.passed ? '✅' : '❌';
    console.log(` ${icon} [Step ${s.step}: ${s.name}] ${s.message}`);
  }

  if (res.success) {
    wtManager.releaseFileLocks(agentName);
    console.log(`🎉 4-Step Merge Complete: ${agentName} merged into ${baseBranch}.`);
  } else {
    console.error(`💥 Merge pipeline aborted: ${res.error || 'Unknown error'}`);
    process.exit(1);
  }
}

export async function handleDashboard(portArg?: string): Promise<void> {
  showBanner();
  const port = parseInt(portArg || '3000', 10);
  const server = new DashboardServer({ port });
  await server.start();
  console.log(`🌐 Aegis Web Command Center running at: http://localhost:${port}`);
  console.log(`   Press Ctrl+C to terminate server.`);
}
