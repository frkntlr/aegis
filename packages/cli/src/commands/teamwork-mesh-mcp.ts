/**
 * @file teamwork-mesh-mcp.ts
 * MCP Tool handlers for Aegis Dynamic Teamwork Mesh, waves, and real-time blackboard.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  TeamworkMesh,
  TeamworkCoordinator,
  TeamworkDecomposer,
  TeamworkDocSynthesizer,
  formatAegisToolMatrix,
  computeExecutionWaves,
  formatCompactWaveBriefing,
  formatParallelDispatchBriefing,
  getConcurrentExecutionBatches,
  type TeamworkTrack
} from '@aegis/orchestrator';
import { clearInboxTasks } from './task-inbox.js';
import { loadTeamworkPlan } from './teamwork-plan-store.js';

function codexTrack(track: TeamworkTrack) {
  const { prompt: _prompt, invocationPayload: _antigravity, ...native } = track;
  return native;
}

function resolveAgentName(override?: string): string {
  if (override && override.trim().length > 0) return override.trim();
  const envAgent = process.env.AEGIS_AGENT_NAME || process.env.AGENT_ROLE || process.env.SUBAGENT_NAME;
  return envAgent ? envAgent.trim() : 'issue-solver';
}

export function mcpTeamworkMeshRead(args: Record<string, unknown> = {}): string {
  const mesh = new TeamworkMesh();
  if (args.compact) {
    return mesh.getCompactMeshState(typeof args.since === 'string' ? args.since : undefined);
  }
  return JSON.stringify(mesh.getMeshState(), null, 2);
}

export function mcpTeamworkMeshPost(args: Record<string, unknown> = {}): string {
  const agentId = String(args.agentId || resolveAgentName());
  const s = typeof args.status === 'string' ? args.status.toLowerCase() : undefined;
  const status = (s === 'working' || s === 'milestone' || s === 'blocked' || s === 'done') ? s : undefined;
  const activity = typeof args.activity === 'string' ? args.activity : undefined;
  const modifiedFiles = Array.isArray(args.modifiedFiles) ? args.modifiedFiles.map(String) : undefined;
  const publishedContracts = Array.isArray(args.publishedContracts) ? args.publishedContracts.map(String) : undefined;
  const res = new TeamworkMesh().postActivity(agentId, { status, activity, modifiedFiles, publishedContracts });
  return JSON.stringify(res, null, 2);
}

export function mcpTeamworkBroadcast(args: Record<string, unknown> = {}): string {
  const fromAgent = String(args.fromAgent || resolveAgentName());
  const message = String(args.message || '');
  if (!message) return JSON.stringify({ error: 'Missing required argument: message' });
  const t = typeof args.type === 'string' ? args.type.toLowerCase() : 'broadcast';
  const type = (t === 'heartbeat' || t === 'milestone' || t === 'contract_update' || t === 'broadcast' || t === 'completed') ? t : 'broadcast';
  const ev = new TeamworkMesh().broadcastEvent(fromAgent, message, type, args.payload as Record<string, unknown> | undefined);
  return JSON.stringify(ev, null, 2);
}

export function mcpTeamworkPeers(args: Record<string, unknown> = {}): string {
  const peers = new TeamworkMesh().listPeers();
  if (args.compact) {
    return peers.map(p => `@${p.subagentName} [${p.status}]: "${p.currentActivity}"`).join('\n');
  }
  return JSON.stringify(peers, null, 2);
}

export function mcpTeamworkConflicts(): string {
  return JSON.stringify(new TeamworkMesh().detectConflicts(), null, 2);
}

export function mcpTeamworkWaves(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || 'Active Mission');
  const targetFiles = Array.isArray(args.targetFiles) ? args.targetFiles.map(String) : [];
  const plan = new TeamworkCoordinator().planTeamwork(objective, targetFiles, { stage: false, acquireLocks: false });
  const waves = computeExecutionWaves(plan.tracks);
  if (args.compact) return formatCompactWaveBriefing(waves);
  if (args.client === 'codex') {
    return JSON.stringify({ waves: waves.map(wave => ({ ...wave, tracks: wave.tracks.map(codexTrack) })),
      briefing: 'Use codexInvocationPayload.message with the native spawn tool; inherit the model and respect host capacity, dependencies and locks.' }, null, 2);
  }
  return JSON.stringify({ waves, briefing: formatParallelDispatchBriefing(waves) }, null, 2);
}

export function mcpTeamworkScale(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || 'Active Mission');
  const maxAgents = typeof args.maxAgents === 'number' ? args.maxAgents : 12;
  const plan = new TeamworkCoordinator().planTeamwork(objective, [], { stage: false, acquireLocks: false });
  const sharded = TeamworkDecomposer.shardMaxConcurrency(
    TeamworkDecomposer.decompose(plan.objective, plan.discoveredFiles ?? []),
    plan.discoveredFiles ?? [],
    maxAgents
  );
  return JSON.stringify({ objective, maxAgents, count: sharded.length, subtasks: sharded }, null, 2);
}

export function mcpTeamworkDocSynthesize(args: Record<string, unknown> = {}): string {
  const synthesizer = new TeamworkDocSynthesizer();
  const planId = typeof args.planId === 'string' ? args.planId : undefined;
  if (args.compact) return synthesizer.synthesizeCompact(planId);
  return synthesizer.synthesize(planId);
}

export function mcpTeamworkTools(args: Record<string, unknown> = {}): string {
  const role = typeof args.role === 'string' ? args.role : undefined;
  return formatAegisToolMatrix(role);
}

export function mcpTeamworkAdvance(args: Record<string, unknown> = {}): string {
  const coordinator = new TeamworkCoordinator();
  const planId = typeof args.planId === 'string' ? args.planId : undefined;
  return JSON.stringify(coordinator.advanceWave(planId), null, 2);
}

export function mcpTeamworkClear(): string {
  const coordinator = new TeamworkCoordinator();
  const { locksCleared, tasksCleared: stagedCleared } = coordinator.clearTeamwork();
  const tasksCleared = stagedCleared || clearInboxTasks();
  return JSON.stringify({ success: true, tasksCleared, locksCleared }, null, 2);
}

export function mcpTeamworkMatrix(args: Record<string, unknown> = {}): string {
  const objective = String(args.objective || 'Active Teamwork Mission');
  const targetFiles = Array.isArray(args.targetFiles) ? args.targetFiles.map(String) : [];
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objective, targetFiles, { stage: false, acquireLocks: false });
  return coordinator.formatLiveMatrix(plan);
}

export function mcpTeamworkBatch(args: Record<string, unknown> = {}): string {
  try {
    const plan = typeof args.planId === 'string' && args.planId
      ? loadTeamworkPlan(args.planId)
      : new TeamworkCoordinator().planTeamwork(String(args.objective || 'Active Mission'), [], { stage: false, acquireLocks: false });
    const batches = getConcurrentExecutionBatches(plan.tracks);
    return JSON.stringify(args.client === 'codex' ? batches.map(batch => batch.map(codexTrack)) : batches, null, 2);
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }
}

export async function mcpTeamworkTest(args: Record<string, unknown> = {}): Promise<string> {
  const { runResilientTest } = await import('./test-command.js');
  const target = typeof args.target === 'string' ? args.target : undefined;
  const offline = args.offline === true;
  const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined;
  const res = await runResilientTest({ target, offline, timeoutMs });
  return JSON.stringify(res, null, 2);
}


