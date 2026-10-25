import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  WorktreeManager,
  TaskDispatcher,
  MergePipeline,
  IdeAdapterRegistry,
  McpSkillsSyncEngine,
  UniversalToolchainSync
} from '@aegis/orchestrator';
import { GitHubClient } from '@aegis/github-live';
import { LoopBreaker, OrphanTaskReclaimer } from '@aegis/watchdog';
import { DashboardServer } from '@aegis/web-dashboard';
import { GodotInitWorkflow } from '@aegis/godot-bridge';
import { showBanner } from './banner.js';

function autoConfigureGodot(repoRoot: string): void {
  try {
    const res = GodotInitWorkflow.autoInstallIfGodot(repoRoot);
    if (res && res.installedAddonFiles.length > 0) {
      console.log(`🎮 Godot project detected: Automatically installed Aegis Bridge addon (${res.installedAddonFiles.length} files).`);
    } else if (res) {
      console.log('🎮 Godot project detected: Aegis Bridge verified and active.');
    }
  } catch {
    // Ignore non-fatal auto-install errors
  }
}

function setupIdeExclusions(repoRoot: string): void {
  const registry = new IdeAdapterRegistry();
  const results = registry.setupAll(repoRoot);
  const universal = new UniversalToolchainSync(process.cwd());
  universal.syncAll();
  for (const r of results) {
    if (r.success) {
      const fileNames = r.configuredFiles.map(f => path.basename(f)).join(', ');
      console.log(`✅ IDE isolation rules configured for [${r.ideId}] (${fileNames}).`);
    }
  }
  autoConfigureGodot(repoRoot);
}

export function handleInit(): void {
  showBanner();
  console.log('🚀 Initializing Aegis role-based environment...');
  const wtManager = new WorktreeManager({ persistLocks: true });
  wtManager.removeWorktree('alice');
  wtManager.removeWorktree('bob');
  const solver = wtManager.ensureWorktree('solver');
  const qa = wtManager.ensureWorktree('qa');
  const docs = wtManager.ensureWorktree('docs');
  const ui = wtManager.ensureWorktree('ui');
  console.log(`✅ Worktree ready: ${solver.agentName} -> ${solver.path}`);
  console.log(`✅ Worktree ready: ${qa.agentName} -> ${qa.path}`);
  console.log(`✅ Worktree ready: ${docs.agentName} -> ${docs.path}`);
  console.log(`✅ Worktree ready: ${ui.agentName} -> ${ui.path}`);

  setupIdeExclusions(process.cwd());
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

async function reclaimStaleTasks(ghClient: GitHubClient, wtManager: WorktreeManager): Promise<void> {
  const all = ghClient.listAllIssues().filter(i => i.status === 'in_progress');
  const locks = wtManager.getLockedFiles();
  const reclaimer = new OrphanTaskReclaimer();
  const { reclaimed } = reclaimer.scanAndReclaim(all, locks);
  if (reclaimed.length > 0) {
    console.log(`🛡️  Watchdog: ${reclaimed.length} asılı görev kurtarıldı (Ready havuzuna devredildi).`);
    for (const r of reclaimed) {
      ghClient.updateIssueStatus(r.issueNumber, 'ready');
    }
  }
}

async function syncOrLoadAutoIssues(ghClient: GitHubClient, wtManager: WorktreeManager): Promise<void> {
  if (ghClient.isLive()) {
    await ghClient.syncFromLive('all');
  } else {
    const localIssuesFile = path.resolve(process.cwd(), '.aegis', 'issues.json');
    if (fs.existsSync(localIssuesFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(localIssuesFile, 'utf8'));
        if (Array.isArray(raw)) {
          for (const item of raw) ghClient.registerIssue(item);
        }
      } catch { /* ignore */ }
    }
  }
  await reclaimStaleTasks(ghClient, wtManager);
}

function printClaimedTask(result: { agentName: string; issue: { number: number; title: string; targetFiles: string[] } }): void {
  console.log(`🎯 Task Claimed!`);
  console.log(` • Agent Role:  ${result.agentName.toUpperCase()} (in worktree: experimental/${result.agentName})`);
  console.log(` • Issue:       #${result.issue.number} - "${result.issue.title}"`);
  console.log(` • Target:      ${result.issue.targetFiles.join(', ') || 'General repository'} (Locked)`);
}

export async function handleAuto(): Promise<void> {
  showBanner();
  console.log('🤖 Running Autonomous Task Dispatcher (/auto)...');
  const ghClient = new GitHubClient({ autoConnectLive: true });
  const wtManager = new WorktreeManager({ persistLocks: true });
  const loopBreaker = new LoopBreaker();
  const dispatcher = new TaskDispatcher(wtManager, loopBreaker);

  await syncOrLoadAutoIssues(ghClient, wtManager);
  const ready = ghClient.listReadyIssues();
  const result = dispatcher.dispatchNextTask(['solver', 'qa', 'docs', 'ui'], ready);

  if (result.dispatched && result.agentName && result.issue) {
    if (ghClient.isLive()) await ghClient.claimLiveIssue(result.issue.number, result.agentName);
    else ghClient.claimIssue(result.issue.number, result.agentName);
    printClaimedTask({ agentName: result.agentName, issue: result.issue });
  } else {
    console.log(`⏸️  No dispatchable tasks: ${result.reason}`);
    const blocked = loopBreaker.getBlockedIssues();
    if (blocked.length > 0) {
      console.log(`🛑 Circuit Breaker: ${blocked.length} task(s) blocked after 3 failures (#${blocked.join(', #')}). Use 'aegis loop:reset <num>' to unblock.`);
    }
  }
}

function getPrimaryBranch(): string {
  const sFile = path.resolve(process.cwd(), '.aegis', 'settings.json');
  if (fs.existsSync(sFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(sFile, 'utf8'));
      if (s.primaryBranch) return s.primaryBranch;
    } catch { /* ignore */ }
  }
  const wt = new WorktreeManager();
  return wt.detectCurrentBranch();
}

export async function handleMerge(agentName?: string, baseBranchArg?: string): Promise<void> {
  showBanner();
  if (!agentName || agentName === '--help' || agentName === '-h') {
    console.error('❌ Usage: aegis merge <solver|qa|docs|ui> [baseBranch]');
    process.exit(1);
  }

  const baseBranch = baseBranchArg || getPrimaryBranch();
  const pipeline = new MergePipeline({ baseBranch });
  const wtManager = new WorktreeManager({ persistLocks: true });
  console.log(`🔀 Running 4-Step Atomic Merge Pipeline for Agent [${agentName}] into [${baseBranch}]...`);
  const siblings = ['solver', 'qa', 'docs', 'ui'].filter(a => a !== agentName);
  const res = await pipeline.executePipeline(agentName, siblings, true);

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
  const server = new DashboardServer({ port, persistLocks: true });
  await server.start();
  console.log(`🌐 Aegis Web Command Center running at: http://localhost:${port}`);
  console.log(`   Press Ctrl+C to terminate server.`);
}

export function handleIdeList(): void {
  showBanner();
  console.log('💻 Supported IDEs and Multi-Agent Environments:');
  const registry = new IdeAdapterRegistry();
  for (const a of registry.listAdapters()) {
    const mcp = a.capabilities.supportsMcp ? '✅ MCP' : '❌ No MCP';
    const skills = a.capabilities.supportsSkills ? '✅ Skills' : '❌ No Skills';
    const subagents = a.capabilities.supportsSubagents ? '✅ Subagents' : '❌ Single-agent';
    console.log(` • [${a.ideId}] ${a.name}`);
    console.log(`    Capabilities: ${mcp} | ${skills} | ${subagents}`);
    if (a.capabilities.mcpConfigFile) {
      console.log(`    Config:       ${a.capabilities.mcpConfigFile}`);
    }
  }
}

export function handleIdeSync(): void {
  showBanner();
  console.log('🔄 Synchronizing MCP Servers & Skills across all supported IDEs...');
  const registry = new IdeAdapterRegistry();
  const engine = new McpSkillsSyncEngine({
    notebooklm: {
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\Users\\Lenovo\\Documents\\work\\notebooklm\\notebooklm-mcp-server\\dist\\index.js', 'server']
    },
    godot: {
      command: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['C:\\Users\\Lenovo\\AppData\\Roaming\\npm\\node_modules\\godot-mcp-runtime\\dist\\index.js'],
      env: { GODOT_MCP_DISABLE_ELICITATION: 'true' }
    }
  });

  const results = engine.syncAll(registry.listAdapters(), process.cwd());
  for (const r of results) {
    if (r.supported) {
      console.log(`✅ [${r.ideId}] ${r.message}`);
    } else {
      console.log(`⚠️  [${r.ideId}] ${r.message}`);
    }
  }
}

export function handleLoopStatus(): void {
  showBanner();
  const loopBreaker = new LoopBreaker();
  const records = loopBreaker.getAllRecords();
  console.log('🛡️  Aegis Circuit Breaker (Loop Breaker) Status:');
  if (records.size === 0) {
    console.log(' • All tasks clean. Zero failure counters recorded.');
    return;
  }
  for (const [num, r] of records.entries()) {
    const status = r.blocked ? '🛑 BLOCKED (3/3 failures)' : `🟡 ${r.attempts}/3 attempts`;
    console.log(` • Issue #${num}: ${status} - Last Error: ${r.lastError || 'None'}`);
  }
}

export function handleLoopReset(issueNumArg?: string): void {
  showBanner();
  const loopBreaker = new LoopBreaker();
  const num = issueNumArg ? parseInt(issueNumArg, 10) : undefined;
  loopBreaker.reset(num);
  if (num) {
    console.log(`✅ Circuit Breaker: Reset failure count and unblocked Issue #${num}.`);
  } else {
    console.log('✅ Circuit Breaker: Reset failure count and unblocked ALL issues.');
  }
}
