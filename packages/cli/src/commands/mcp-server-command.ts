/**
 * @file mcp-server-command.ts
 * JSON-RPC stdio MCP Server loop and request handlers.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as readline from 'node:readline';
import { CORE_MCP_TOOLS, MCP_TOOLS, executeMcpTool } from './mcp-tool-dispatcher.js';

export { CORE_MCP_TOOLS, MCP_TOOLS, executeMcpTool };

export interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export async function handleJsonRpc(req: JsonRpcRequest): Promise<Record<string, unknown> | null> {
  if (req.method === 'notifications/initialized') return null;

  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'aegis', version: '0.1.0' } }
    };
  }

  if (req.method === 'tools/list') {
    return { jsonrpc: '2.0', id: req.id, result: { tools: MCP_TOOLS } };
  }

  if (req.method === 'tools/call') {
    const params = req.params || {};
    const toolName = String(params.name || '');
    const toolArgs = (params.arguments || {}) as Record<string, unknown>;
    const textResult = await executeMcpTool(toolName, toolArgs);
    return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: textResult }] } };
  }

  return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
}

export function startMcpServer(): void {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const req = JSON.parse(trimmed) as JsonRpcRequest;
      const res = await handleJsonRpc(req);
      if (res) process.stdout.write(JSON.stringify(res) + '\n');
    } catch (_e: unknown) {
      const err = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
      process.stdout.write(JSON.stringify(err) + '\n');
    }
  });
}
