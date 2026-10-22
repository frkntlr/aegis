import * as path from 'node:path';
import {
  WorktreeManager,
  TaskDispatcher,
  MergePipeline,
  IdeAdapterRegistry,
  McpSkillsSyncEngine
} from '@aegis/orchestrator';
import { GitHubClient } from '@aegis/github-live';
import { LoopBreaker } from '@aegis/watchdog';
import { DashboardServer } from '@aegis/web-dashboard';
import { showBanner } from './banner.js';

function setupIdeExclusions(repoRoot: string): void {
  const registry = new IdeAdapterRegistry();
  const results = registry.setupAll(repoRoot);
  for (const r of results) {
    if (r.success) {
      const fileNames = r.configuredFiles.map(f => path.basename(f)).join(', ');
      console.log(`✅ IDE isolation rules configured for [${r.ideId}] (${fileNames}).`);
    }
  }
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

export async function handleAuto(): Promise<void> {
  showBanner();
  console.log('🤖 Running Autonomous Task Dispatcher (/auto)...');
  const ghClient = new GitHubClient({ autoConnectLive: true });
  const wtManager = new WorktreeManager({ persistLocks: true });
  const loopBreaker = new LoopBreaker();
  const dispatcher = new TaskDispatcher(wtManager, loopBreaker);

  if (ghClient.isLive()) {
    await ghClient.syncFromLive();
  } else {
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
  }

  const ready = ghClient.listReadyIssues();
  const result = dispatcher.dispatchNextTask(['alice', 'bob'], ready);

  if (result.dispatched && result.agentName && result.issue) {
    if (ghClient.isLive()) {
      await ghClient.claimLiveIssue(result.issue.number, result.agentName);
    } else {
      ghClient.claimIssue(result.issue.number, result.agentName);
    }
    console.log(`🎯 Task Claimed!`);
    console.log(` • Agent:  ${result.agentName.toUpperCase()} (in worktree: experimental/${result.agentName})`);
    console.log(` • Issue:  #${result.issue.number} - "${result.issue.title}"`);
    console.log(` • Target: ${result.issue.targetFiles.join(', ') || 'General repository'} (Locked)`);
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
