/**
 * @file teamwork-plan-helpers.ts
 * Argument parsing, plan printing, and MCP helpers for Aegis Teamwork commands.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { TeamworkCoordinator, type TeamworkPlan, type TeamworkTrack } from '@aegis/orchestrator';

export interface PlanFlags {
  compact: boolean;
  json: boolean;
  dryRun: boolean;
  codex?: boolean;
  maxConcurrency?: number;
  explicitRole?: string;
  treeSpecialists?: boolean;
  research?: boolean;
  deepAnalyze?: boolean;
  semantic?: boolean;
  deliberate?: boolean;
  reflect?: boolean;
  iterate?: boolean;
}

export function printTrackPayload(track: TeamworkTrack): void {
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
  if (track.codexInvocationPayload) {
    console.log('   Codex native spawn payload (adapt to the host tool schema):');
    console.log(JSON.stringify(track.codexInvocationPayload, null, 2));
  }
}

export function parsePlanArgs(args: string[]): { files: string[]; flags: PlanFlags } {
  const files: string[] = [];
  const flags: PlanFlags = { compact: false, json: false, dryRun: false };
  for (const a of args) {
    if (a === '--compact' || a === '-c') flags.compact = true;
    else if (a === '--json' || a === '-j') flags.json = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--client=codex') flags.codex = true;
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

export function printPlanSummary(
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
