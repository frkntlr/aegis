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

    // Default safe agent permissions
    this.registerAgent('alice', ['read_file', 'write_file', 'run_test', 'git_commit', 'ast_skeleton']);
    this.registerAgent('bob', ['read_file', 'write_file', 'run_test', 'git_commit', 'ast_skeleton']);
    // Human has superuser permissions
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

  public authorizeToolCall(agentName: string, toolName: string): { allowed: boolean; reason?: string } {
    const perm = this.permissions.get(agentName);
    if (!perm) {
      this.recordAudit(agentName, toolName, false, 'Unregistered agent.');
      return { allowed: false, reason: `Agent "${agentName}" is not registered in MCP security policy.` };
    }

    // Rate Limiting Check
    const now = Date.now();
    if (now - perm.lastWindowResetMs > 60_000) {
      perm.callsInLastMinute = 0;
      perm.lastWindowResetMs = now;
    }

    if (perm.callsInLastMinute >= this.maxCallsPerMinute) {
      this.recordAudit(agentName, toolName, false, 'Rate limit exceeded.');
      return {
        allowed: false,
        reason: `Rate limit reached (${this.maxCallsPerMinute} calls/min). Blocked runaway tool loop.`
      };
    }

    // Destructive Tool Protection
    if (this.destructiveTools.has(toolName) && agentName !== 'human') {
      this.recordAudit(agentName, toolName, false, 'Destructive tool requires Human-in-the-Loop.');
      return {
        allowed: false,
        reason: `Tool "${toolName}" is destructive and requires Human-in-the-Loop approval.`
      };
    }

    // Permission Scope Check
    const isAllowed = perm.allowedTools.has('*') || perm.allowedTools.has(toolName);
    if (!isAllowed) {
      this.recordAudit(agentName, toolName, false, 'Tool not in allowlist.');
      return {
        allowed: false,
        reason: `Agent "${agentName}" lacks scope for tool "${toolName}".`
      };
    }

    perm.callsInLastMinute++;
    this.recordAudit(agentName, toolName, true);
    return { allowed: true };
  }

  private recordAudit(agent: string, tool: string, allowed: boolean, reason?: string): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      agent,
      tool,
      allowed,
      reason
    });
  }

  public getAuditLog() {
    return [...this.auditLog];
  }
}
