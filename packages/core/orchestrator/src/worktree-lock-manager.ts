import { isLockConflict, isLockEntryStale, type LockMetadata } from './worktree-lock-helpers.js';
import { WorktreeLockStore, type WorktreeLockManagerOptions } from './worktree-lock-store.js';
import { matchesLockOwner, normPath } from './worktree-mutex.js';

export { isLockConflict, type LockMetadata } from './worktree-lock-helpers.js';
export type { WorktreeLockManagerOptions } from './worktree-lock-store.js';

function findLockOwner(
  activeLocks: Map<string, string>,
  file: string,
  agentName?: string
): string | undefined {
  for (const [k, v] of activeLocks.entries()) {
    if (agentName && matchesLockOwner(v, agentName)) continue;
    if (isLockConflict(k, file)) return v;
  }
  return undefined;
}

function pruneStaleLocksInternal(
  activeLocks: Map<string, string>,
  lockMeta: Map<string, LockMetadata>,
  maxAgeMs: number
): number {
  let pruned = 0;
  const now = Date.now();
  for (const [file] of activeLocks.entries()) {
    const meta = lockMeta.get(file);
    if (isLockEntryStale(meta, now, maxAgeMs)) {
      activeLocks.delete(file);
      lockMeta.delete(file);
      pruned++;
    }
  }
  return pruned;
}

export class WorktreeLockManager extends WorktreeLockStore {
  constructor(options: WorktreeLockManagerOptions = {}) {
    super(options);
  }

  public acquireFileLocks(agentName: string, files: string[]): { success: boolean; conflictingFiles: string[] } {
    return this.withLock(() => {
      pruneStaleLocksInternal(this.activeLocks, this.lockMeta, this.staleTimeoutMs);
      const conflictingFiles: string[] = [];
      const normalized = files.map(normPath);
      for (const file of normalized) {
        const existingOwner = findLockOwner(this.activeLocks, file, agentName);
        if (existingOwner) conflictingFiles.push(file);
      }
      if (conflictingFiles.length > 0) return { success: false, conflictingFiles };
      const now = Date.now();
      for (const file of normalized) {
        this.activeLocks.set(file, agentName);
        this.lockMeta.set(file, { acquiredAt: now, pid: process.pid });
      }
      return { success: true, conflictingFiles: [] };
    });
  }

  public acquireBatchLocks(batch: Array<{ agentName: string; files: string[] }>): {
    success: boolean;
    conflictingFiles: string[];
  } {
    return this.withLock(() => {
      pruneStaleLocksInternal(this.activeLocks, this.lockMeta, this.staleTimeoutMs);
      const conflictingFiles: string[] = [];
      const toApply: Array<{ file: string; agentName: string }> = [];
      for (const item of batch) {
        for (const rawFile of item.files) {
          const file = normPath(rawFile);
          const owner = findLockOwner(this.activeLocks, file, item.agentName);
          const inBatch = toApply.find(a => !matchesLockOwner(a.agentName, item.agentName) && isLockConflict(a.file, file));
          if (owner || inBatch) conflictingFiles.push(file);
          else toApply.push({ file, agentName: item.agentName });
        }
      }
      if (conflictingFiles.length > 0) return { success: false, conflictingFiles };
      const now = Date.now();
      for (const { file, agentName } of toApply) {
        this.activeLocks.set(file, agentName);
        this.lockMeta.set(file, { acquiredAt: now, pid: process.pid });
      }
      return { success: true, conflictingFiles: [] };
    });
  }

  public releaseFileLocks(agentName: string): void {
    this.withLock(() => {
      for (const [file, owner] of this.activeLocks.entries()) {
        if (matchesLockOwner(owner, agentName)) {
          this.activeLocks.delete(file);
          this.lockMeta.delete(file);
        }
      }
    });
  }

  public releaseFiles(files: string[]): void {
    this.withLock(() => {
      const lowerSet = new Set(files.map(f => normPath(f).toLowerCase()));
      for (const file of this.activeLocks.keys()) {
        if (lowerSet.has(file.toLowerCase())) {
          this.activeLocks.delete(file);
          this.lockMeta.delete(file);
        }
      }
    });
  }

  public pruneStaleLocks(maxAgeMs = this.staleTimeoutMs): number {
    return this.withLock(() => pruneStaleLocksInternal(this.activeLocks, this.lockMeta, maxAgeMs));
  }
}
