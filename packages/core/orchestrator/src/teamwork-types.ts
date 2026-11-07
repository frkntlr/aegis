/**
 * @file teamwork-types.ts
 * Type definitions and contracts for Aegis Antigravity Teamwork.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';
import type { SubagentProfile } from './teamwork-prompts.js';
import type { ComplexityAnalysisResult } from './task-complexity-analyzer.js';

export interface AntigravityInvocationPayload {
  TypeName: string;
  Role: string;
  Prompt: string;
  Workspace: 'share' | 'branch' | 'inherit';
  Model: 'inherit' | 'flash_lite' | 'flash' | 'pro';
}

export interface TeamworkTrack {
  id: string;
  roleType: RoleType;
  subagentName: string;
  title: string;
  targetFiles: string[];
  prompt: string;
  invocationPayload: AntigravityInvocationPayload;
  dependsOn: string[];
  phase: number;
  assignedAegisTools?: string[];
}

export interface TeamworkPlan {
  planId: string;
  objective: string;
  createdAt: string;
  tracks: TeamworkTrack[];
  summary: string;
  discoveredFiles?: string[];
  complexity?: ComplexityAnalysisResult;
}

export interface TeamworkStatusReport {
  activeTracksCount: number;
  lockedFilesCount: number;
  pendingInboxCount: number;
  profiles: SubagentProfile[];
  locks: Record<string, string>;
}

export interface TeamworkPeerState {
  agentId: string;
  role: RoleType;
  subagentName: string;
  status: 'pending' | 'working' | 'milestone' | 'blocked' | 'done';
  currentActivity: string;
  lockedFiles: string[];
  modifiedFiles: string[];
  publishedContracts: string[];
  updatedAt: string;
}

export interface TeamworkEvent {
  id: string;
  timestamp: string;
  fromAgent: string;
  type: 'heartbeat' | 'milestone' | 'contract_update' | 'broadcast' | 'completed';
  message: string;
  payload?: Record<string, unknown>;
}

export interface TeamworkMeshState {
  planId: string;
  objective: string;
  activeWave: number;
  agents: Record<string, TeamworkPeerState>;
  events: TeamworkEvent[];
  lastUpdated: string;
}

export interface ExecutionWave {
  waveNumber: number;
  phaseName: string;
  tracks: TeamworkTrack[];
  canRunConcurrently: boolean;
  requiredPriorWaves: number[];
}

export interface HumanArchitecturalBriefing {
  planId: string;
  objective: string;
  executiveSummary: string;
  mermaidDiagram: string;
  metrics: {
    tokenSavingsPercent: number;
    meshReadLatencyMs: number;
    concurrencyFactor: number;
    totalFilesModified: number;
    totalContractsPublished: number;
  };
  qualityGate: {
    demirKafesCompliant: boolean;
    maxLinesPerFile: number;
    maxLinesPerFunction: number;
    anyCount: number;
    testPassRatePercent: number;
  };
  adrDecisions: string[];
}

