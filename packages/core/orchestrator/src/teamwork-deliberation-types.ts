/**
 * @file teamwork-deliberation-types.ts
 * Types for Multi-Agent Deliberation, Blackboard Consensus, and Semantic AI Decomposition.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { RoleType } from './role-classifier.js';

export type ArchitecturalDomain =
  | 'state_machine'
  | 'data_flow'
  | 'api_surface'
  | 'validation_safety'
  | 'ui_presentation'
  | 'infrastructure'
  | 'documentation';

export type DeliberationRole = 'lead' | 'solver' | 'qa' | 'ui' | 'docs';

export type CritiqueVerdict = 'endorse' | 'concern' | 'refine' | 'reject';

export type CritiqueRisk = 'low' | 'medium' | 'high';

export type ConsensusStatus = 'consensus_reached' | 'converged' | 'stalemate' | 'refined';

export interface DeliberationHypothesis {
  id: string;
  role: DeliberationRole;
  domain: ArchitecturalDomain;
  strategy: string;
  tradeoffs: string[];
  confidence: number;
  suggestedFiles: string[];
  timestamp: string;
}

export interface PeerCritique {
  id: string;
  hypothesisId: string;
  reviewerRole: DeliberationRole;
  verdict: CritiqueVerdict;
  riskLevel: CritiqueRisk;
  critique: string;
  suggestedRemedy?: string;
  timestamp: string;
}

export interface DeliberationConsensus {
  status: ConsensusStatus;
  consensusScore: number;
  agreedStrategy: string;
  resolvedTradeoffs: string[];
  participatingRoles: DeliberationRole[];
}

export interface SemanticDecompositionItem {
  id: string;
  domain: ArchitecturalDomain;
  role: RoleType;
  label: string;
  title: string;
  rationale: string;
  stateTransitions: string[];
  dataFlows: string[];
  targetFiles: string[];
  dependsOn: string[];
  phase: number;
}

export interface DeliberationResult {
  deliberationId: string;
  objective: string;
  timestamp: string;
  domains: ArchitecturalDomain[];
  stateTransitions: string[];
  dataFlows: string[];
  hypotheses: DeliberationHypothesis[];
  critiques: PeerCritique[];
  consensus: DeliberationConsensus;
  tasks: SemanticDecompositionItem[];
  meshRecorded: boolean;
  durationMs: number;
}

export interface DeliberationOptions {
  files?: string[];
  persistMesh?: boolean;
  minConsensusScore?: number;
  roles?: DeliberationRole[];
  depth?: 'quick' | 'standard' | 'deep';
}
