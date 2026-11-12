import type { CodexInvocationPayload } from './codex-teamwork.js';

export type OrchestraTaskState = 'pending' | 'reserved' | 'running' | 'waiting' | 'done' | 'failed' | 'blocked';
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
