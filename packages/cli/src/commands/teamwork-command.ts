/**
 * @file teamwork-command.ts
 * CLI and MCP command handlers for Aegis / Antigravity subagent teamwork.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { showBanner } from './banner.js';
import { clearInboxTasks } from './task-inbox.js';
import {
  handleTeamworkMesh, handleTeamworkPeers, handleTeamworkPost, handleTeamworkBroadcast,
  handleTeamworkWaves, handleTeamworkConflicts, handleTeamworkScale, handleTeamworkBatch,
  handleTeamworkDoc, handleTeamworkAdvance, handleTeamworkTools, handleTeamworkReflect, handleTeamworkIterate
} from './teamwork-mesh-command.js';

export { handleTeamworkTools };
import { TeamworkCoordinator, type TeamworkPlan, type TeamworkTrack } from '@aegis/orchestrator';

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

function printTrackPayload(track: TeamworkTrack): void {
  console.log(`\n🔹 [${track.roleType.toUpperCase()}] Track: "${track.title}" (Phase ${track.phase})`);
  console.log(`   Target Files: ${track.targetFiles.join(', ') || 'Codebase-wide'}`);
  if (track.assignedAegisTools && track.assignedAegisTools.length > 0) {
    console.log(`   🛠️ Assigned Aegis Tools: [${track.assignedAegisTools.join(', ')}]`);
  }
  if (track.dependsOn.length > 0) {
    console.log(`   Dependencies: [${track.dependsOn.join(', ')}]`);
  }
  console.log('   Antigravity invoke_subagent Payload:');
  console.log(JSON.stringify(track.invocationPayload, null, 2));
}

interface PlanFlags {
  compact: boolean; json: boolean; dryRun: boolean;
  maxConcurrency?: number; explicitRole?: string;
  treeSpecialists?: boolean; research?: boolean; deepAnalyze?: boolean;
  semantic?: boolean; deliberate?: boolean; reflect?: boolean; iterate?: boolean;
}

function parsePlanArgs(args: string[]): { files: string[]; flags: PlanFlags } {
  const files: string[] = [];
  const flags: PlanFlags = { compact: false, json: false, dryRun: false };
  for (const a of args) {
    if (a === '--compact' || a === '-c') flags.compact = true;
    else if (a === '--json' || a === '-j') flags.json = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--scale' || a === '-s') flags.maxConcurrency = 12;
    else if (a === '--research') flags.research = true;
    else if (a === '--deep' || a === '--deep-analyze') flags.deepAnalyze = true;
    else if (a === '--tree' || a === '--specialists') flags.treeSpecialists = true;
    else if (a === '--semantic') flags.semantic = true;
    else if (a === '--deliberate') flags.deliberate = true;
    else if (a === '--reflect') flags.reflect = true;
    else if (a === '--iterate') flags.iterate = true;
    else if (a.startsWith('--role=') || a.startsWith('-r=') || a.startsWith('--only=')) flags.explicitRole = a.split('=')[1];
    else if (a.startsWith('--max-agents=') || a.startsWith('-n=')) flags.maxConcurrency = parseInt(a.split('=')[1], 10) || 8;
    else if (a && !a.startsWith('-')) files.push(a);
  }
  return { files, flags };
}

function printPlanSummary(
  plan: TeamworkPlan,
  files: string[],
  flags: PlanFlags,
  coordinator: TeamworkCoordinator
): void {
  console.log(`🎯 Aegis Teamwork Plan Created: ${plan.planId}`);
  console.log(` • Objective: "${plan.objective}"\n • Summary: ${plan.summary}`);
  if (plan.complexity) {
    console.log(` • ⚡ Complexity Radar: [${plan.complexity.tier}] (${plan.complexity.score}/100) -> Auto-allocated: ${plan.complexity.optimalAgentCount} agents`);
  }
  if (plan.discoveredFiles && plan.discoveredFiles.length > 0 && files.length === 0) {
    console.log(` • ⚡ Fast Semantic Discovery: ${plan.discoveredFiles.length} file(s) auto-bound: [${plan.discoveredFiles.join(', ')}]`);
  }
  if (plan.deliberation) {
    const d = plan.deliberation;
    console.log(` • 🧠 Deliberation: [${d.consensus.status.toUpperCase()}] (${d.consensus.consensusScore}%) | Domains: [${d.domains.join(', ')}]`);
    console.log(`   ↳ Consensus Strategy: "${d.consensus.agreedStrategy}"`);
  }
  const stageMsg = flags.dryRun ? ' • [DRY RUN] Plan not staged in TIP inbox (no locks acquired)\n' : ' • Staged in TIP Inbox: .aegis/task-inbox.json\n';
  console.log(stageMsg + coordinator.formatLiveMatrix(plan));
  console.log('\n' + coordinator.formatAsciiDag(plan));
  for (const track of plan.tracks) printTrackPayload(track);
}

export function handleTeamworkPlan(objectiveArg?: string, ...filesOrFlags: string[]): TeamworkPlan | null {
  if (!objectiveArg || objectiveArg.trim().length === 0) {
    showBanner();
    console.error('❌ Usage: aegis teamwork plan "<objective>" [targetFiles...] [--compact] [--json] [--dry-run]');
    return null;
  }

  const { files, flags } = parsePlanArgs(filesOrFlags);
  if (!flags.json && !flags.compact) showBanner();

  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg.trim(), files, {
    stage: !flags.dryRun, acquireLocks: !flags.dryRun,
    maxConcurrency: flags.maxConcurrency, explicitRole: flags.explicitRole,
    treeSpecialists: flags.treeSpecialists, research: flags.research, deepAnalyze: flags.deepAnalyze,
    deliberate: flags.deliberate, semantic: flags.semantic
  });

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
  return JSON.stringify(plan, null, 2);
}

export function mcpTeamworkStatus(): string {
  const coordinator = new TeamworkCoordinator();
  return JSON.stringify(coordinator.getTeamworkStatus(), null, 2);
}

export function mcpTeamworkDag(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || 'Active Mission');
  const targetFiles = Array.isArray(args.targetFiles) ? args.targetFiles.map(String) : [];
  const coordinator = new TeamworkCoordinator();
  return coordinator.formatAsciiDag(coordinator.planTeamwork(objective, targetFiles, { stage: false, acquireLocks: false }));
}

export function mcpTeamworkCompact(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || 'Active Mission');
  const coordinator = new TeamworkCoordinator();
  return coordinator.compactTeamwork(coordinator.planTeamwork(objective, [], { stage: false, acquireLocks: false }));
}

export function mcpTeamworkAnalyze(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || '');
  if (!objective) return JSON.stringify({ error: 'Missing required argument: objective' });
  const explicitFiles = Array.isArray(args.files) ? args.files.map(String) : [];
  return JSON.stringify(new TeamworkCoordinator().getSemanticAnalyzer().analyze(objective, explicitFiles), null, 2);
}

export { mcpTeamworkClear, mcpTeamworkMatrix } from './teamwork-mesh-mcp.js';


