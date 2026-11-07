/**
 * @file teamwork-mesh-store.ts
 * Atomic file persistence and state operations for Dynamic Teamwork Mesh.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeMutex } from './worktree-mutex.js';
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

interface ProcessMeshCache {
  state: TeamworkMeshState;
  mtimeMs: number;
  size: number;
}

export class TeamworkMeshStore {
  private static processCache = new Map<string, ProcessMeshCache>();
  private repoRoot: string;
  private meshFile: string;

  constructor(repoRoot?: string) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
    this.meshFile = path.resolve(this.repoRoot, '.aegis', 'teamwork-mesh.json');
  }

  public getMeshPath(): string {
    return this.meshFile;
  }

  public withLock<T>(fn: () => T): T {
    const unlock = WorktreeMutex.acquire(this.meshFile);
    try {
      return fn();
    } finally {
      unlock();
    }
  }

  public invalidateCache(): void {
    TeamworkMeshStore.processCache.delete(this.meshFile);
  }

  public getCachedState(): TeamworkMeshState | undefined {
    const entry = TeamworkMeshStore.processCache.get(this.meshFile);
    return entry ? this.cloneSnapshot(entry.state) : undefined;
  }

  public loadMesh(force = false): TeamworkMeshState {
    try {
      const stat = fs.statSync(this.meshFile);
      const cached = TeamworkMeshStore.processCache.get(this.meshFile);
      if (!force && cached && stat.mtimeMs === cached.mtimeMs && stat.size === cached.size) {
        return this.cloneSnapshot(cached.state);
      }
      const raw = fs.readFileSync(this.meshFile, 'utf8');
      const state = this.parseMeshPayload(raw);
      TeamworkMeshStore.processCache.set(this.meshFile, {
        state: this.cloneSnapshot(state),
        mtimeMs: stat.mtimeMs,
        size: stat.size
      });
      return this.cloneSnapshot(state);
    } catch {
      TeamworkMeshStore.processCache.delete(this.meshFile);
      return this.createEmptyState();
    }
  }

  public loadState(force = false): TeamworkMeshState {
    return this.loadMesh(force);
  }

  public saveMesh(state: TeamworkMeshState): void {
    this.saveState(state);
  }

  public saveState(state: TeamworkMeshState): void {
    const dir = path.dirname(this.meshFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = JSON.stringify(state, null, 2);
    const maxRetries = 5;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const nonce = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const tmp = `${this.meshFile}.tmp-${nonce}`;
      try {
        fs.writeFileSync(tmp, payload, { encoding: 'utf8', flush: true });
        try {
          fs.renameSync(tmp, this.meshFile);
        } catch {
          fs.copyFileSync(tmp, this.meshFile);
          try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
        }
        const stat = fs.statSync(this.meshFile);
        TeamworkMeshStore.processCache.set(this.meshFile, {
          state: this.cloneSnapshot(state),
          mtimeMs: stat.mtimeMs,
          size: stat.size
        });
        return;
      } catch (err) {
        try { if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
        if (attempt === maxRetries - 1) throw err;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (attempt + 1) * 15);
      }
    }
  }

  public clearMesh(): void {
    this.clearState();
  }

  public clearState(): void {
    TeamworkMeshStore.processCache.delete(this.meshFile);
    if (fs.existsSync(this.meshFile)) {
      try { fs.unlinkSync(this.meshFile); } catch { /* ignore */ }
    }
  }

  private parseMeshPayload(raw: string): TeamworkMeshState {
    const p = JSON.parse(raw) as Partial<TeamworkMeshState>;
    return {
      planId: typeof p.planId === 'string' ? p.planId : 'default',
      objective: typeof p.objective === 'string' ? p.objective : '',
      activeWave: typeof p.activeWave === 'number' ? p.activeWave : 1,
      agents: p.agents && typeof p.agents === 'object' ? p.agents : {},
      events: Array.isArray(p.events) ? p.events : [],
      lastUpdated: typeof p.lastUpdated === 'string' ? p.lastUpdated : new Date().toISOString()
    };
  }

  private cloneSnapshot(state: TeamworkMeshState): TeamworkMeshState {
    const clonedAgents: Record<string, TeamworkPeerState> = {};
    for (const [key, peer] of Object.entries(state.agents)) {
      clonedAgents[key] = {
        ...peer,
        lockedFiles: [...peer.lockedFiles],
        modifiedFiles: [...peer.modifiedFiles],
        publishedContracts: [...peer.publishedContracts]
      };
    }
    return {
      planId: state.planId,
      objective: state.objective,
      activeWave: state.activeWave,
      agents: clonedAgents,
      events: state.events.map(e => ({ ...e, payload: e.payload ? { ...e.payload } : undefined })),
      lastUpdated: state.lastUpdated
    };
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
        updatedAt: now,
        phase: track.phase
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
