/**
 * @file teamwork-mesh-store.ts
 * Atomic file persistence and state operations for Dynamic Teamwork Mesh.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { resolveSafeRepoRoot } from '@aegis/shared';
import type { TeamworkTrack, TeamworkPeerState, TeamworkEvent, TeamworkMeshState } from './teamwork-types.js';

export interface ActivityUpdate {
  status?: 'working' | 'milestone' | 'blocked' | 'done';
  activity?: string;
  modifiedFiles?: string[];
  publishedContracts?: string[];
}

export interface MeshConflict {
  file: string;
  agents: string[];
}

export class TeamworkMeshStore {
  private repoRoot: string;
  private meshFile: string;
  private cachedState?: TeamworkMeshState;
  private cachedMtimeMs = 0;

  constructor(repoRoot?: string) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.meshFile = path.resolve(this.repoRoot, '.aegis', 'teamwork-mesh.json');
  }

  public getMeshPath(): string {
    return this.meshFile;
  }

  public loadState(): TeamworkMeshState {
    if (!fs.existsSync(this.meshFile)) {
      this.cachedState = undefined;
      this.cachedMtimeMs = 0;
      return this.createEmptyState();
    }
    try {
      const stat = fs.statSync(this.meshFile);
      if (this.cachedState && stat.mtimeMs === this.cachedMtimeMs) return this.cachedState;
      const raw = fs.readFileSync(this.meshFile, 'utf8');
      const p = JSON.parse(raw) as Partial<TeamworkMeshState>;
      const state: TeamworkMeshState = {
        planId: typeof p.planId === 'string' ? p.planId : 'default',
        objective: typeof p.objective === 'string' ? p.objective : '',
        activeWave: typeof p.activeWave === 'number' ? p.activeWave : 1,
        agents: p.agents && typeof p.agents === 'object' ? p.agents : {},
        events: Array.isArray(p.events) ? p.events : [],
        lastUpdated: typeof p.lastUpdated === 'string' ? p.lastUpdated : new Date().toISOString()
      };
      this.cachedState = state;
      this.cachedMtimeMs = stat.mtimeMs;
      return state;
    } catch {
      return this.createEmptyState();
    }
  }

  public saveState(state: TeamworkMeshState): void {
    const dir = path.dirname(this.meshFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.meshFile}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const payload = JSON.stringify(state, null, 2);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.writeFileSync(tmp, payload, 'utf8');
        fs.renameSync(tmp, this.meshFile);
        this.cachedState = state;
        try { this.cachedMtimeMs = fs.statSync(this.meshFile).mtimeMs; } catch { this.cachedMtimeMs = Date.now(); }
        return;
      } catch (err) {
        if (attempt === 2) throw err;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (attempt + 1) * 10);
      }
    }
  }

  public clearState(): void {
    this.cachedState = undefined;
    this.cachedMtimeMs = 0;
    if (fs.existsSync(this.meshFile)) {
      try { fs.unlinkSync(this.meshFile); } catch { /* ignore */ }
    }
  }

  public createEmptyState(): TeamworkMeshState {
    return { planId: 'idle', objective: '', activeWave: 0, agents: {}, events: [], lastUpdated: new Date().toISOString() };
  }

  public createInitialState(planId: string, objective: string, tracks: TeamworkTrack[]): TeamworkMeshState {
    const now = new Date().toISOString();
    const agents: Record<string, TeamworkPeerState> = {};
    for (const track of tracks) {
      const key = track.subagentName || track.id;
      agents[key] = {
        agentId: key,
        role: track.roleType,
        subagentName: track.subagentName,
        status: 'pending',
        currentActivity: `Wave ${track.phase}`,
        lockedFiles: [...track.targetFiles],
        modifiedFiles: [],
        publishedContracts: [],
        updatedAt: now
      };
    }
    const initEvent: TeamworkEvent = {
      id: `evt-init-${Date.now().toString(36)}`,
      timestamp: now,
      fromAgent: 'coordinator',
      type: 'milestone',
      message: `Mesh initialized for ${planId}: "${objective.slice(0, 60)}"`
    };
    return { planId, objective, activeWave: 1, agents, events: [initEvent], lastUpdated: now };
  }

  public createDefaultPeer(agentId: string): TeamworkPeerState {
    return {
      agentId,
      role: 'solver',
      subagentName: agentId,
      status: 'working',
      currentActivity: 'Active',
      lockedFiles: [],
      modifiedFiles: [],
      publishedContracts: [],
      updatedAt: new Date().toISOString()
    };
  }

  public isNoopUpdate(existing: TeamworkPeerState | undefined, update: ActivityUpdate): boolean {
    if (!existing) return false;
    return (!update.status || update.status === existing.status) &&
      (!update.activity || update.activity === existing.currentActivity) &&
      (!update.modifiedFiles || update.modifiedFiles.length === 0) &&
      (!update.publishedContracts || update.publishedContracts.length === 0);
  }

  public mergePeerUpdate(existing: TeamworkPeerState, update: ActivityUpdate, now: string): TeamworkPeerState {
    return {
      ...existing,
      status: update.status ?? existing.status,
      currentActivity: update.activity ?? existing.currentActivity,
      modifiedFiles: update.modifiedFiles
        ? Array.from(new Set([...existing.modifiedFiles, ...update.modifiedFiles]))
        : existing.modifiedFiles,
      publishedContracts: update.publishedContracts
        ? Array.from(new Set([...existing.publishedContracts, ...update.publishedContracts]))
        : existing.publishedContracts,
      updatedAt: now
    };
  }

  public appendEvent(
    state: TeamworkMeshState,
    fromAgent: string,
    type: TeamworkEvent['type'],
    message: string,
    payload?: Record<string, unknown>
  ): TeamworkEvent {
    const event: TeamworkEvent = {
      id: `evt-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      fromAgent,
      type,
      message,
      payload
    };
    state.events.push(event);
    if (state.events.length > 100) state.events = state.events.slice(-100);
    return event;
  }
}
