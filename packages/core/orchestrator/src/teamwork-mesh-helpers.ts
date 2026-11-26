/**
 * @file teamwork-mesh-helpers.ts
 * Pure state parsing, cloning, and shared mesh data types.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { safeParseJson } from '@aegis/shared';
import type { TeamworkMeshState, TeamworkPeerState } from './teamwork-types.js';

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

export function parseMeshPayload(raw: string): TeamworkMeshState {
  const p = safeParseJson<Partial<TeamworkMeshState>>(raw);
  return {
    planId: typeof p.planId === 'string' ? p.planId : 'default',
    objective: typeof p.objective === 'string' ? p.objective : '',
    activeWave: typeof p.activeWave === 'number' ? p.activeWave : 1,
    agents: p.agents && typeof p.agents === 'object' ? p.agents : {},
    events: Array.isArray(p.events) ? p.events : [],
    lastUpdated: typeof p.lastUpdated === 'string' ? p.lastUpdated : new Date().toISOString()
  };
}

export function cloneMeshSnapshot(state: TeamworkMeshState): TeamworkMeshState {
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

export function buildEmptyMeshState(): TeamworkMeshState {
  return {
    planId: 'idle',
    objective: '',
    activeWave: 0,
    agents: {},
    events: [],
    lastUpdated: new Date().toISOString()
  };
}
