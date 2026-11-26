import { resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeLockManager } from './worktree-lock-manager.js';

export interface WorktreeManagerOptions {
  repoRoot?: string;
  worktreePrefix?: string;
  persistLocks?: boolean;
  staleTimeoutMs?: number;
}

export class WorktreeLockDelegate {
  protected repoRoot: string;
  protected worktreePrefix: string;
  protected lockManager: WorktreeLockManager;

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
