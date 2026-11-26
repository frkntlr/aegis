/**
 * @file teamwork-mesh-store.ts
 * State construction, peer merging, and event helpers for Dynamic Teamwork Mesh.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as crypto from 'node:crypto';
import type { TeamworkTrack, TeamworkPeerState, TeamworkEvent, TeamworkMeshState } from './teamwork-types.js';
import { TeamworkMeshPersistence } from './teamwork-mesh-persistence.js';
import { buildEmptyMeshState, type ActivityUpdate, type MeshConflict } from './teamwork-mesh-helpers.js';

export type { ActivityUpdate, MeshConflict };

export class TeamworkMeshStore extends TeamworkMeshPersistence {
  constructor(repoRoot?: string) {
    super(repoRoot);
  }

  public createEmptyState(): TeamworkMeshState {
    return buildEmptyMeshState();
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
