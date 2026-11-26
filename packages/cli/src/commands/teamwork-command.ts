/**
 * @file teamwork-command.ts
 * CLI and MCP command handlers for Aegis / Antigravity subagent teamwork.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { showBanner } from './banner.js';
import { clearInboxTasks } from './task-inbox.js';
import { saveTeamworkPlan } from './teamwork-plan-store.js';
import { printCodexHandoff } from './teamwork-codex-handoff.js';
import { handleCodexOrchestra } from './codex-orchestra-command.js';
import {
  handleTeamworkMesh, handleTeamworkPeers, handleTeamworkPost, handleTeamworkBroadcast,
  handleTeamworkWaves, handleTeamworkConflicts, handleTeamworkScale, handleTeamworkBatch,
  handleTeamworkDoc, handleTeamworkAdvance, handleTeamworkTools, handleTeamworkReflect, handleTeamworkIterate
} from './teamwork-mesh-command.js';

export { handleTeamworkTools };
import { TeamworkCoordinator, type TeamworkPlan } from '@aegis/orchestrator';
import {
  parsePlanArgs,
  printPlanSummary,
  mcpTeamworkStatus,
  mcpTeamworkDag,
  mcpTeamworkCompact,
  mcpTeamworkAnalyze
} from './teamwork-plan-helpers.js';

export { mcpTeamworkStatus, mcpTeamworkDag, mcpTeamworkCompact, mcpTeamworkAnalyze };

export function handleTeamworkStatus(flag?: string): void {
  const isJson = flag === '--json' || flag === '-j';
  const coordinator = new TeamworkCoordinator();
  const status = coordinator.getTeamworkStatus();

  if (isJson) { console.log(JSON.stringify(status, null, 2)); return; }

  showBanner();
  console.log('🤝 Aegis Antigravity Teamwork Status:');
  console.log(` • Active Tracks Staged: ${status.activeTracksCount}`);
  console.log(` • Locked Files: ${status.lockedFilesCount}`);
  if (status.lockedFilesCount > 0) {
    for (const [file, owner] of Object.entries(status.locks)) console.log(`    🔒 ${file} -> @${owner}`);
  }

  console.log('\n🤖 Available Antigravity Subagent Roles:');
  for (const p of status.profiles) {
    console.log(` • ${p.badge}\n    Mode: ${p.workspaceMode} | MCP: ${p.enableMcpTools ? 'Yes' : 'No'} | Write: ${p.enableWriteTools ? 'Yes' : 'No'}`);
  }
}

export function handleTeamworkClear(flag?: string): void {
  const isJson = flag === '--json' || flag === '-j';
  const coordinator = new TeamworkCoordinator();
  const { locksCleared, tasksCleared: stagedCleared } = coordinator.clearTeamwork();
  const tasksCleared = Math.max(stagedCleared, clearInboxTasks());
  if (isJson) { console.log(JSON.stringify({ success: true, tasksCleared, locksCleared }, null, 2)); return; }
  showBanner();
  console.log(`🧹 Teamwork reset: Cleared ${tasksCleared} task(s) and released ${locksCleared} lock(s).`);
}

export function handleTeamworkPlan(objectiveArg?: string, ...filesOrFlags: string[]): TeamworkPlan | null {
  if (!objectiveArg || objectiveArg.trim().length === 0) {
    showBanner();
    console.error('❌ Usage: aegis teamwork plan "<objective>" [targetFiles...] [--compact] [--json] [--dry-run]');
    return null;
  }

  const { files, flags } = parsePlanArgs(filesOrFlags);
  if (!flags.json && !flags.compact) showBanner();

  const coordinator = new TeamworkCoordinator({ bootstrap: !flags.dryRun });
  const plan = coordinator.planTeamwork(objectiveArg.trim(), files, {
    stage: !flags.dryRun, acquireLocks: !flags.dryRun,
    maxConcurrency: flags.maxConcurrency, explicitRole: flags.explicitRole,
    treeSpecialists: flags.treeSpecialists, research: flags.research, deepAnalyze: flags.deepAnalyze,
    deliberate: flags.deliberate, semantic: flags.semantic
  });

  if (!flags.dryRun) saveTeamworkPlan(plan);
  if (flags.codex) { printCodexHandoff(plan, flags.json, flags.dryRun); return plan; }
  if (flags.json) { console.log(JSON.stringify(plan, null, 2)); return plan; }
  if (flags.compact) { console.log(coordinator.compactTeamwork(plan)); return plan; }

  printPlanSummary(plan, files, flags, coordinator);
  if (flags.reflect) handleTeamworkReflect(plan.planId);
  if (flags.iterate) handleTeamworkIterate(plan.planId);
  return plan;
}

export function handleTeamworkSetup(outDir?: string): void {
  showBanner();
  const coordinator = new TeamworkCoordinator();
  const result = coordinator.exportSubagentManifest(outDir);
  console.log(`✅ Exported Antigravity Subagents Manifest: ${result.manifestPath}\n • Subagents configured: ${result.count}`);
}

export function handleTeamworkDag(objectiveArg?: string, ...files: string[]): void {
  showBanner();
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg || 'Active Teamwork Mission', files, { stage: false, acquireLocks: false });
  console.log(coordinator.formatAsciiDag(plan));
}

export function handleTeamworkMatrix(objectiveArg?: string, ...files: string[]): void {
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg || 'Active Teamwork Mission', files, { stage: false, acquireLocks: false });
  console.log(coordinator.formatLiveMatrix(plan));
}

function routeMeshSubcommands(norm: string, all: string[]): boolean {
  if (norm === 'mesh') { handleTeamworkMesh(all[1], ...all.slice(2)); return true; }
  if (norm === 'peers') { handleTeamworkPeers(all[1]); return true; }
  if (norm === 'post') { handleTeamworkPost(all[1], ...all.slice(2)); return true; }
  if (norm === 'broadcast') { handleTeamworkBroadcast(all[1], ...all.slice(2)); return true; }
  if (norm === 'waves') { handleTeamworkWaves(all[1], ...all.slice(2)); return true; }
  if (norm === 'radar' || norm === 'conflicts') { handleTeamworkConflicts(); return true; }
  if (norm === 'scale') { handleTeamworkScale(all[1], ...all.slice(2)); return true; }
  if (norm === 'batch') { handleTeamworkBatch(all[1], ...all.slice(2)); return true; }
  if (norm === 'doc' || norm === 'synthesize') { handleTeamworkDoc(all[1], ...all.slice(2)); return true; }
  if (norm === 'advance') { handleTeamworkAdvance(all[1]); return true; }
  if (norm === 'tools' || norm === 'tool' || norm === 'arsenal') { handleTeamworkTools(all[1], ...all.slice(2)); return true; }
  if (norm === 'reflect') { handleTeamworkReflect(all[1], ...all.slice(2)); return true; }
  if (norm === 'iterate') { handleTeamworkIterate(all[1], ...all.slice(2)); return true; }
  if (norm === 'gh' || norm === 'github') { void import('./teamwork-gh-command.js').then(m => m.handleTeamworkGitHub(all[1], ...all.slice(2))); return true; }
  if (norm === 'swarm') { void import('./teamwork-analysis-swarm-command.js').then(m => m.handleTeamworkAnalysisSwarm(all[1], ...all.slice(2))); return true; }
  if (norm === 'deliberate' || norm === 'deliberation') { void import('./teamwork-deliberate-command.js').then(m => m.handleTeamworkDeliberate(all[1], ...all.slice(2))); return true; }
  if (norm === 'test') { void import('./test-command.js').then(m => m.handleTestCommand(...all.slice(1))); return true; }
  return false;
}

export function handleTeamwork(subcmd?: string, ...args: string[]): void {
  const all = subcmd ? [subcmd, ...args] : args;
  const first = all[0]?.trim();
  const norm = first ? first.toLowerCase() : '';
  const jsonFlag = all.find(a => a === '--json' || a === '-j');

  if (norm === 'resume') {
    handleCodexOrchestra('resume', ...all.slice(1).filter(arg => arg !== '--json' && arg !== '-j')); return;
  }
  if (!first || norm === 'status' || norm === '--json' || norm === '-j') {
    handleTeamworkStatus(jsonFlag);
  } else if (norm === 'clear' || norm === 'reset') {
    handleTeamworkClear(jsonFlag);
  } else if (norm === 'compact' || norm === 'briefing' || norm === '--compact' || norm === '-c') {
    handleTeamworkCompact(all[1]);
  } else if (norm === 'plan' || norm === 'run') {
    handleTeamworkPlan(all[1], ...all.slice(2));
  } else if (norm === 'setup' || norm === 'init') {
    handleTeamworkSetup(all[1]);
  } else if (routeMeshSubcommands(norm, all)) {
    return;
  } else if (norm === 'dag') {
    handleTeamworkDag(all[1], ...all.slice(2));
  } else if (norm === 'matrix' || norm === 'table') {
    handleTeamworkMatrix(all[1], ...all.slice(2));
  } else if (norm === 'analyze' || norm === 'search') {
    handleTeamworkAnalyze(all[1], ...all.slice(2));
  } else {
    handleTeamworkPlan(all[0], ...all.slice(1));
  }
}

export function handleTeamworkCompact(objectiveArg?: string): void {
  showBanner();
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg || 'Active Mission', [], { stage: false, acquireLocks: false });
  console.log(coordinator.compactTeamwork(plan));
}

export function handleTeamworkAnalyze(objectiveArg?: string, ...files: string[]): void {
  if (files.includes('--swarm') || files.includes('-s')) {
    void import('./teamwork-analysis-swarm-command.js').then(m => m.handleTeamworkAnalysisSwarm(objectiveArg, ...files.filter(f => f !== '--swarm' && f !== '-s')));
    return;
  }
  showBanner();
  if (!objectiveArg?.trim()) {
    console.error('❌ Usage: aegis teamwork analyze "<objective>" [explicitFiles...] [--swarm]');
    return;
  }
  const res = new TeamworkCoordinator().getSemanticAnalyzer().analyze(objectiveArg.trim(), files);
  console.log(`⚡ Aegis Fast Semantic Analysis Result:\n • Objective: "${res.objective}"\n • Duration: ${res.durationMs}ms\n • Target Files (${res.targetFiles.length}):`);
  for (const f of res.targetFiles) console.log(`    📁 ${f}`);
}

export function mcpTeamworkPlan(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || '');
  if (!objective) return JSON.stringify({ error: 'Missing required argument: objective' });
  const targetFiles = Array.isArray(args.targetFiles) ? args.targetFiles.map(String) : [];
  const coordinator = new TeamworkCoordinator();
  const maxConcurrency = typeof args.maxConcurrency === 'number' ? args.maxConcurrency : undefined;
  const explicitRole = typeof args.role === 'string' ? args.role : undefined;
  const treeSpecialists = typeof args.treeSpecialists === 'boolean' ? args.treeSpecialists : undefined;
  const deliberate = typeof args.deliberate === 'boolean' ? args.deliberate : undefined;
  const semantic = typeof args.semantic === 'boolean' ? args.semantic : undefined;
  const plan = coordinator.planTeamwork(objective, targetFiles, {
    maxConcurrency, explicitRole, treeSpecialists, deliberate, semantic
  });
  saveTeamworkPlan(plan);
  return JSON.stringify(plan, null, 2);
}

export { mcpTeamworkClear, mcpTeamworkMatrix } from './teamwork-mesh-mcp.js';


