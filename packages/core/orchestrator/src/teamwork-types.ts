/**
 * @file teamwork-types.ts
 * Type definitions and contracts for Aegis Antigravity Teamwork.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';
import type { SubagentProfile } from './teamwork-prompts.js';

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
}

export interface TeamworkPlan {
  planId: string;
  objective: string;
  createdAt: string;
  tracks: TeamworkTrack[];
  summary: string;
  discoveredFiles?: string[];
}

export interface TeamworkStatusReport {
  activeTracksCount: number;
  lockedFilesCount: number;
  pendingInboxCount: number;
  profiles: SubagentProfile[];
  locks: Record<string, string>;
}
