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

const PLAN_FLAG_SETTERS: Record<string, (flags: PlanFlags) => void> = {
  '--compact': (f) => { f.compact = true; },
  '-c': (f) => { f.compact = true; },
  '--json': (f) => { f.json = true; },
  '-j': (f) => { f.json = true; },
  '--dry-run': (f) => { f.dryRun = true; },
  '--client=codex': (f) => { f.codex = true; },
  '--scale': (f) => { f.maxConcurrency = 12; },
  '-s': (f) => { f.maxConcurrency = 12; },
  '--research': (f) => { f.research = true; },
  '--deep': (f) => { f.deepAnalyze = true; },
  '--deep-analyze': (f) => { f.deepAnalyze = true; },
  '--tree': (f) => { f.treeSpecialists = true; },
  '--specialists': (f) => { f.treeSpecialists = true; },
  '--semantic': (f) => { f.semantic = true; },
  '--deliberate': (f) => { f.deliberate = true; },
  '--reflect': (f) => { f.reflect = true; },
  '--iterate': (f) => { f.iterate = true; }
};

const ROLE_FLAG_PREFIXES = ['--role=', '-r=', '--only='] as const;
const MAX_AGENTS_PREFIXES = ['--max-agents=', '-n='] as const;

function applyPlanFlagArg(arg: string, flags: PlanFlags): boolean {
  const setter = PLAN_FLAG_SETTERS[arg];
  if (setter) {
    setter(flags);
    return true;
  }
  if (ROLE_FLAG_PREFIXES.some(p => arg.startsWith(p))) {
    flags.explicitRole = arg.split('=')[1];
    return true;
  }
  if (MAX_AGENTS_PREFIXES.some(p => arg.startsWith(p))) {
    flags.maxConcurrency = parseInt(arg.split('=')[1], 10) || 8;
    return true;
  }
  return false;
}

export function parsePlanArgs(args: string[]): { files: string[]; flags: PlanFlags } {
  const files: string[] = [];
  const flags: PlanFlags = { compact: false, json: false, dryRun: false };
  for (const a of args) {
    if (applyPlanFlagArg(a, flags)) continue;
    if (a && !a.startsWith('-')) files.push(a);
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
