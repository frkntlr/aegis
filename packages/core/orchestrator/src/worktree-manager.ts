import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type AgentWorktree, debugLogIgnored, type WorktreeListResult } from '@aegis/shared';
import { cleanGitEnv, parseWorktreePorcelainBlock } from './worktree-mutex.js';
import { WorktreeLockDelegate, type WorktreeManagerOptions } from './worktree-lock-delegate.js';

export type { WorktreeManagerOptions } from './worktree-lock-delegate.js';

export function validateAgentName(agentName: string): string {
  if (
    typeof agentName !== 'string' ||
    !agentName ||
    /[\0\r\n/\\]/.test(agentName) ||
    agentName === '.' ||
    agentName === '..' ||
    agentName.includes('..') ||
    agentName.startsWith('-') ||
    agentName.startsWith('.') ||
    agentName.endsWith('.') ||
    agentName.endsWith('.lock') ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(agentName)
  ) {
    throw new Error(`Invalid agent name: ${agentName}`);
  }
  return agentName;
}

function validateBaseBranch(branch: string): string {
  if (
    typeof branch !== 'string' ||
    !branch ||
    /[\0\r\n\s]/.test(branch) ||
    branch.startsWith('-') ||
    branch.startsWith('.') ||
    branch.endsWith('.') ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.endsWith('.lock') ||
    branch.includes('@{') ||
    !/^[A-Za-z0-9._/-]+$/.test(branch)
  ) {
    throw new Error(`Invalid base branch: ${branch}`);
  }
  return branch;
}

export class WorktreeManager extends WorktreeLockDelegate {
  private cachedWorktrees: { timestamp: number; result: WorktreeListResult } | null = null;
  private readonly WT_CACHE_TTL_MS = 2000;

  constructor(options: WorktreeManagerOptions = {}) {
    super(options);
  }

  public getWorktreePath(agentName: string): string {
    const validName = validateAgentName(agentName);
    const basePrefixDir = path.resolve(this.repoRoot, this.worktreePrefix);
    const resolvedTarget = path.resolve(basePrefixDir, validName);
    const rel = path.relative(basePrefixDir, resolvedTarget);
    if (!rel || rel === '.' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new Error(`Worktree path escapes prefix boundary: ${agentName}`);
    }
    return resolvedTarget;
  }

  public detectCurrentBranch(): string {
    try {
      if (fs.existsSync(path.join(this.repoRoot, '.git'))) {
        const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: this.repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv()
        }).trim();
        if (branch && branch !== 'HEAD') return branch;
      }
    } catch (err: unknown) {
      debugLogIgnored('WorktreeManager:detectCurrentBranch', err);
    }
    return 'master';
  }

  public ensureWorktree(agentName: string, baseBranchArg?: string): AgentWorktree {
    this.invalidateWorktreeCache();
    const targetDir = this.getWorktreePath(agentName);
    const branchName = `aegis/${agentName}`;
    const baseBranch = baseBranchArg !== undefined ? validateBaseBranch(baseBranchArg) : this.detectCurrentBranch();

    if (!fs.existsSync(targetDir)) {
      try {
        execFileSync('git', ['worktree', 'prune'], { cwd: this.repoRoot, stdio: 'pipe', env: cleanGitEnv() });
      } catch (err: unknown) {
        debugLogIgnored('WorktreeManager:ensurePrune', err);
      }
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      try {
        execFileSync('git', ['worktree', 'add', targetDir, '-B', branchName, baseBranch], {
          cwd: this.repoRoot, stdio: 'pipe', env: cleanGitEnv()
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('already exists') && !msg.includes('already checked out') && !msg.includes('already registered')) throw err;
      }
    }

    return {
      agentName, branch: branchName, path: targetDir, status: 'idle', lockedFiles: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
  }

  public removeWorktree(agentName: string): boolean {
    this.invalidateWorktreeCache();
    const targetDir = this.getWorktreePath(agentName);
    const basePrefixDir = path.resolve(this.repoRoot, this.worktreePrefix);
    if (targetDir === basePrefixDir || targetDir === this.repoRoot) {
      throw new Error(`Refusing to remove protected directory: ${targetDir}`);
    }
    try {
      execFileSync('git', ['worktree', 'remove', targetDir, '--force'], {
        cwd: this.repoRoot, stdio: 'pipe', env: cleanGitEnv()
      });
      return true;
    } catch (err: unknown) {
      debugLogIgnored('WorktreeManager:gitWorktreeRemove', err);
      if (!fs.existsSync(targetDir)) return false;
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
      } catch (rmErr: unknown) {
        debugLogIgnored('WorktreeManager:rmSyncFallback', rmErr);
      }
      try {
        execFileSync('git', ['worktree', 'prune'], { cwd: this.repoRoot, stdio: 'pipe', env: cleanGitEnv() });
      } catch (pruneErr: unknown) {
        debugLogIgnored('WorktreeManager:removePrune', pruneErr);
      }
      return true;
    }
  }

  public invalidateWorktreeCache(): void { this.cachedWorktrees = null; }

  public listWorktrees(forceRefresh = false): WorktreeListResult {
    const now = Date.now();
    if (!forceRefresh && this.cachedWorktrees && (now - this.cachedWorktrees.timestamp < this.WT_CACHE_TTL_MS)) {
      return this.cachedWorktrees.result;
    }
    try {
      if (!fs.existsSync(path.join(this.repoRoot, '.git'))) return { worktrees: [], activeCount: 0 };
      const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: this.repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv()
      });
      const worktrees = output.split('\n\n')
        .map(b => parseWorktreePorcelainBlock(b, this.worktreePrefix))
        .filter((wt): wt is AgentWorktree => Boolean(wt));

      const res = { worktrees, activeCount: worktrees.length };
      this.cachedWorktrees = { timestamp: now, result: res };
      return res;
    } catch (err: unknown) {
      debugLogIgnored('WorktreeManager:listWorktrees', err);
      return { worktrees: [], activeCount: 0 };
    }
  }

  public hasUnmergedConflicts(agentName: string): boolean {
    const wtPath = this.getWorktreePath(agentName);
    if (!fs.existsSync(wtPath)) return false;
    try {
      const output = execFileSync('git', ['ls-files', '-u'], {
        cwd: wtPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv()
      });
      return output.trim().length > 0;
    } catch (err: unknown) {
      debugLogIgnored('WorktreeManager:hasUnmergedConflicts', err);
      return false;
    }
  }
}
