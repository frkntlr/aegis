/**
 * @file teamwork-mesh-reader.ts
 * Read-only query and wave inspection methods for Dynamic Teamwork Mesh.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { TeamworkPeerState, TeamworkEvent, TeamworkMeshState } from './teamwork-types.js';
import { TeamworkMeshStore } from './teamwork-mesh-store.js';
import { inspectWaveReadinessHelper, type WaveStatus } from './teamwork-mesh-waves.js';

export class TeamworkMeshReader {
  protected store: TeamworkMeshStore;

  constructor(repoRoot?: string, store?: TeamworkMeshStore) {
    this.store = store ?? new TeamworkMeshStore(repoRoot);
  }

  public getMeshPath(): string {
    return this.store.getMeshPath();
  }

  public getMeshState(): TeamworkMeshState {
    return this.store.loadState();
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

  public inspectWaveReadiness(state: TeamworkMeshState, wave: number): {
    status: WaveStatus;
    blockedAgents: string[];
    pendingAgents: string[];
    readinessReport: string;
  } {
    return inspectWaveReadinessHelper(state, wave);
  }

  public getWaveStatus(wave?: number): WaveStatus {
    const s = this.store.loadState();
    return this.inspectWaveReadiness(s, wave ?? s.activeWave).status;
  }

  public isWaveComplete(wave?: number): boolean {
    return this.getWaveStatus(wave).readyForNextWave;
  }

  public isCorrectionNeeded(): boolean {
    return Object.values(this.store.loadState().agents).some(p => p.status === 'blocked');
  }
}
