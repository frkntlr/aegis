/**
 * @file teamwork-analysis-swarm-command.ts
 * CLI command handlers and MCP interfaces for Collaborative Concurrent Analysis Swarm.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  TeamworkAnalysisSwarm,
  TeamworkAnalysisMesh,
  type AnalysisSeverity,
  type AnalysisLens,
  type AnalysisCategory
} from '@aegis/orchestrator';
import { showBanner } from './banner.js';

export async function handleTeamworkAnalysisSwarm(objectiveArg?: string, ...args: string[]): Promise<void> {
  if (!objectiveArg?.trim()) {
    showBanner();
    console.error('❌ Usage: aegis tw:analyze:swarm "<objective>" [files...] [--json]');
    return;
  }

  const isJson = args.includes('--json') || args.includes('-j');
  const files = args.filter(a => a && !a.startsWith('-'));
  const swarm = new TeamworkAnalysisSwarm();
  const report = await swarm.runAnalysisSwarm(objectiveArg.trim(), files);

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  showBanner();
  console.log(swarm.formatExecutiveMatrix(report));
}

export async function mcpTeamworkAnalysisSwarm(args: Record<string, unknown> = {}): Promise<string> {
  const objective = String(args.objective || 'Codebase Analysis');
  const files = Array.isArray(args.files) ? args.files.map(String) : [];
  const swarm = new TeamworkAnalysisSwarm();
  const report = await swarm.runAnalysisSwarm(objective, files);
  return JSON.stringify(report, null, 2);
}

export function mcpAnalysisMeshQuery(args: Record<string, unknown> = {}): string {
  const mesh = new TeamworkAnalysisMesh();
  const lens = typeof args.lens === 'string' ? (args.lens as AnalysisLens) : undefined;
  const severity = typeof args.severity === 'string' ? (args.severity as AnalysisSeverity) : undefined;
  const target = typeof args.target === 'string' ? args.target : undefined;
  const results = mesh.query({ lens, severity, target });
  return JSON.stringify({ count: results.length, insights: results }, null, 2);
}

export function mcpAnalysisMeshPost(args: Record<string, unknown> = {}): string {
  const mesh = new TeamworkAnalysisMesh();
  const lens = (typeof args.lens === 'string' ? args.lens : 'ast') as AnalysisLens;
  const agent = String(args.agent || 'analysis-agent');
  const category = (typeof args.category === 'string' ? args.category : 'bottleneck') as AnalysisCategory;
  const severity = (typeof args.severity === 'string' ? args.severity : 'medium') as AnalysisSeverity;
  const target = String(args.target || 'general');
  const finding = String(args.finding || '');
  const actionableStep = typeof args.actionableStep === 'string' ? args.actionableStep : undefined;

  const insight = mesh.postInsight({ lens, agent, category, severity, target, finding, actionableStep });
  return JSON.stringify(insight, null, 2);
}
