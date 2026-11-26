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

type TeamworkMcpHandler = (args: Record<string, unknown>) => string | Promise<string>;

const TEAMWORK_TOOL_HANDLERS: Record<string, TeamworkMcpHandler> = {
  teamwork_plan: (args) => mcpTeamworkPlan(args),
  teamwork_status: () => mcpTeamworkStatus(),
  teamwork_compact: (args) => mcpTeamworkCompact(args),
  teamwork_analyze: (args) => mcpTeamworkAnalyze(args),
  teamwork_dag: (args) => mcpTeamworkDag(args),
  teamwork_mesh_read: (args) => mcpTeamworkMeshRead(args),
  teamwork_mesh_post: (args) => mcpTeamworkMeshPost(args),
  teamwork_broadcast: (args) => mcpTeamworkBroadcast(args),
  teamwork_peers: (args) => mcpTeamworkPeers(args),
  teamwork_waves: (args) => mcpTeamworkWaves(args),
  teamwork_conflicts: () => mcpTeamworkConflicts(),
  teamwork_scale: (args) => mcpTeamworkScale(args),
  teamwork_doc_synthesize: (args) => mcpTeamworkDocSynthesize(args),
  teamwork_tools: (args) => mcpTeamworkTools(args),
  teamwork_report: (args) => mcpTeamworkReport(args),
  teamwork_test: (args) => mcpTeamworkTest(args),
  teamwork_advance: (args) => mcpTeamworkAdvance(args),
  teamwork_clear: () => mcpTeamworkClear(),
  teamwork_matrix: (args) => mcpTeamworkMatrix(args),
  teamwork_batch: (args) => mcpTeamworkBatch(args),
  teamwork_deliberate: (args) => mcpTeamworkDeliberate(args),
  teamwork_swarm: (args) => mcpTeamworkAnalysisSwarm(args)
};

export async function executeTeamworkTool(canonical: string, args: Record<string, unknown>): Promise<string | null> {
  const handler = TEAMWORK_TOOL_HANDLERS[canonical];
  if (!handler) return null;
  return await handler(args);
}
