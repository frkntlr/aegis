/**
 * @file teamwork-mcp-dispatcher.ts
 * MCP Tool execution dispatcher for Antigravity Teamwork subsystem.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { TeamworkReportGenerator } from '@aegis/orchestrator';
import {
  mcpTeamworkPlan,
  mcpTeamworkStatus,
  mcpTeamworkCompact,
  mcpTeamworkAnalyze,
  mcpTeamworkDag
} from './teamwork-command.js';
import {
  mcpTeamworkMeshRead,
  mcpTeamworkMeshPost,
  mcpTeamworkBroadcast,
  mcpTeamworkPeers,
  mcpTeamworkWaves,
  mcpTeamworkConflicts,
  mcpTeamworkScale,
  mcpTeamworkDocSynthesize,
  mcpTeamworkTools,
  mcpTeamworkAdvance,
  mcpTeamworkClear,
  mcpTeamworkMatrix,
  mcpTeamworkBatch,
  mcpTeamworkTest
} from './teamwork-mesh-mcp.js';
import { mcpTeamworkDeliberate } from './teamwork-deliberate-command.js';
import { mcpTeamworkAnalysisSwarm } from './teamwork-analysis-swarm-command.js';

export function mcpTeamworkReport(args: Record<string, unknown> = {}): string {
  const planId = typeof args.planId === 'string' && args.planId ? args.planId : undefined;
  const isCompact = args.compact === true;
  const isJson = args.json === true;
  const generator = new TeamworkReportGenerator();
  const saveResult = args.save === true ? generator.saveReport(planId) : undefined;
  if (isJson) {
    const data = generator.generate(planId);
    if (saveResult) data.savedPath = saveResult.relativePath;
    return JSON.stringify(data, null, 2);
  }
  if (isCompact) {
    const text = generator.generateCompact(planId);
    return saveResult ? `${text}\n📄 Report saved to: ${saveResult.relativePath}` : text;
  }
  const text = generator.generateMarkdown(planId);
  return saveResult ? `${text}\n\n📄 Report saved to: ${saveResult.relativePath}` : text;
}

export async function executeTeamworkTool(canonical: string, args: Record<string, unknown>): Promise<string | null> {
  switch (canonical) {
    case 'teamwork_plan': return mcpTeamworkPlan(args);
    case 'teamwork_status': return mcpTeamworkStatus();
    case 'teamwork_compact': return mcpTeamworkCompact(args);
    case 'teamwork_analyze': return mcpTeamworkAnalyze(args);
    case 'teamwork_dag': return mcpTeamworkDag(args);
    case 'teamwork_mesh_read': return mcpTeamworkMeshRead(args);
    case 'teamwork_mesh_post': return mcpTeamworkMeshPost(args);
    case 'teamwork_broadcast': return mcpTeamworkBroadcast(args);
    case 'teamwork_peers': return mcpTeamworkPeers(args);
    case 'teamwork_waves': return mcpTeamworkWaves(args);
    case 'teamwork_conflicts': return mcpTeamworkConflicts();
    case 'teamwork_scale': return mcpTeamworkScale(args);
    case 'teamwork_doc_synthesize': return mcpTeamworkDocSynthesize(args);
    case 'teamwork_tools': return mcpTeamworkTools(args);
    case 'teamwork_report': return mcpTeamworkReport(args);
    case 'teamwork_test': return await mcpTeamworkTest(args);
    case 'teamwork_advance': return mcpTeamworkAdvance(args);
    case 'teamwork_clear': return mcpTeamworkClear();
    case 'teamwork_matrix': return mcpTeamworkMatrix(args);
    case 'teamwork_batch': return mcpTeamworkBatch(args);
    case 'teamwork_deliberate': return mcpTeamworkDeliberate(args);
    case 'teamwork_swarm': return await mcpTeamworkAnalysisSwarm(args);
    default: return null;
  }
}
