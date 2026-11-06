import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentWorktree, WorktreeListResult } from '@aegis/shared';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { cleanGitEnv, parseWorktreePorcelainBlock } from './worktree-mutex.js';
import { WorktreeLockManager } from './worktree-lock-manager.js';

export interface WorktreeManagerOptions {
  repoRoot?: string;
  worktreePrefix?: string;
  persistLocks?: boolean;
  staleTimeoutMs?: number;
}

export class WorktreeManager {
  private repoRoot: string;
  private worktreePrefix: string;
  private lockManager: WorktreeLockManager;
  private cachedWorktrees: { timestamp: number; result: WorktreeListResult } | null = null;
  private readonly WT_CACHE_TTL_MS = 2000;

  constructor(options: WorktreeManagerOptions = {}) {
    this.repoRoot = resolveSafeRepoRoot(options.repoRoot);
    this.worktreePrefix = options.worktreePrefix ?? 'experimental';
    this.lockManager = new WorktreeLockManager({
      repoRoot: this.repoRoot,
      persistLocks: options.persistLocks,
      staleTimeoutMs: options.staleTimeoutMs
    });
  }

  public getLockManager(): WorktreeLockManager { return this.lockManager; }
  public getWorktreePath(agentName: string): string {
    return path.resolve(this.repoRoot, this.worktreePrefix, agentName);
  }

  public detectCurrentBranch(): string {
    try {
      if (fs.existsSync(path.join(this.repoRoot, '.git'))) {
        const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: this.repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv()
        }).trim();
        if (branch && branch !== 'HEAD') return branch;
      }
    } catch { /* ignore */ }
    return 'master';
  }

  public ensureWorktree(agentName: string, baseBranchArg?: string): AgentWorktree {
    this.invalidateWorktreeCache();
    const targetDir = this.getWorktreePath(agentName);
    const branchName = `aegis/${agentName}`;
    const baseBranch = baseBranchArg || this.detectCurrentBranch();

    if (!fs.existsSync(targetDir)) {
      try { execFileSync('git', ['worktree', 'prune'], { cwd: this.repoRoot, stdio: 'pipe', env: cleanGitEnv() }); } catch { /* ignore */ }
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
    try {
      execFileSync('git', ['worktree', 'remove', targetDir, '--force'], {
        cwd: this.repoRoot, stdio: 'pipe', env: cleanGitEnv()
      });
      return true;
    } catch {
      if (!fs.existsSync(targetDir)) return false;
      try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch { /* ignore */ }
      try { execFileSync('git', ['worktree', 'prune'], { cwd: this.repoRoot, stdio: 'pipe', env: cleanGitEnv() }); } catch { /* ignore */ }
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
    } catch {
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
    } catch {
      return false;
    }
  }

  public acquireFileLocks(agentName: string, files: string[]): { success: boolean; conflictingFiles: string[] } {
    return this.lockManager.acquireFileLocks(agentName, files);
  }
  public acquireBatchLocks(batch: Array<{ agentName: string; files: string[] }>): { success: boolean; conflictingFiles: string[] } {
    return this.lockManager.acquireBatchLocks(batch);
  }
  public releaseFileLocks(agentName: string): void { this.lockManager.releaseFileLocks(agentName); }
  public releaseFiles(files: string[]): void { this.lockManager.releaseFiles(files); }
  public clearAllLocks(): number { return this.lockManager.clearAllLocks(); }
  public getLockedFiles(): Map<string, string> { return this.lockManager.getLockedFiles(); }
  public pruneStaleLocks(maxAgeMs?: number): number { return this.lockManager.pruneStaleLocks(maxAgeMs); }
}
