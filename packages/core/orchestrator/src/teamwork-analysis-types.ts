/**
 * @file teamwork-analysis-types.ts
 * Type definitions for Collaborative Concurrent Analysis Swarm and Shared Working Memory Mesh.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export type AnalysisLens = 'ast' | 'triage' | 'relation' | 'grounding' | 'ui';

export type AnalysisCategory =
  | 'bottleneck'
  | 'flaw'
  | 'coupling'
  | 'contract'
  | 'recommendation'
  | 'ui_defect'
  | 'responsive_risk';

export type AnalysisSeverity = 'critical' | 'high' | 'medium' | 'info';

export interface AnalysisInsight {
  id: string;
  lens: AnalysisLens;
  agent: string;
  category: AnalysisCategory;
  severity: AnalysisSeverity;
  target: string;
  finding: string;
  evidence?: string;
  actionableStep?: string;
  timestamp: string;
}

export interface AnalysisMeshFilter {
  lens?: AnalysisLens;
  severity?: AnalysisSeverity;
  target?: string;
  category?: AnalysisCategory;
}

export interface AnalysisMeshState {
  version: string;
  swarmId: string;
  objective: string;
  insights: Record<string, AnalysisInsight>;
  hotspots: string[];
  lastUpdated: string;
}

export interface LensExecutionResult {
  lens: AnalysisLens;
  agent: string;
  durationMs: number;
  insights: AnalysisInsight[];
}

export interface AnalysisSwarmReport {
  swarmId: string;
  objective: string;
  durationMs: number;
  totalInsights: number;
  criticalRisks: AnalysisInsight[];
  architecturalHotspots: string[];
  recommendedActions: string[];
  executiveSummary: string;
  insights: AnalysisInsight[];
}

export interface AnalysisSwarmOptions {
  files?: string[];
  lenses?: AnalysisLens[];
  persistMesh?: boolean;
  maxConcurrency?: number;
}
