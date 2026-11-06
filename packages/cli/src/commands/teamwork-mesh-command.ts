/**
 * @file teamwork-mesh-command.ts
 * Dynamic Teamwork Mesh & Peer Awareness CLI and MCP handlers.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { showBanner } from './banner.js';
import {
  TeamworkMesh,
  TeamworkCoordinator,
  TeamworkDecomposer,
  TeamworkDocSynthesizer,
  formatAegisToolMatrix,
  ROLE_AEGIS_TOOLS,
  computeExecutionWaves,
  getConcurrentExecutionBatches,
  formatParallelDispatchBriefing,
  formatCompactWaveBriefing,
  type TeamworkEvent,
  type TeamworkMeshState
} from '@aegis/orchestrator';

function resolveAgentName(override?: string): string {
  if (override && override.trim().length > 0) return override.trim();
  const envAgent = process.env.AEGIS_AGENT_NAME || process.env.AGENT_ROLE || process.env.SUBAGENT_NAME;
  return envAgent ? envAgent.trim() : 'issue-solver';
}

function printMeshDetails(state: TeamworkMeshState): void {
  showBanner();
  console.log(`🌐 Aegis Dynamic Teamwork Mesh [Plan: ${state.planId}] W${state.activeWave} | Peers: ${Object.keys(state.agents).length}`);
  console.log(` • Objective: "${state.objective || 'Active Mission'}" | Updated: ${state.lastUpdated}\n📡 Recent Mesh Events:`);
  const recent = state.events.slice(-5);
  if (!recent.length) {
    console.log('   (No events broadcasted yet)');
  } else {
    for (const e of recent) {
      console.log(`   [${e.timestamp.slice(11, 19)}] @${e.fromAgent} (${e.type}): ${e.message}`);
    }
  }
}

export function handleTeamworkMesh(action?: string, ...args: string[]): void {
  const mesh = new TeamworkMesh();
  const act = (action || '').toLowerCase().trim();

  if (act === 'clear' || act === 'reset') {
    mesh.clearMesh();
    console.log('🧹 Dynamic Teamwork Mesh state cleared (.aegis/teamwork-mesh.json removed).');
    return;
  }
  if (act === 'radar' || act === 'conflicts') { handleTeamworkConflicts(); return; }
  if (args.includes('--compact') || args.includes('-c') || act === '--compact' || act === '-c') {
    console.log(mesh.getCompactMeshState());
    return;
  }
  if (args.includes('--json') || args.includes('-j') || act === '--json') {
    console.log(JSON.stringify(mesh.getMeshState(), null, 2));
    return;
  }
  printMeshDetails(mesh.getMeshState());
}

export function handleTeamworkPeers(flag?: string): void {
  const peers = new TeamworkMesh().listPeers();
  if (flag === '--json' || flag === '-j') { console.log(JSON.stringify(peers, null, 2)); return; }
  if (flag === '--compact' || flag === '-c') {
    for (const p of peers) {
      console.log(`@${p.subagentName} [${p.status}]: "${p.currentActivity}"${p.modifiedFiles.length ? ` | mod:[${p.modifiedFiles.join(',')}]` : ''}`);
    }
    return;
  }
  showBanner();
  console.log(`👥 Active Teamwork Subagents (${peers.length} registered):`);
  if (!peers.length) { console.log('   (No active peers registered in mesh. Stage a mission with "aegis tw <objective>")'); return; }
  for (const p of peers) {
    console.log(`\n • @${p.subagentName} [${p.role.toUpperCase()}] | Status: ${p.status.toUpperCase()}`);
    console.log(`   Activity: "${p.currentActivity}" | Locks: ${p.lockedFiles.join(', ') || 'None'}`);
    if (p.modifiedFiles.length) console.log(`   Modified: ${p.modifiedFiles.join(', ')}`);
    if (p.publishedContracts.length) console.log(`   Contracts: ${p.publishedContracts.join(', ')}`);
  }
}

export function handleTeamworkConflicts(): void {
  const conflicts = new TeamworkMesh().detectConflicts();
  showBanner();
  if (conflicts.length === 0) {
    console.log('✅ Conflict Radar: Zero active file collisions across concurrent peers.');
    return;
  }
  console.log(`⚠️ Conflict Radar: ${conflicts.length} colliding file allocation(s) detected:`);
  for (const c of conflicts) {
    console.log(` • 🔒 ${c.file} -> Touched by [${c.agents.join(', ')}]`);
  }
}

export function handleTeamworkScale(objectiveArg?: string, ...flags: string[]): void {
  const maxFlag = flags.find(f => f.startsWith('--max-agents='));
  const maxAgents = maxFlag ? Math.max(2, parseInt(maxFlag.slice(13), 10) || 12) : 12;
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg || 'Hyper-Scale Mission', [], { stage: false, acquireLocks: false });
  const sharded = TeamworkDecomposer.shardMaxConcurrency(
    TeamworkDecomposer.decompose(plan.objective, plan.discoveredFiles ?? []),
    plan.discoveredFiles ?? [],
    maxAgents
  );

  showBanner();
  console.log(`⚡ Aegis Hyper-Scale Concurrency Plan: ${sharded.length} subagents (Max: ${maxAgents})`);
  console.log('🔒 Disjoint Lock Guarantee: 100% conflict-free parallel allocation.');
  for (const s of sharded) {
    const fStr = s.targetFiles.length ? s.targetFiles.join(', ') : 'general';
    console.log(` ▶ [${s.roleType.toUpperCase()}] @${s.label} (Phase ${s.phase}): ${fStr}`);
  }
}

export function handleTeamworkBatch(objectiveArg?: string, ...flags: string[]): void {
  const isJson = flags.includes('--json') || flags.includes('-j');
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg || 'Active Mission', [], { stage: false, acquireLocks: false });
  const batches = getConcurrentExecutionBatches(plan.tracks);
  if (isJson) {
    console.log(JSON.stringify(batches, null, 2));
    return;
  }
  showBanner();
  console.log(`📦 Concurrent Execution Batches (${batches.length} sequential wave sets):`);
  for (let idx = 0; idx < batches.length; idx++) {
    const batch = batches[idx];
    console.log(`\n🌊 BATCH ${idx + 1} (${batch.length} agents running concurrently):`);
    for (const t of batch) {
      console.log(`   ▶ @${t.subagentName} [${t.roleType}]: ${t.targetFiles.join(', ') || 'general'}`);
    }
  }
}

interface PostFlags {
  status?: 'working' | 'milestone' | 'blocked' | 'done';
  agent?: string;
  files: string[];
  contracts: string[];
}

function parsePostFlags(flags: string[]): PostFlags {
  const parsed: PostFlags = { files: [], contracts: [] };
  for (const f of flags) {
    if (f.startsWith('--status=')) {
      const s = f.slice(9).toLowerCase();
      if (s === 'working' || s === 'milestone' || s === 'blocked' || s === 'done') parsed.status = s;
    } else if (f.startsWith('--agent=')) {
      parsed.agent = f.slice(8);
    } else if (f.startsWith('--files=')) {
      parsed.files = f.slice(8).split(',').map(s => s.trim()).filter(Boolean);
    } else if (f.startsWith('--contract=') || f.startsWith('--contracts=')) {
      const idx = f.indexOf('=');
      parsed.contracts = f.slice(idx + 1).split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return parsed;
}

export function handleTeamworkPost(activity?: string, ...flags: string[]): void {
  const parsed = parsePostFlags(flags);
  const agent = resolveAgentName(parsed.agent);
  const actText = activity && !activity.startsWith('--') ? activity.trim() : 'Progress update';
  const updated = new TeamworkMesh().postActivity(agent, {
    status: parsed.status,
    activity: actText,
    modifiedFiles: parsed.files.length > 0 ? parsed.files : undefined,
    publishedContracts: parsed.contracts.length > 0 ? parsed.contracts : undefined
  });
  console.log(`📡 Posted to Mesh: @${updated.subagentName} [${updated.status}] "${updated.currentActivity}"`);
}

export function handleTeamworkBroadcast(message?: string, ...flags: string[]): void {
  if (!message || message.startsWith('--')) {
    console.error('❌ Usage: aegis tw:broadcast "<message>" [--agent=<name>] [--type=<type>]');
    return;
  }
  let agentOverride: string | undefined;
  let type: TeamworkEvent['type'] = 'broadcast';
  for (const f of flags) {
    if (f.startsWith('--agent=')) agentOverride = f.slice(8);
    if (f.startsWith('--type=')) {
      const t = f.slice(7).toLowerCase();
      if (t === 'heartbeat' || t === 'milestone' || t === 'contract_update' || t === 'broadcast' || t === 'completed') type = t;
    }
  }
  const ev = new TeamworkMesh().broadcastEvent(resolveAgentName(agentOverride), message.trim(), type);
  console.log(`📢 Broadcast event sent (${ev.type}): [${ev.fromAgent}] "${ev.message}"`);
}

export function handleTeamworkWaves(objectiveArg?: string, ...filesOrFlags: string[]): void {
  const isJson = filesOrFlags.includes('--json') || filesOrFlags.includes('-j');
  const isCompact = filesOrFlags.includes('--compact') || filesOrFlags.includes('-c');
  const files = filesOrFlags.filter(f => f && !f.startsWith('-'));
  const coordinator = new TeamworkCoordinator();
  const plan = coordinator.planTeamwork(objectiveArg || 'Active Mission', files, { stage: false, acquireLocks: false });
  const waves = computeExecutionWaves(plan.tracks);

  if (isJson) {
    console.log(JSON.stringify(waves, null, 2));
    return;
  }
  if (isCompact) {
    console.log(formatCompactWaveBriefing(waves));
    return;
  }
  showBanner();
  console.log(formatParallelDispatchBriefing(waves));
}

export {
  mcpTeamworkMeshRead,
  mcpTeamworkMeshPost,
  mcpTeamworkBroadcast,
  mcpTeamworkPeers,
  mcpTeamworkConflicts,
  mcpTeamworkWaves,
  mcpTeamworkScale,
  mcpTeamworkDocSynthesize
} from './teamwork-mesh-mcp.js';

export function handleTeamworkDoc(planId?: string, ...flags: string[]): void {
  const isCompact = flags.includes('--compact') || flags.includes('-c') || planId === '--compact' || planId === '-c';
  const effectivePlanId = planId && !planId.startsWith('-') ? planId : undefined;
  const synthesizer = new TeamworkDocSynthesizer();
  if (isCompact) { console.log(synthesizer.synthesizeCompact(effectivePlanId)); return; }
  showBanner();
  console.log(synthesizer.synthesize(effectivePlanId));
}

export function handleTeamworkAdvance(planId?: string): void {
  const res = new TeamworkCoordinator().advanceWave(planId);
  showBanner();
  console.log(`🌊 Wave Advanced: Wave ${res.currentWave} -> Next Phase: ${res.nextPhase}`);
  console.log(`👥 Unlocked subagents in active batch: ${res.nextBatchPayload.length}`);
}

export function handleTeamworkTools(roleOrFlag?: string, ...flags: string[]): void {
  const isJson = roleOrFlag === '--json' || roleOrFlag === '-j' || flags.includes('--json') || flags.includes('-j');
  const role = roleOrFlag && !roleOrFlag.startsWith('-') ? roleOrFlag : undefined;
  if (isJson) {
    const tools = role ? (ROLE_AEGIS_TOOLS[role as keyof typeof ROLE_AEGIS_TOOLS] ?? []) : ROLE_AEGIS_TOOLS;
    console.log(JSON.stringify(tools, null, 2));
    return;
  }
  showBanner();
  console.log(formatAegisToolMatrix(role));
}

export function mcpTeamworkTools(args: Record<string, unknown> = {}): string {
  const role = typeof args.role === 'string' ? args.role : undefined;
  return formatAegisToolMatrix(role);
}


