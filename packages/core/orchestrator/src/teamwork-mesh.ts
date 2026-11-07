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

export interface WaveStatus {
  wave: number;
  total: number;
  done: number;
  blocked: number;
  pending: number;
  readyForNextWave: boolean;
  needsCorrection: boolean;
}

export { TeamworkMeshStore, type ActivityUpdate, type MeshConflict };

export class TeamworkMesh {
  private store: TeamworkMeshStore;

  constructor(repoRoot?: string, store?: TeamworkMeshStore) {
    this.store = store ?? new TeamworkMeshStore(repoRoot);
  }

  public getMeshPath(): string {
    return this.store.getMeshPath();
  }

  public getMeshState(): TeamworkMeshState {
    return this.store.loadState();
  }

  public initializeMesh(planId: string, objective: string, tracks: TeamworkTrack[]): TeamworkMeshState {
    return this.store.withLock(() => {
      const state = this.store.createInitialState(planId, objective, tracks);
      this.store.saveState(state);
      return state;
    });
  }

  public postActivity(agentId: string, update: ActivityUpdate): TeamworkPeerState {
    return this.store.withLock(() => {
      const state = this.store.loadState();
      const existing = state.agents[agentId] ?? this.store.createDefaultPeer(agentId);
      if (state.agents[agentId] && this.store.isNoopUpdate(existing, update)) return existing;

      const now = new Date().toISOString();
      const newContracts = (update.publishedContracts ?? []).filter(c => !existing.publishedContracts.includes(c));
      const updatedPeer = this.store.mergePeerUpdate(existing, update, now);

      state.agents[agentId] = updatedPeer;
      state.lastUpdated = now;

      if (update.modifiedFiles?.length) this.checkConflictWarning(state, agentId, update.modifiedFiles);
      if (update.activity || update.status) {
        const isM = update.status === 'milestone' || update.status === 'done';
        const eventType = isM ? (update.status === 'done' ? 'completed' : 'milestone') : 'heartbeat';
        this.store.appendEvent(state, agentId, eventType, update.activity ?? `Status: ${update.status}`);
      }
      if (newContracts.length > 0) {
        this.store.appendEvent(state, agentId, 'contract_update', `📜 Contract published: [${newContracts.join(', ')}]`, { contracts: newContracts });
      }
      if (update.status === 'blocked') {
        this.store.appendEvent(state, agentId, 'milestone', `⚠️ TASK_BLOCKED: @${agentId} is blocked: ${update.activity ?? 'Awaiting remediation'}`, {
          status: 'blocked',
          triggerFeedbackLoop: true,
          agentId
        });
      }
      if (update.status === 'done') this.checkWaveProgression(state);

      this.store.saveState(state);
      return updatedPeer;
    });
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

  public getCompactMeshState(sinceTimestamp?: string): string {
    const s = this.store.loadState();
    const lines: string[] = [`[MESH:${s.planId}|W${s.activeWave}|Peers:${Object.keys(s.agents).length}] ${s.objective}`];
    for (const p of Object.values(s.agents)) {
      const mod = p.modifiedFiles.length > 0 ? `|mod:[${p.modifiedFiles.join(',')}]` : '';
      const c = p.publishedContracts.length > 0 ? `|c:[${p.publishedContracts.join(',')}]` : '';
      lines.push(`@${p.subagentName}[${p.status}]:"${p.currentActivity}"${mod}${c}`);
    }
    const evts = sinceTimestamp ? s.events.filter(e => e.timestamp > sinceTimestamp) : s.events.slice(-5);
    if (evts.length > 0) {
      lines.push('EVENTS:');
      for (const e of evts) lines.push(`- [${e.timestamp.slice(11, 19)}] @${e.fromAgent}(${e.type}): ${e.message}`);
    }
    return lines.join('\n');
  }

  public listPeers(): TeamworkPeerState[] {
    return Object.values(this.store.loadState().agents);
  }

  public getEvents(limit = 20): TeamworkEvent[] {
    return this.store.loadState().events.slice(-limit);
  }

  public clearMesh(): void {
    this.store.withLock(() => {
      this.store.clearState();
    });
  }

  public advanceWave(planId?: string): { advanced: boolean; currentWave: number; nextWave: number; message: string } {
    return this.store.withLock(() => {
      const state = this.store.loadState();
      const oldWave = state.activeWave;
      state.activeWave += 1;
      state.lastUpdated = new Date().toISOString();
      const phaseNames: Record<number, string> = { 2: 'QA Hunter Verification', 3: 'Living Architecture Synthesis' };
      const nextPhase = phaseNames[state.activeWave] ?? 'Final Delivery';
      const msg = `🌊 Wave ${oldWave} completed! Wave ${state.activeWave} (${nextPhase}) unlocked.`;
      this.store.appendEvent(state, 'coordinator', 'milestone', msg, {
        eventName: 'WAVE_COMPLETED',
        fromWave: oldWave,
        toWave: state.activeWave,
        nextPhase,
        triggerReflection: true,
        planId: planId ?? state.planId
      });
      this.store.saveState(state);
      return { advanced: true, currentWave: oldWave, nextWave: state.activeWave, message: msg };
    });
  }

  private checkConflictWarning(state: TeamworkMeshState, agentId: string, modified: string[]): void {
    for (const [otherId, peer] of Object.entries(state.agents)) {
      if (otherId === agentId || peer.status === 'done') continue;
      const peerFiles = [...peer.lockedFiles, ...peer.modifiedFiles];
      const clash = modified.filter(f => peerFiles.some(pf => isLockConflict(f, pf)));
      if (clash.length > 0) {
        this.store.appendEvent(state, 'radar', 'milestone', `⚠️ CONFLICT_WARNING: @${agentId} touched [${clash.join(',')}] active on @${otherId}`);
      }
    }
  }

  private checkWaveProgression(state: TeamworkMeshState): void {
    const currentWave = state.activeWave;
    const peers = Object.values(state.agents).filter(p =>
      (p.phase ?? (p.currentActivity.includes(`Wave ${currentWave}`) ? currentWave : undefined)) === currentWave
    );
    if (peers.length > 0 && peers.every(p => p.status === 'done')) {
      const oldWave = state.activeWave;
      state.activeWave += 1;
      const phaseNames: Record<number, string> = { 2: 'QA Hunter Verification', 3: 'Living Architecture Synthesis' };
      const nextPhase = phaseNames[state.activeWave] ?? 'Final Delivery';
      this.store.appendEvent(state, 'coordinator', 'milestone', `🌊 Wave ${oldWave} completed! Wave ${state.activeWave} unlocked.`, {
        eventName: 'WAVE_COMPLETED',
        fromWave: oldWave,
        toWave: state.activeWave,
        nextPhase,
        triggerReflection: true
      });
    }
  }

  public getWaveStatus(wave?: number): WaveStatus {
    const s = this.store.loadState();
    const targetWave = wave ?? s.activeWave;
    const peers = Object.values(s.agents).filter(p =>
      (p.phase ?? (p.currentActivity.includes(`Wave ${targetWave}`) ? targetWave : undefined)) === targetWave
    );
    const done = peers.filter(p => p.status === 'done').length;
    const blocked = peers.filter(p => p.status === 'blocked').length;
    return {
      wave: targetWave,
      total: peers.length,
      done,
      blocked,
      pending: peers.length - done - blocked,
      readyForNextWave: peers.length > 0 && done === peers.length,
      needsCorrection: blocked > 0
    };
  }

  public isWaveComplete(wave?: number): boolean {
    return this.getWaveStatus(wave).readyForNextWave;
  }

  public isCorrectionNeeded(): boolean {
    return Object.values(this.store.loadState().agents).some(p => p.status === 'blocked');
  }
}
