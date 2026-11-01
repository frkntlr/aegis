/**
 * @file teamwork-command.ts
 * CLI and MCP command handlers for Aegis / Antigravity subagent teamwork.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { showBanner } from './banner.js';
import {
  TeamworkCoordinator,
  type TeamworkPlan,
  type TeamworkTrack
} from '@aegis/orchestrator';

export function handleTeamworkStatus(): void {
  showBanner();
  const coordinator = new TeamworkCoordinator();
  const status = coordinator.getTeamworkStatus();

  console.log('🤝 Aegis Antigravity Teamwork Status:');
  console.log(` • Active Tracks Staged: ${status.activeTracksCount}`);
  console.log(` • Locked Files: ${status.lockedFilesCount}`);
  if (status.lockedFilesCount > 0) {
    for (const [file, owner] of Object.entries(status.locks)) {
      console.log(`    🔒 ${file} -> @${owner}`);
    }
  }

  console.log('\n🤖 Available Antigravity Subagent Roles:');
  for (const p of status.profiles) {
    console.log(` • ${p.badge}`);
    console.log(`    Mode: ${p.workspaceMode} | MCP: ${p.enableMcpTools ? 'Yes' : 'No'} | Write: ${p.enableWriteTools ? 'Yes' : 'No'}`);
  }
}

function printTrackPayload(track: TeamworkTrack): void {
  console.log(`\n🔹 [${track.roleType.toUpperCase()}] Track: "${track.title}" (Phase ${track.phase})`);
  console.log(`   Target Files: ${track.targetFiles.join(', ') || 'Codebase-wide'}`);
  if (track.dependsOn.length > 0) {
    console.log(`   Dependencies: [${track.dependsOn.join(', ')}]`);
  }
  console.log('   Antigravity invoke_subagent Payload:');
  console.log(JSON.stringify(track.invocationPayload, null, 2));
}

export function handleTeamworkPlan(objectiveArg?: string, ...files: string[]): TeamworkPlan | null {
  showBanner();
  if (!objectiveArg || objectiveArg.trim().length === 0) {
    console.error('❌ Usage: aegis teamwork plan "<objective>" [targetFiles...]');
    return null;
  }

  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg.trim(), files);

  console.log(`🎯 Aegis Teamwork Plan Created: ${plan.planId}`);
  console.log(` • Objective: "${plan.objective}"`);
  console.log(` • Summary: ${plan.summary}`);
  if (plan.discoveredFiles && plan.discoveredFiles.length > 0 && files.length === 0) {
    console.log(` • ⚡ Fast Semantic Discovery: ${plan.discoveredFiles.length} file(s) auto-bound: [${plan.discoveredFiles.join(', ')}]`);
  }
  console.log(` • Staged in TIP Inbox: .aegis/task-inbox.json\n`);
  console.log(coordinator.formatLiveMatrix(plan));
  console.log('\n' + coordinator.formatAsciiDag(plan));

  for (const track of plan.tracks) {
    printTrackPayload(track);
  }
  return plan;
}

export function handleTeamworkSetup(outDir?: string): void {
  showBanner();
  const coordinator = new TeamworkCoordinator();
  const result = coordinator.exportSubagentManifest(outDir);
  console.log(`✅ Exported Antigravity Subagents Manifest: ${result.manifestPath}`);
  console.log(` • Subagents configured: ${result.count}`);
}

export function handleTeamworkDag(objectiveArg?: string, ...files: string[]): void {
  showBanner();
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg || 'Active Teamwork Mission', files);
  console.log(coordinator.formatAsciiDag(plan));
}

export function handleTeamwork(subcmd?: string, ...args: string[]): void {
  const norm = (subcmd || 'status').toLowerCase().trim();
  if (norm === 'plan' || norm === 'run') {
    handleTeamworkPlan(args[0], ...args.slice(1));
    return;
  }
  if (norm === 'setup' || norm === 'init') {
    handleTeamworkSetup(args[0]);
    return;
  }
  if (norm === 'dag' || norm === 'waves') {
    handleTeamworkDag(args[0], ...args.slice(1));
    return;
  }
  if (norm === 'matrix' || norm === 'table') {
    const coordinator = new TeamworkCoordinator();
    const plan = coordinator.planTeamwork(args[0] || 'Active Teamwork Mission', args.slice(1));
    console.log(coordinator.formatLiveMatrix(plan));
    return;
  }
  if (norm === 'compact' || norm === 'briefing') {
    handleTeamworkCompact(args[0]);
    return;
  }
  if (norm === 'analyze' || norm === 'search') {
    handleTeamworkAnalyze(args[0], ...args.slice(1));
    return;
  }
  handleTeamworkStatus();
}

export function handleTeamworkCompact(objectiveArg?: string): void {
  showBanner();
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg || 'Active Mission');
  const briefing = coordinator.compactTeamwork(plan);
  console.log(briefing);
}

export function handleTeamworkAnalyze(objectiveArg?: string, ...files: string[]): void {
  showBanner();
  if (!objectiveArg || objectiveArg.trim().length === 0) {
    console.error('❌ Usage: aegis teamwork analyze "<objective>" [explicitFiles...]');
    return;
  }
  const coordinator = new TeamworkCoordinator();
  const res = coordinator.getSemanticAnalyzer().analyze(objectiveArg.trim(), files);
  console.log('⚡ Aegis Fast Semantic Analysis Result:');
  console.log(` • Objective: "${res.objective}"`);
  console.log(` • Duration: ${res.durationMs}ms (Sub-10ms fast path)`);
  console.log(` • Confidence: ${Math.round(res.confidence * 100)}%`);
  console.log(` • Keywords: [${res.keywords.join(', ')}]`);
  console.log(` • Discovered Target Files (${res.targetFiles.length}):`);
  for (const f of res.targetFiles) console.log(`    📁 ${f}`);
}

export function mcpTeamworkPlan(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || '');
  if (!objective) {
    return JSON.stringify({ error: 'Missing required argument: objective' });
  }
  const targetFiles = Array.isArray(args.targetFiles) ? args.targetFiles.map(String) : [];
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objective, targetFiles);
  return JSON.stringify(plan, null, 2);
}

export function mcpTeamworkStatus(): string {
  const coordinator = new TeamworkCoordinator();
  const status = coordinator.getTeamworkStatus();
  return JSON.stringify(status, null, 2);
}

export function mcpTeamworkDag(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || 'Active Mission');
  const targetFiles = Array.isArray(args.targetFiles) ? args.targetFiles.map(String) : [];
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objective, targetFiles);
  return coordinator.formatAsciiDag(plan);
}

export function mcpTeamworkCompact(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || 'Active Mission');
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objective);
  return coordinator.compactTeamwork(plan);
}

export function mcpTeamworkAnalyze(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || '');
  if (!objective) return JSON.stringify({ error: 'Missing required argument: objective' });
  const explicitFiles = Array.isArray(args.files) ? args.files.map(String) : [];
  const coordinator = new TeamworkCoordinator();
  const res = coordinator.getSemanticAnalyzer().analyze(objective, explicitFiles);
  return JSON.stringify(res, null, 2);
}
