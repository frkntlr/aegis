import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, resolveSafeRepoRoot, safeParseJson, stripBom } from '@aegis/shared';
import {
  backupCorruptLockFile,
  isLockEntryStale,
  type LockMetadata,
  parseLockEntry,
  readMetaFile,
  writeAtomicJsonFile
} from './worktree-lock-helpers.js';
import { normPath, WorktreeMutex } from './worktree-mutex.js';

export interface WorktreeLockManagerOptions {
  repoRoot?: string;
  persistLocks?: boolean;
  staleTimeoutMs?: number;
}

export class WorktreeLockStore {
  protected repoRoot: string;
  protected persistLocks: boolean;
  protected staleTimeoutMs: number;
  private lockDepth = 0;
  protected activeLocks: Map<string, string> = new Map();
  protected lockMeta: Map<string, LockMetadata> = new Map();

  constructor(options: WorktreeLockManagerOptions = {}) {
    this.repoRoot = resolveSafeRepoRoot(options.repoRoot);
    this.persistLocks = options.persistLocks ?? false;
    this.staleTimeoutMs = options.staleTimeoutMs ?? 5 * 60 * 1000;
    if (this.persistLocks) this.loadLocks();
  }

  public getLockFilePath(): string { return path.resolve(this.repoRoot, '.aegis', 'locks.json'); }
  public getMetaFilePath(): string { return path.resolve(this.repoRoot, '.aegis', 'locks-meta.json'); }

  public withLock<T>(fn: () => T): T {
    if (!this.persistLocks || this.lockDepth > 0) return fn();
    const unlock = WorktreeMutex.acquire(this.getLockFilePath());
    this.lockDepth++;
    try {
      this.loadLocks();
      const res = fn();
      this.saveLocks();
      return res;
    } finally {
      this.lockDepth--;
      unlock();
    }
  }

  public loadLocks(): void {
    const lockFile = this.getLockFilePath();
    if (!fs.existsSync(lockFile)) return;
    try {
      const raw = stripBom(fs.readFileSync(lockFile, 'utf8')).trim();
      if (!raw) throw new Error('Empty lock file');
      const data = safeParseJson(raw);
      if (!data || typeof data !== 'object') throw new Error('Invalid lock structure');

      const metaMap = readMetaFile(this.getMetaFilePath());
      const fileStat = fs.statSync(lockFile, { throwIfNoEntry: false });
      const defaultTs = fileStat ? fileStat.mtimeMs : Date.now();
      const now = Date.now();
      this.activeLocks.clear();
      this.lockMeta.clear();

      for (const [rawKey, rawVal] of Object.entries(data)) {
        const file = normPath(rawKey);
        const parsed = parseLockEntry(rawVal);
        if (!parsed) continue;
        const meta: LockMetadata = parsed.metadata ?? metaMap.get(file) ?? { acquiredAt: defaultTs };
        if (isLockEntryStale(meta, now, this.staleTimeoutMs)) continue;
        this.activeLocks.set(file, parsed.agent);
        this.lockMeta.set(file, meta);
      }
    } catch (err: unknown) {
      debugLogIgnored('WorktreeLockManager:loadLocks', err);
      backupCorruptLockFile(lockFile);
      this.activeLocks.clear();
      this.lockMeta.clear();
    }
  }

  public saveLocks(): void {
    if (!this.persistLocks) return;
    writeAtomicJsonFile(this.getLockFilePath(), Object.fromEntries(this.activeLocks.entries()));
    writeAtomicJsonFile(this.getMetaFilePath(), Object.fromEntries(this.lockMeta.entries()));
  }

  public clearAllLocks(): number {
    return this.withLock(() => {
      const count = this.activeLocks.size;
      this.activeLocks.clear();
      this.lockMeta.clear();
      return count;
    });
  }

  public getLockedFiles(): Map<string, string> {
    if (this.persistLocks) this.loadLocks();
    return new Map(this.activeLocks);
  }

  public getLockMetadata(): Map<string, LockMetadata> {
    if (this.persistLocks) this.loadLocks();
    return new Map(this.lockMeta);
  }
}
