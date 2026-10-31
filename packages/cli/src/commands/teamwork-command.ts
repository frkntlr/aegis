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
  console.log(`\n🔹 [${track.roleType.toUpperCase()}] Track: "${track.title}"`);
  console.log(`   Target Files: ${track.targetFiles.join(', ') || 'Codebase-wide'}`);
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
  console.log(` • Staged in TIP Inbox: .aegis/task-inbox.json\n`);
  console.log(coordinator.formatLiveMatrix(plan));

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
  if (norm === 'matrix' || norm === 'table') {
    const coordinator = new TeamworkCoordinator();
    const plan = coordinator.planTeamwork(args[0] || 'Active Teamwork Mission', args.slice(1));
    console.log(coordinator.formatLiveMatrix(plan));
    return;
  }
  handleTeamworkStatus();
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
