import type { McpToolMeta } from './mcp-tool-schemas.js';

export const CORE_MCP_TOOL_SCHEMAS: Record<string, McpToolMeta> = {
  memory_query: {
    desc: '5-Layer Codebase Memory query (AST, callers, callees, locks)',
    props: { symbol: { type: 'string', description: 'Symbol name to query' }, worktreeId: { type: 'string', description: 'Target worktree ID' } },
    req: ['symbol']
  },
  memory_stats: {
    desc: 'Codebase Memory diagnostics & token savings',
    props: { worktreeId: { type: 'string', description: 'Target worktree ID' } },
    req: []
  },
  find_symbol: {
    desc: 'Fast AST symbol lookup and precision surgical slice',
    props: { symbol: { type: 'string', description: 'Target symbol name' } },
    req: ['symbol']
  },
  trace_relational: {
    desc: 'Trace relational callers, signals and blast radius',
    props: { target: { type: 'string', description: 'Target function or class name' } },
    req: ['target']
  },
  ast_search: {
    desc: 'Structural AST search via ast-grep with wildcard support',
    props: { pattern: { type: 'string', description: 'ast-grep pattern' }, path: { type: 'string', description: 'Target directory or file path' } },
    req: ['pattern']
  },
  ast_replace: {
    desc: 'Structural AST replace via ast-grep with metavars',
    props: { pattern: { type: 'string' }, rewrite: { type: 'string' }, file: { type: 'string' } },
    req: ['pattern', 'rewrite', 'file']
  },
  skeleton_extract: {
    desc: 'Extract token-saving AST skeleton folding function/method bodies',
    props: { filePath: { type: 'string', description: 'Path to source file' } },
    req: ['filePath']
  },
  budget_inspect: {
    desc: 'Inspect Demir Kafes line budget quota remaining & decomposition advice',
    props: { filePath: { type: 'string', description: 'Path to source file' } },
    req: ['filePath']
  },
  cage_check: {
    desc: 'Audit codebase or directory against Demir Kafes compliance',
    props: { dir: { type: 'string', description: 'Directory to audit (default: packages)' } },
    req: []
  },
  triage: {
    desc: 'Evidence-Based Bug Triage (zero false alarms)',
    props: { dir: { type: 'string', description: 'Target directory to triage' } },
    req: []
  },
  socratic_diagnose: {
    desc: 'Instant Socratic evidence parsing & diagnostic hypothesis generation',
    props: { rawLog: { type: 'string', description: 'Terminal failure or stack trace log' } },
    req: ['rawLog']
  },
  context7_query: {
    desc: 'Query official library ground-truth documentation',
    props: { library: { type: 'string', description: 'Target library' }, topic: { type: 'string', description: 'Topic or query' } },
    req: ['library', 'topic']
  },
  rtk_compress: {
    desc: 'Compress terminal logs via RTK Token Killer',
    props: { text: { type: 'string', description: 'Raw terminal log text' } },
    req: ['text']
  }
};
