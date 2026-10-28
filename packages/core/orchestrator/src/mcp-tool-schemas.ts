/**
 * @file mcp-tool-schemas.ts
 * Authoritative 27-Tool MCP Schema Registry for Google Antigravity & Toolchain Sync.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

export interface McpToolMeta {
  desc: string;
  props: Record<string, unknown>;
  req: string[];
}

export const AEGIS_TOOL_SCHEMAS: Record<string, McpToolMeta> = {
  // --- Core Codebase Memory & Navigation (4) ---
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

  // --- AST & Code Inspection (4) ---
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

  // --- Quality & Diagnosis (5) ---
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
  },

  // --- Task Ingestion Protocol (TIP) & Locks (6) ---
  worktree_status: {
    desc: 'Inspect active worktrees and active file mutex locks',
    props: {},
    req: []
  },
  task_list: {
    desc: 'List ready, in_progress, or blocked tasks in TIP queue',
    props: { status: { type: 'string', description: 'Filter by task status' } },
    req: []
  },
  task_claim: {
    desc: 'Claim a task for an agent role and acquire file locks',
    props: { issueNumber: { type: 'number', description: 'GitHub Issue number' }, agentRole: { type: 'string', description: 'Agent role' } },
    req: ['issueNumber']
  },
  task_release: {
    desc: 'Release or complete a task and release file locks',
    props: { issueNumber: { type: 'number', description: 'GitHub Issue number' }, status: { type: 'string', description: 'done or blocked' }, agentRole: { type: 'string' } },
    req: ['issueNumber']
  },
  task_inbox_pull: {
    desc: 'Pull the next staged autonomous task payload from .aegis/task-inbox.json',
    props: { agentRole: { type: 'string', description: 'Filter by agent role' } },
    req: []
  },
  lock_status: {
    desc: 'Inspect active file mutex locks across worktrees',
    props: {},
    req: []
  },

  // --- Godot Substrate 3.0 Authoritative Suite (8) ---
  aegis_godot_status: {
    desc: 'Get Godot Engine binary path, version, and bridge connection status',
    props: {},
    req: []
  },
  aegis_godot_playtest: {
    desc: 'Execute an automated headless or interactive test scenario in Godot',
    props: { projectDir: { type: 'string', description: 'Target Godot project path' }, scenarioPath: { type: 'string', description: 'Optional playtest.json path' } },
    req: []
  },
  aegis_godot_inspect_ui: {
    desc: 'Zero-token responsive UI layout inspection across 4 canonical aspect ratios',
    props: { projectDir: { type: 'string', description: 'Target Godot project path' }, minTouchTarget: { type: 'number', description: 'Minimum touch target size' } },
    req: []
  },
  aegis_godot_tree: {
    desc: 'Inspect scene tree node hierarchy from a running instance or .tscn file',
    props: { tscnPath: { type: 'string', description: 'Path to target .tscn scene file' } },
    req: ['tscnPath']
  },
  aegis_godot_signals: {
    desc: 'Trace signal definitions and connections for Godot classes via ClassDB',
    props: { className: { type: 'string', description: 'Class name to query (e.g. Button)' } },
    req: ['className']
  },
  aegis_godot_screenshot: {
    desc: 'Capture high-resolution framebuffer screenshot and save locally',
    props: { outputPath: { type: 'string', description: 'Target file path for saving PNG screenshot' } },
    req: []
  },
  aegis_godot_validate: {
    desc: 'Validate GDScript syntax with native compiler and verify ClassDB API usage',
    props: { filePath: { type: 'string', description: 'Path to .gd or .tscn file' } },
    req: ['filePath']
  },
  aegis_godot_eval: {
    desc: 'Safely evaluate a runtime GDScript expression in active instance via reflection',
    props: { expression: { type: 'string', description: 'GDScript expression string to evaluate' } },
    req: ['expression']
  }
};
