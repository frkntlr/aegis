/**
 * @file teamwork-mesh.ts
 * Real-time Dynamic Teamwork Mesh & Blackboard for concurrent subagents.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { TeamworkTrack, TeamworkPeerState, TeamworkEvent, TeamworkMeshState } from './teamwork-types.js';
import { isLockConflict } from './worktree-lock-manager.js';
import {
  TeamworkMeshStore,
  type ActivityUpdate,
  type MeshConflict
} from './teamwork-mesh-store.js';
import { TeamworkMeshReader } from './teamwork-mesh-reader.js';
import {
  advanceWaveWithStore,
  checkWaveProgressionHelper,
  type WaveAdvanceResult,
  type WaveStatus
} from './teamwork-mesh-waves.js';

export type { WaveStatus, WaveAdvanceResult };
export { TeamworkMeshStore, type ActivityUpdate, type MeshConflict };

function checkConflictWarningHelper(
  store: TeamworkMeshStore,
  state: TeamworkMeshState,
  agentId: string,
  modified: string[]
): void {
  for (const [otherId, peer] of Object.entries(state.agents)) {
    if (otherId === agentId || peer.status === 'done') continue;
    const peerFiles = [...peer.lockedFiles, ...peer.modifiedFiles];
    const clash = modified.filter(f => peerFiles.some(pf => isLockConflict(f, pf)));
    if (clash.length > 0) {
      store.appendEvent(state, 'radar', 'milestone', `⚠️ CONFLICT_WARNING: @${agentId} touched [${clash.join(',')}] active on @${otherId}`);
    }
  }
}

function emitPeerActivityEvents(
  store: TeamworkMeshStore,
  state: TeamworkMeshState,
  agentId: string,
  update: ActivityUpdate,
  newContracts: string[]
): void {
  if (update.activity || update.status) {
    const isM = update.status === 'milestone' || update.status === 'done';
    const eventType = isM ? (update.status === 'done' ? 'completed' : 'milestone') : 'heartbeat';
    store.appendEvent(state, agentId, eventType, update.activity ?? `Status: ${update.status}`);
  }
  if (newContracts.length > 0) {
    store.appendEvent(state, agentId, 'contract_update', `📜 Contract published: [${newContracts.join(', ')}]`, { contracts: newContracts });
  }
  if (update.status === 'blocked') {
    store.appendEvent(state, agentId, 'milestone', `⚠️ TASK_BLOCKED: @${agentId} is blocked: ${update.activity ?? 'Awaiting remediation'}`, {
      status: 'blocked',
      triggerFeedbackLoop: true,
      agentId
    });
  }
}

function applyPeerActivityUpdate(
  store: TeamworkMeshStore,
  agentId: string,
  update: ActivityUpdate
): TeamworkPeerState {
  const state = store.loadState();
  const existing = state.agents[agentId] ?? store.createDefaultPeer(agentId);
  if (state.agents[agentId] && store.isNoopUpdate(existing, update)) return existing;

  const now = new Date().toISOString();
  const newContracts = (update.publishedContracts ?? []).filter(c => !existing.publishedContracts.includes(c));
  const updatedPeer = store.mergePeerUpdate(existing, update, now);

  state.agents[agentId] = updatedPeer;
  state.lastUpdated = now;

  if (update.modifiedFiles?.length) checkConflictWarningHelper(store, state, agentId, update.modifiedFiles);
  emitPeerActivityEvents(store, state, agentId, update, newContracts);
  if (update.status === 'done') checkWaveProgressionHelper(store, state);

  store.saveState(state);
  return updatedPeer;
}

export class TeamworkMesh extends TeamworkMeshReader {
  constructor(repoRoot?: string, store?: TeamworkMeshStore) {
    super(repoRoot, store);
  }

  public initializeMesh(planId: string, objective: string, tracks: TeamworkTrack[]): TeamworkMeshState {
    return this.store.withLock(() => {
      const state = this.store.createInitialState(planId, objective, tracks);
      this.store.saveState(state);
      return state;
    });
  }

  public postActivity(agentId: string, update: ActivityUpdate): TeamworkPeerState {
    return this.store.withLock(() => applyPeerActivityUpdate(this.store, agentId, update));
  }

  public broadcastEvent(fromAgent: string, message: string, type: TeamworkEvent['type'] = 'broadcast', payload?: Record<string, unknown>): TeamworkEvent {
    return this.store.withLock(() => {
      const state = this.store.loadState();
      const event = this.store.appendEvent(state, fromAgent, type, message, payload);
      state.lastUpdated = new Date().toISOString();
      this.store.saveState(state);
      return event;
    });
  }

  public detectConflicts(): MeshConflict[] {
    const peers = Object.values(this.store.loadState().agents);
    const peerEntries: Array<{ agent: string; file: string }> = [];
    for (const p of peers) {
      for (const f of new Set([...p.lockedFiles, ...p.modifiedFiles])) {
        peerEntries.push({ agent: p.subagentName, file: f });
      }
    }
    const conflicts: MeshConflict[] = [];
    const handledFiles = new Set<string>();

    for (const entry of peerEntries) {
      if (handledFiles.has(entry.file)) continue;
      const clashingAgents = new Set<string>([entry.agent]);
      for (const other of peerEntries) {
        if (other.agent !== entry.agent && isLockConflict(entry.file, other.file)) {
          clashingAgents.add(other.agent);
        }
      }
      if (clashingAgents.size > 1) {
        handledFiles.add(entry.file);
        conflicts.push({ file: entry.file, agents: Array.from(clashingAgents) });
      }
    }
    return conflicts;
  }

  public clearMesh(): void {
    this.store.withLock(() => {
      this.store.clearState();
    });
  }

  public advanceWave(planId?: string): WaveAdvanceResult {
    return advanceWaveWithStore(this.store, planId);
  }
}
