/**
 * @file teamwork-mesh.ts
 * Real-time Dynamic Teamwork Mesh & Blackboard for concurrent subagents.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { TeamworkTrack, TeamworkPeerState, TeamworkEvent, TeamworkMeshState } from './teamwork-types.js';
import {
  TeamworkMeshStore,
  type ActivityUpdate,
  type MeshConflict
} from './teamwork-mesh-store.js';

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
    const state = this.store.createInitialState(planId, objective, tracks);
    this.store.saveState(state);
    return state;
  }

  public postActivity(agentId: string, update: ActivityUpdate): TeamworkPeerState {
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
    if (update.status === 'done') this.checkWaveProgression(state);

    this.store.saveState(state);
    return updatedPeer;
  }

  public broadcastEvent(fromAgent: string, message: string, type: TeamworkEvent['type'] = 'broadcast', payload?: Record<string, unknown>): TeamworkEvent {
    const state = this.store.loadState();
    const event = this.store.appendEvent(state, fromAgent, type, message, payload);
    state.lastUpdated = new Date().toISOString();
    this.store.saveState(state);
    return event;
  }

  public detectConflicts(): MeshConflict[] {
    const owners = new Map<string, Set<string>>();
    for (const peer of Object.values(this.store.loadState().agents)) {
      for (const f of new Set([...peer.lockedFiles, ...peer.modifiedFiles])) {
        const set = owners.get(f) ?? new Set<string>();
        set.add(peer.subagentName);
        owners.set(f, set);
      }
    }
    return Array.from(owners.entries())
      .filter(([, o]) => o.size > 1)
      .map(([file, o]) => ({ file, agents: Array.from(o) }));
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
    this.store.clearState();
  }

  public advanceWave(planId?: string): { advanced: boolean; currentWave: number; nextWave: number; message: string } {
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
      planId: planId ?? state.planId
    });
    this.store.saveState(state);
    return { advanced: true, currentWave: oldWave, nextWave: state.activeWave, message: msg };
  }

  private checkConflictWarning(state: TeamworkMeshState, agentId: string, modified: string[]): void {
    const modSet = new Set(modified);
    for (const [otherId, peer] of Object.entries(state.agents)) {
      if (otherId === agentId || peer.status === 'done') continue;
      const clash = Array.from(modSet).filter(f => new Set([...peer.lockedFiles, ...peer.modifiedFiles]).has(f));
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
      this.store.appendEvent(state, 'coordinator', 'milestone', `🌊 Wave ${oldWave} completed! Wave ${state.activeWave} unlocked.`);
    }
  }
}
