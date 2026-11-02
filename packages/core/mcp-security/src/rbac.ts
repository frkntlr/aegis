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
    const solverTools = ['read_file', 'write_file', 'run_test', 'git_commit', 'ast_skeleton', ...godotTools, ...memTools];
    const qaTools = ['read_file', 'run_test', 'inspect_ui', 'simulate_input', 'take_screenshot', 'ast_skeleton', ...godotTools, ...memTools];
    const uiTools = ['read_file', 'write_file', 'run_test', 'inspect_ui', 'simulate_input', 'take_screenshot', 'ast_skeleton', ...godotTools, ...memTools];
    const readOnlyMem = ['memory_query', 'memory_stats', 'context7_query', 'find_symbol', 'trace_relational', 'rtk_compress', 'cage_check'];
    const docsTools = ['read_file', 'write_file', 'write_wiki', 'wiki_sync', 'rfc_triage', 'ast_skeleton', ...readOnlyMem];

    this.registerAgent('solver', solverTools);
    this.registerAgent('issue-solver', solverTools);
    this.registerAgent('qa', qaTools);
    this.registerAgent('qa-hunter', qaTools);
    this.registerAgent('ui', uiTools);
    this.registerAgent('ui-specialist', uiTools);
    this.registerAgent('docs', docsTools);
    this.registerAgent('doc-architect', docsTools);
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

  private getPermission(agentName: string): ToolPermission | undefined {
    const direct = this.permissions.get(agentName);
    if (direct) return direct;
    const clean = agentName.toLowerCase().replace(/^@/, '');
    if (this.permissions.has(clean)) return this.permissions.get(clean);
    if (clean.includes('solver')) return this.permissions.get('solver');
    if (clean.includes('qa') || clean.includes('hunter')) return this.permissions.get('qa');
    if (clean.includes('ui') || clean.includes('specialist')) return this.permissions.get('ui');
    if (clean.includes('doc') || clean.includes('architect')) return this.permissions.get('docs');
    return undefined;
  }

  public authorizeToolCall(agentName: string, toolName: string): { allowed: boolean; reason?: string } {
    const perm = this.getPermission(agentName);
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

  public authorizeFileOperation(agentName: string, filePath: string, worktreeDir?: string): { allowed: boolean; reason?: string } {
    if (agentName === 'human' || !worktreeDir) return { allowed: true };
    const normFile = filePath.replace(/\\/g, '/');
    const normWt = worktreeDir.replace(/\\/g, '/');
    if (normFile.includes('../') && !normFile.startsWith(normWt)) {
      this.recordAudit(agentName, 'write_file', false, 'Path traversal detected outside worktree.');
      return { allowed: false, reason: `Agent "${agentName}" cannot write outside worktree "${worktreeDir}".` };
    }
    return { allowed: true };
  }

  private recordAudit(agent: string, tool: string, allowed: boolean, reason?: string): void {
    this.auditLog.push({ timestamp: new Date().toISOString(), agent, tool, allowed, reason });
  }

  public getAuditLog() {
    return [...this.auditLog];
  }
}
