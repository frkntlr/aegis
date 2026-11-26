import * as fs from 'node:fs';
import * as path from 'node:path';

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
    const godotTools = [
      'godot_status', 'godot_inspect', 'godot_query', 'godot_validate', 'godot_playtest',
      'aegis_godot_status', 'aegis_godot_playtest', 'aegis_godot_inspect_ui',
      'aegis_godot_tree', 'aegis_godot_signals', 'aegis_godot_screenshot',
      'aegis_godot_validate', 'aegis_godot_eval'
    ];
    const memTools = [
      'memory_query', 'memory_stats', 'ast_search', 'ast_replace', 'rtk_compress',
      'context7_query', 'cage_check', 'triage', 'find_symbol', 'trace_relational',
      'skeleton_extract', 'ast_skeleton', 'budget_inspect', 'socratic_diagnose'
    ];
    const teamworkTools = [
      'task_list', 'task_claim', 'task_release', 'task_inbox_pull', 'lock_status',
      'worktree_status', 'teamwork_status', 'teamwork_compact', 'teamwork_analyze',
      'teamwork_plan', 'teamwork_dag'
    ];
    const solverTools = ['read_file', 'write_file', 'run_test', 'git_commit', ...godotTools, ...memTools, ...teamworkTools];
    const qaTools = ['read_file', 'run_test', 'inspect_ui', 'simulate_input', 'take_screenshot', ...godotTools, ...memTools, ...teamworkTools];
    const uiTools = ['read_file', 'write_file', 'run_test', 'inspect_ui', 'simulate_input', 'take_screenshot', ...godotTools, ...memTools, ...teamworkTools];
    const readOnlyMem = [
      'memory_query', 'memory_stats', 'context7_query', 'find_symbol', 'trace_relational',
      'rtk_compress', 'cage_check', 'skeleton_extract', 'ast_skeleton', 'budget_inspect'
    ];
    const docsTools = ['read_file', 'write_file', 'write_wiki', 'wiki_sync', 'rfc_triage', ...readOnlyMem, ...teamworkTools];

    this.registerAgent('solver', solverTools);
    this.registerAgent('issue-solver', solverTools);
    this.registerAgent('qa', qaTools);
    this.registerAgent('qa-hunter', qaTools);
    this.registerAgent('ui', uiTools);
    this.registerAgent('ui-specialist', uiTools);
    this.registerAgent('docs', docsTools);
    this.registerAgent('doc-architect', docsTools);
    this.registerAgent('contributor', ['read_file', 'write_file', 'run_test', 'git_commit', ...memTools]);
    this.registerAgent('alice', ['read_file', 'write_file', 'run_test', 'git_commit', ...godotTools, ...memTools]);
    this.registerAgent('bob', ['read_file', 'write_file', 'run_test', 'git_commit', ...godotTools, ...memTools]);
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

  private tryReadDanglingLink(cur: string): string | null {
    try {
      const st = fs.lstatSync(cur);
      if (!st.isSymbolicLink()) return null;
      const target = fs.readlinkSync(cur);
      return path.isAbsolute(target) ? target : path.resolve(path.dirname(cur), target);
    } catch {
      return null;
    }
  }

  private resolveNearestRealpath(targetPath: string): string | null {
    let cur = targetPath;
    const tail: string[] = [];
    let symlinkHops = 0;
    while (true) {
      if (fs.existsSync(cur)) {
        try {
          const real = fs.realpathSync(cur);
          return tail.length > 0 ? path.join(real, ...tail.reverse()) : real;
        } catch (err: unknown) {
          if (process.env.AEGIS_DEBUG === '1') {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`[aegis:mcp-security] realpathSync failed for "${cur}": ${msg}\n`);
          }
          return null;
        }
      }
      const linkTarget = this.tryReadDanglingLink(cur);
      if (linkTarget) {
        symlinkHops++;
        if (symlinkHops > 32) return null;
        cur = linkTarget;
        continue;
      }
      const parent = path.dirname(cur);
      if (parent === cur) return symlinkHops > 0 ? null : targetPath;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }

  private isPathWithinBase(baseDir: string, targetPath: string, pathImpl: typeof path.posix | typeof path.win32): boolean {
    const caseInsensitive = pathImpl === path.win32 || process.platform === 'win32';
    const cmpBase = caseInsensitive ? baseDir.toLowerCase() : baseDir;
    const cmpTarget = caseInsensitive ? targetPath.toLowerCase() : targetPath;
    const rel = pathImpl.relative(cmpBase, cmpTarget);
    return rel !== '..' && !rel.startsWith(`..${pathImpl.sep}`) && !pathImpl.isAbsolute(rel);
  }

  private resolveContainmentPair(worktreeDir: string, filePath: string): { base: string; target: string; pathImpl: typeof path.posix | typeof path.win32 } | null {
    const safeBase = worktreeDir.replace(/\\/g, '/');
    const safeTarget = filePath.replace(/\\/g, '/');
    const devicePrefix = /^\/\/[?.](\/|$)/;
    if (devicePrefix.test(safeBase) || devicePrefix.test(safeTarget)) return null;
    const driveRelative = /^[A-Za-z]:(?![\\/])/;
    if (driveRelative.test(safeBase) || driveRelative.test(safeTarget)) return null;
    const winDrive = /^[A-Za-z]:(\/|$)/;
    const baseIsWin = winDrive.test(safeBase);
    const targetIsWin = winDrive.test(safeTarget);
    if (targetIsWin && !baseIsWin) return null;
    if (baseIsWin && targetIsWin && safeBase[0].toLowerCase() !== safeTarget[0].toLowerCase()) return null;
    const pathImpl = baseIsWin ? path.win32 : path;
    const base = pathImpl.resolve(safeBase);
    const target = pathImpl.isAbsolute(safeTarget) ? pathImpl.resolve(safeTarget) : pathImpl.resolve(base, safeTarget);
    return { base, target, pathImpl };
  }

  public authorizeFileOperation(agentName: string, filePath: string, worktreeDir?: string): { allowed: boolean; reason?: string } {
    if (agentName === 'human' || !worktreeDir) return { allowed: true };
    if (filePath.includes('\0') || worktreeDir.includes('\0') || filePath.trim() === '') {
      this.recordAudit(agentName, 'write_file', false, 'Invalid or null-byte file path.');
      return { allowed: false, reason: `Agent "${agentName}" supplied an invalid file path.` };
    }
    const pair = this.resolveContainmentPair(worktreeDir, filePath);
    if (!pair || !this.isPathWithinBase(pair.base, pair.target, pair.pathImpl)) {
      this.recordAudit(agentName, 'write_file', false, 'Path traversal detected outside worktree.');
      return { allowed: false, reason: `Agent "${agentName}" cannot write outside worktree "${worktreeDir}".` };
    }
    const checkSymlinks = pair.pathImpl === path || process.platform === 'win32';
    if (checkSymlinks) {
      const realBase = this.resolveNearestRealpath(pair.base);
      const realTarget = this.resolveNearestRealpath(pair.target);
      if (!realBase || !realTarget || !this.isPathWithinBase(realBase, realTarget, pair.pathImpl)) {
        this.recordAudit(agentName, 'write_file', false, 'Symlink path escape detected outside worktree.');
        return { allowed: false, reason: `Agent "${agentName}" cannot write outside worktree "${worktreeDir}".` };
      }
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
