export interface ToolPermission {
  agentName: string;
  allowedTools: Set<string>;
  callsInLastMinute: number;
  lastWindowResetMs: number;
}

export class MCPSecurityManager {
  private permissions: Map<string, ToolPermission> = new Map();
  private auditLog: Array<{ timestamp: string; agent: string; tool: string; allowed: boolean; reason?: string }> = [];
  private readonly maxCallsPerMinute: number;
  private readonly destructiveTools = new Set(['delete_branch', 'force_push', 'drop_database', 'rm_rf']);

  constructor(options: { maxCallsPerMinute?: number } = {}) {
    this.maxCallsPerMinute = options.maxCallsPerMinute ?? 30;
    const godotTools = ['godot_status', 'godot_inspect', 'godot_query', 'godot_validate', 'godot_playtest'];
    const memTools = ['memory_query', 'memory_stats', 'ast_search', 'ast_replace', 'rtk_compress', 'context7_query', 'cage_check', 'triage', 'find_symbol', 'trace_relational'];
    this.registerAgent('solver', ['read_file', 'write_file', 'run_test', 'git_commit', 'ast_skeleton', ...godotTools, ...memTools]);
    this.registerAgent('qa', ['read_file', 'run_test', 'inspect_ui', 'simulate_input', 'take_screenshot', 'ast_skeleton', ...godotTools, ...memTools]);
    this.registerAgent('ui', ['read_file', 'write_file', 'run_test', 'inspect_ui', 'simulate_input', 'take_screenshot', 'ast_skeleton', ...godotTools, ...memTools]);
    const readOnlyMem = ['memory_query', 'memory_stats', 'context7_query', 'find_symbol', 'trace_relational', 'rtk_compress', 'cage_check'];
    this.registerAgent('docs', ['read_file', 'write_file', 'write_wiki', 'wiki_sync', 'rfc_triage', 'ast_skeleton', ...readOnlyMem]);
    this.registerAgent('contributor', ['read_file', 'write_file', 'run_test', 'git_commit', 'ast_skeleton', ...memTools]);
    this.registerAgent('alice', ['read_file', 'write_file', 'run_test', 'git_commit', 'ast_skeleton', ...godotTools, ...memTools]);
    this.registerAgent('bob', ['read_file', 'write_file', 'run_test', 'git_commit', 'ast_skeleton', ...godotTools, ...memTools]);
    this.registerAgent('human', ['*']);
  }

  public registerAgent(agentName: string, tools: string[]): void {
    this.permissions.set(agentName, {
      agentName,
      allowedTools: new Set(tools),
      callsInLastMinute: 0,
      lastWindowResetMs: Date.now()
    });
  }

  private checkRateLimit(perm: ToolPermission, agentName: string, toolName: string): { allowed: boolean; reason?: string } | null {
    const now = Date.now();
    if (now - perm.lastWindowResetMs > 60_000) {
      perm.callsInLastMinute = 0;
      perm.lastWindowResetMs = now;
    }
    perm.callsInLastMinute++;
    if (perm.callsInLastMinute > this.maxCallsPerMinute) {
      this.recordAudit(agentName, toolName, false, 'Rate limit exceeded.');
      return { allowed: false, reason: `Rate limit reached (${this.maxCallsPerMinute} calls/min). Blocked runaway tool loop.` };
    }
    return null;
  }

  private checkDestructive(agentName: string, toolName: string): { allowed: boolean; reason?: string } | null {
    if (this.destructiveTools.has(toolName) && agentName !== 'human') {
      this.recordAudit(agentName, toolName, false, 'Destructive tool requires Human-in-the-Loop.');
      return { allowed: false, reason: `Tool "${toolName}" is destructive and requires Human-in-the-Loop approval.` };
    }
    return null;
  }

  public authorizeToolCall(agentName: string, toolName: string): { allowed: boolean; reason?: string } {
    const perm = this.permissions.get(agentName);
    if (!perm) {
      this.recordAudit(agentName, toolName, false, 'Unregistered agent.');
      return { allowed: false, reason: `Agent "${agentName}" is not registered in MCP security policy.` };
    }

    const rateErr = this.checkRateLimit(perm, agentName, toolName);
    if (rateErr) return rateErr;

    const destErr = this.checkDestructive(agentName, toolName);
    if (destErr) return destErr;

    if (!perm.allowedTools.has('*') && !perm.allowedTools.has(toolName)) {
      this.recordAudit(agentName, toolName, false, 'Tool not in allowlist.');
      return { allowed: false, reason: `Agent "${agentName}" lacks scope for tool "${toolName}".` };
    }

    this.recordAudit(agentName, toolName, true);
    return { allowed: true };
  }

  private recordAudit(agent: string, tool: string, allowed: boolean, reason?: string): void {
    this.auditLog.push({ timestamp: new Date().toISOString(), agent, tool, allowed, reason });
  }

  public getAuditLog() {
    return [...this.auditLog];
  }
}
