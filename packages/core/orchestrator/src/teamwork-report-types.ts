/**
 * @file teamwork-report-types.ts
 * Type definitions and contracts for Aegis Teamwork Reporting.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { TeamworkPeerState } from './teamwork-types.js';

export interface QualityGateAuditSummary {
  demirKafesCompliant: boolean;
  maxLinesPerFile: number;
  observedMaxFileLines: number;
  maxLinesPerFunction: number;
  observedMaxFuncLines: number;
  anyCount: number;
  testPassRatePercent: number;
  verdict: 'PASS' | 'FAIL';
  filesChecked: number;
}

export interface GroundTruthFacts {
  planId: string;
  objective: string;
  activeWave: number;
  lastUpdated: string;
  startedAt: string;
  durationMs: number;
  formattedDuration: string;
  concurrencyFactor: number;
  git: { commit: string; branch: string; isClean: boolean };
  peers: TeamworkPeerState[];
  subagentCounts: {
    total: number;
    done: number;
    working: number;
    blocked: number;
    milestone: number;
    pending: number;
  };
  modifiedFiles: string[];
  publishedContracts: string[];
  qualityGate: QualityGateAuditSummary;
  adrs: string[];
  recommendations: string[];
  savedPath?: string;
}

export interface TeamworkJsonReport {
  planId: string;
  objective: string;
  activeWave: number;
  timestamp: string;
  duration: { elapsedMs: number; formatted: string; startedAt: string };
  concurrency: {
    factor: number;
    totalAgents: number;
    activeAgents: number;
    doneAgents: number;
    blockedAgents: number;
  };
  blastRadius: {
    modifiedFiles: string[];
    modifiedFilesCount: number;
    publishedContracts: string[];
    publishedContractsCount: number;
  };
  git: { commit: string; branch: string; isClean: boolean };
  agents: Array<{
    agentId: string;
    subagentName: string;
    role: string;
    status: string;
    currentActivity: string;
    modifiedFiles: string[];
    publishedContracts: string[];
    updatedAt: string;
  }>;
  qualityGate: QualityGateAuditSummary;
  adrs: string[];
  recommendations: string[];
  savedPath?: string;
}

export interface SaveReportResult {
  filePath: string;
  bytes: number;
  relativePath: string;
}

