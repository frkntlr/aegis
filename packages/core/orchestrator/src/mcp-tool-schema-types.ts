/**
 * @file mcp-tool-schema-types.ts
 * Leaf type definitions for MCP tool schemas.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

export interface McpToolMeta {
  desc: string;
  props: Record<string, unknown>;
  req: string[];
}
