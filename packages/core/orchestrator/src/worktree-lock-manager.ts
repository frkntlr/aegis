import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { WorktreeMutex, normPath, matchesLockOwner } from './worktree-mutex.js';

export interface LockMetadata {
  acquiredAt: number;
  pid?: number;
}

export interface WorktreeLockManagerOptions {
  repoRoot?: string;
  persistLocks?: boolean;
  staleTimeoutMs?: number;
}

function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as { code?: string })?.code === 'EPERM';
  }
}

function parseLockEntry(val: unknown): { agent: string; metadata?: LockMetadata } | null {
  if (typeof val === 'string' || typeof val === 'number') {
    const agent = String(val).trim();
    return agent ? { agent } : null;
  }
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const rawAgent = obj.agent ?? obj.lockedBy ?? obj.worktreeId;
    if (typeof rawAgent === 'string' && rawAgent.trim()) {
      return {
        agent: rawAgent.trim(),
        metadata: {
          acquiredAt: typeof obj.acquiredAt === 'number' ? obj.acquiredAt : Date.now(),
          pid: typeof obj.pid === 'number' ? obj.pid : undefined
        }
      };
    }
  }
  return null;
}

function parseLockKey(key: string): { filePath: string; section?: string } {
  const norm = normPath(key);
  const hashIdx = norm.indexOf('#');
  return hashIdx >= 0
    ? { filePath: norm.slice(0, hashIdx).toLowerCase(), section: norm.slice(hashIdx + 1).toLowerCase() }
    : { filePath: norm.toLowerCase() };
}

export function isLockConflict(keyA: string, keyB: string): boolean {
  const a = parseLockKey(keyA);
  const b = parseLockKey(keyB);
  if (a.filePath !== b.filePath) return false;
  if (!a.section || !b.section) return true;
  return a.section === b.section;
}

export class WorktreeLockManager {
  private repoRoot: string;
  private persistLocks: boolean;
  private staleTimeoutMs: number;
  private activeLocks: Map<string, string> = new Map();
  private lockMeta: Map<string, LockMetadata> = new Map();

  constructor(options: WorktreeLockManagerOptions = {}) {
    this.repoRoot = resolveSafeRepoRoot(options.repoRoot);
    this.persistLocks = options.persistLocks ?? false;
    this.staleTimeoutMs = options.staleTimeoutMs ?? 5 * 60 * 1000;
    if (this.persistLocks) this.loadLocks();
  }

  public getLockFilePath(): string { return path.resolve(this.repoRoot, '.aegis', 'locks.json'); }
  public getMetaFilePath(): string { return path.resolve(this.repoRoot, '.aegis', 'locks-meta.json'); }

  public withLock<T>(fn: () => T): T {
    if (!this.persistLocks) return fn();
    const unlock = WorktreeMutex.acquire(this.getLockFilePath());
    try {
      this.loadLocks();
      const res = fn();
      this.saveLocks();
      return res;
    } finally {
      unlock();
    }
  }

  private readMetaFile(): Map<string, LockMetadata> {
    const metaFile = this.getMetaFilePath();
    const map = new Map<string, LockMetadata>();
    if (!fs.existsSync(metaFile)) return map;
    try {
      const raw = fs.readFileSync(metaFile, 'utf8').trim();
      const data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
          const obj = v as Record<string, unknown> | null;
          if (typeof obj?.acquiredAt === 'number') {
            map.set(normPath(k), { acquiredAt: obj.acquiredAt, pid: typeof obj.pid === 'number' ? obj.pid : undefined });
          }
        }
      }
    } catch { /* ignore meta read errors */ }
    return map;
  }

  private handleCorruptLockFile(lockFile: string): void {
    try { fs.renameSync(lockFile, `${lockFile}.corrupt.${Date.now()}`); } catch {
      try { fs.rmSync(lockFile, { force: true }); } catch { /* ignore */ }
    }
    this.activeLocks.clear();
    this.lockMeta.clear();
  }

  private isLockEntryStale(meta: LockMetadata | undefined, now: number, maxAgeMs: number): boolean {
    if (!meta) return false;
    if (meta.pid !== undefined && !isPidAlive(meta.pid)) return true;
    return typeof meta.acquiredAt === 'number' && now - meta.acquiredAt > maxAgeMs;
  }

  public loadLocks(): void {
    const lockFile = this.getLockFilePath();
    if (!fs.existsSync(lockFile)) return;
    try {
      const raw = fs.readFileSync(lockFile, 'utf8').trim();
      if (!raw) throw new Error('Empty lock file');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') throw new Error('Invalid lock structure');

      const metaMap = this.readMetaFile();
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
        if (this.isLockEntryStale(meta, now, this.staleTimeoutMs)) continue;
        this.activeLocks.set(file, parsed.agent);
        this.lockMeta.set(file, meta);
      }
    } catch {
      this.handleCorruptLockFile(lockFile);
    }
  }

  private writeAtomicJson(filePath: string, data: unknown): void {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      try { fs.renameSync(tmp, filePath); } catch {
        fs.copyFileSync(tmp, filePath);
        try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
      }
    } catch { /* ignore write failure */ }
  }

  public saveLocks(): void {
    if (!this.persistLocks) return;
    this.writeAtomicJson(this.getLockFilePath(), Object.fromEntries(this.activeLocks.entries()));
    this.writeAtomicJson(this.getMetaFilePath(), Object.fromEntries(this.lockMeta.entries()));
  }

  private findLockOwner(file: string, agentName?: string): string | undefined {
    for (const [k, v] of this.activeLocks.entries()) {
      if (agentName && matchesLockOwner(v, agentName)) continue;
      if (isLockConflict(k, file)) return v;
    }
    return undefined;
  }

  public acquireFileLocks(agentName: string, files: string[]): { success: boolean; conflictingFiles: string[] } {
    return this.withLock(() => {
      this.pruneStaleLocks();
      const conflictingFiles: string[] = [];
      const normalized = files.map(normPath);
      for (const file of normalized) {
        const existingOwner = this.findLockOwner(file, agentName);
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
      this.pruneStaleLocks();
      const conflictingFiles: string[] = [];
      const toApply: Array<{ file: string; agentName: string }> = [];
      for (const item of batch) {
        for (const rawFile of item.files) {
          const file = normPath(rawFile);
          const owner = this.findLockOwner(file, item.agentName);
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

  public pruneStaleLocks(maxAgeMs = this.staleTimeoutMs): number {
    return this.withLock(() => {
      let pruned = 0;
      const now = Date.now();
      for (const [file] of this.activeLocks.entries()) {
        const meta = this.lockMeta.get(file);
        if (this.isLockEntryStale(meta, now, maxAgeMs)) {
          this.activeLocks.delete(file);
          this.lockMeta.delete(file);
          pruned++;
        }
      }
      return pruned;
    });
  }
}
