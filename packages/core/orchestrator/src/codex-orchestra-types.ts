import type { CodexInvocationPayload } from './codex-teamwork.js';

export type OrchestraTaskState = 'pending' | 'reserved' | 'running' | 'waiting' | 'deferred' | 'done' | 'failed' | 'blocked';
export interface OrchestraDeferralInput {
  reason: string;
  checkpoint: string;
  resumeAfter: string;
  agentStopped: true;
}
export interface OrchestraRecovery extends OrchestraDeferralInput {
  deferredAt: string;
  lastAgentId?: string;
}
export interface OrchestraRecoveryStatus {
  runId: string;
  state: OrchestraRun['state'];
  checkedAt: string;
  deferred: Array<OrchestraRecovery & { taskId: string; due: boolean }>;
  nextResumeAfter?: string;
}
export interface OrchestraOptions {
  maxWorkers: number;
  maxDepth?: number;
  mode?: 'brokered' | 'nested' | 'sequential';
}
export interface OrchestraTaskInput {
  id: string;
  title: string;
  targetFiles: string[];
  dependsOn?: string[];
}
export interface OrchestraTask extends OrchestraTaskInput {
  dependsOn: string[];
  state: OrchestraTaskState;
  parentId?: string;
  depth: number;
  phase: number;
  agentId?: string;
  evidence?: string;
  reservationId?: string;
  children: string[];
  message?: string;
  recovery?: OrchestraRecovery;
}
export interface OrchestraRun {
  id: string;
  planId: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  options: Required<OrchestraOptions>;
  tasks: OrchestraTask[];
  state: 'pending' | 'active' | 'done' | 'failed';
}
export interface OrchestraDispatch {
  taskId: string;
  action: 'spawn' | 'resume';
  agentId?: string;
  parentId?: string;
  dispatchOwnerId: string;
  reservationId: string;
  codexInvocationPayload: CodexInvocationPayload;
}
