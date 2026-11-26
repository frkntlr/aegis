/**
 * @file mcp-tool-dispatcher.ts
 * MCP Tool definitions, execution routing and subsystem dispatchers.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { GodotMcpProvider } from '@aegis/godot-bridge';
import { mcpTaskList, mcpTaskClaim, mcpTaskRelease, mcpTaskInboxPull, mcpLockStatus } from './task-commands.js';
import { executeTeamworkTool } from './teamwork-mcp-dispatcher.js';
import { CORE_MCP_TOOLS } from './mcp-tool-definitions.js';
import { executeMemoryTool, executeAstTool, executeQualityTool } from './mcp-code-handlers.js';
import { executeUtilityTool } from './mcp-utility-handlers.js';

export { CORE_MCP_TOOLS };

export const MCP_TOOLS = [
  ...CORE_MCP_TOOLS,
  ...GodotMcpProvider.getToolDefinitions().map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.parameters
  }))
];

type McpToolHandler = (args: Record<string, unknown>) => string | Promise<string>;

async function handleRfcPipelineTool(args: Record<string, unknown>): Promise<string> {
  const { handleRfcPipeline } = await import('./rfc-pipeline-command.js');
  await handleRfcPipeline(String(args.rfc || ''), args.description ? String(args.description) : undefined);
  return JSON.stringify({ status: 'ok', rfc: args.rfc }, null, 2);
}

async function handleGitPushTool(args: Record<string, unknown>): Promise<string> {
  const { mcpGitPush } = await import('./git-push-command.js');
  return mcpGitPush(args);
}

const DIRECT_MCP_HANDLERS: Record<string, McpToolHandler> = {
  find_symbol: (args) => executeMemoryTool('find_symbol', args),
  trace_relational: (args) => executeMemoryTool('trace_relational', args),
  skeleton_extract: (args) => executeAstTool('skeleton_extract', args),
  budget_inspect: (args) => executeQualityTool('budget_inspect', args),
  cage_check: (args) => executeQualityTool('cage_check', args),
  triage: (args) => executeQualityTool('triage', args),
  task_list: (args) => mcpTaskList(args),
  task_claim: (args) => mcpTaskClaim(args),
  task_release: (args) => mcpTaskRelease(args),
  task_inbox_pull: (args) => mcpTaskInboxPull(args),
  lock_status: () => mcpLockStatus(),
  github_rfc_pipeline: handleRfcPipelineTool,
  git_push: handleGitPushTool,
  teamwork_push: handleGitPushTool
};

export async function executeMcpTool(name: string, args: Record<string, unknown> = {}): Promise<string> {
  if (name.startsWith('aegis_godot_')) return GodotMcpProvider.handleToolCall(name, args);
  if (name.startsWith('memory_')) return executeMemoryTool(name, args);
  if (name.startsWith('ast_')) return executeAstTool(name, args);
  const canonical = name.replace(/^(tr|tw)_/, 'teamwork_');
  const directHandler = DIRECT_MCP_HANDLERS[name] ?? DIRECT_MCP_HANDLERS[canonical];
  if (directHandler) return await directHandler(args);
  const twResult = await executeTeamworkTool(canonical, args);
  if (twResult !== null) return twResult;
  return executeUtilityTool(name, args);
}
