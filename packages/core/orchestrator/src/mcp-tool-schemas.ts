/**
 * @file mcp-tool-schemas.ts
 * Authoritative 32-Tool MCP Schema Registry for Google Antigravity & Toolchain Sync.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import { CORE_MCP_TOOL_SCHEMAS } from './mcp-tool-schemas-core.js';
import { GODOT_MCP_TOOL_SCHEMAS } from './mcp-tool-schemas-godot.js';

export interface McpToolMeta {
  desc: string;
  props: Record<string, unknown>;
  req: string[];
}

export const AEGIS_TOOL_SCHEMAS: Record<string, McpToolMeta> = {
  ...CORE_MCP_TOOL_SCHEMAS,

  // --- Task Ingestion Protocol (TIP) & Locks (7) ---
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
  teamwork_plan: {
    desc: 'Generate Antigravity subagent teamwork plan and stage tracks into TIP inbox',
    props: {
      objective: { type: 'string', description: 'Teamwork goal or high-level objective' },
      targetFiles: { type: 'array', items: { type: 'string' }, description: 'Target files to modify or lock' }
    },
    req: ['objective']
  },
  teamwork_status: {
    desc: 'Inspect Antigravity subagents, active teamwork tracks, and file mutex locks',
    props: {},
    req: []
  },
  teamwork_dag: {
    desc: 'Display ASCII Execution Waves dependency graph (DAG) for an objective',
    props: {
      objective: { type: 'string', description: 'Teamwork goal or high-level objective' },
      targetFiles: { type: 'array', items: { type: 'string' }, description: 'Target files to analyze' }
    },
    req: []
  },
  teamwork_compact: {
    desc: 'Archive completed tasks and generate Antigravity Compact mission briefing',
    props: {
      objective: { type: 'string', description: 'Active teamwork mission or plan identifier' }
    },
    req: []
  },
  teamwork_analyze: {
    desc: 'Fast sub-10ms semantic codebase analysis and target file discovery',
    props: {
      objective: { type: 'string', description: 'Objective text to analyze and discover target files for' },
      files: { type: 'array', items: { type: 'string' }, description: 'Optional explicit file list' }
    },
    req: ['objective']
  },
  teamwork_mesh_read: {
    desc: 'Read Dynamic Teamwork Mesh state, active peers, and recent events (supports compact)',
    props: {
      compact: { type: 'boolean', description: 'Return ultra-low token compact wire format' },
      since: { type: 'string', description: 'Filter events newer than ISO timestamp' }
    },
    req: []
  },
  teamwork_mesh_post: {
    desc: 'Post real-time agent status, touched files, or exported contracts to Teamwork Mesh',
    props: {
      agentId: { type: 'string', description: 'Agent identifier or subagent role name' },
      status: { type: 'string', description: 'working | milestone | blocked | done' },
      activity: { type: 'string', description: 'Brief summary of active work' },
      modifiedFiles: { type: 'array', items: { type: 'string' }, description: 'Files modified by this agent' },
      publishedContracts: { type: 'array', items: { type: 'string' }, description: 'Functions or interfaces exported' }
    },
    req: ['agentId']
  },
  teamwork_broadcast: {
    desc: 'Broadcast an event or milestone message to peer subagents across the mesh',
    props: {
      fromAgent: { type: 'string', description: 'Originating agent name' },
      message: { type: 'string', description: 'Broadcast message content' },
      type: { type: 'string', description: 'heartbeat | milestone | contract_update | broadcast | completed' }
    },
    req: ['fromAgent', 'message']
  },
  teamwork_peers: {
    desc: 'List peer subagents, current status, and locked/modified files in the active wave',
    props: {
      compact: { type: 'boolean', description: 'Return single-line compact summary per peer' }
    },
    req: []
  },
  teamwork_waves: {
    desc: 'Compute and inspect parallel execution waves and simultaneous dispatch grouping',
    props: {
      objective: { type: 'string', description: 'Teamwork goal or high-level objective' },
      targetFiles: { type: 'array', items: { type: 'string' }, description: 'Target files to analyze' },
      compact: { type: 'boolean', description: 'Return ultra-low token compact wave breakdown' }
    },
    req: []
  },
  teamwork_conflicts: {
    desc: 'Inspect Conflict Radar for active file collision warnings across peers',
    props: {},
    req: []
  },
  teamwork_scale: {
    desc: 'Plan hyper-scale massive concurrency subtasks with 100% disjoint file lock allocation',
    props: {
      objective: { type: 'string', description: 'Teamwork goal or high-level objective' },
      maxAgents: { type: 'number', description: 'Maximum concurrent subagents (default: 12)' }
    },
    req: ['objective']
  },
  teamwork_doc_synthesize: {
    desc: 'Synthesize human-centric living architecture briefing, component topology and metrics',
    props: {
      planId: { type: 'string', description: 'Active teamwork mission or plan identifier' },
      compact: { type: 'boolean', description: 'Return ultra-low token compact summary' }
    },
    req: []
  },
  teamwork_tools: {
    desc: 'Inspect or display assigned intelligent Aegis tools for each Antigravity subagent role',
    props: {
      role: { type: 'string', description: 'Filter tools by subagent role (solver, qa, ui, docs)' }
    },
    req: []
  },
  lock_status: {
    desc: 'Inspect active file mutex locks across worktrees',
    props: {},
    req: []
  },
  engine_update: {
    desc: 'Dynamically update and reinstall Aegis across PC with zero-state clean options',
    props: {
      clean: { type: 'boolean', description: 'Perform clean wipe of build cache and stale locks' },
      pull: { type: 'boolean', description: 'Pull latest commits from origin/master' },
      force: { type: 'boolean', description: 'Force rebuild and reinstall' }
    },
    req: []
  },
  version_status: {
    desc: 'Inspect dynamic version drift, upstream commits, and monorepo packages status',
    props: {},
    req: []
  },
  github_rfc_pipeline: {
    desc: 'Execute end-to-end GitHub RFC lifecycle: Discussion <-> Issue cross-link and TIP staging',
    props: {
      rfc: { type: 'string', description: 'RFC ID, slug, or title' },
      description: { type: 'string', description: 'RFC problem definition or concept' }
    },
    req: ['rfc']
  },

  ...GODOT_MCP_TOOL_SCHEMAS
};
