import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogIgnored, safeParseJson, stripBom } from '@aegis/shared';
import { normPath } from './worktree-mutex.js';

export interface LockMetadata {
  acquiredAt: number;
  pid?: number;
}

export function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as { code?: string })?.code === 'EPERM';
  }
}

export function parseLockEntry(val: unknown): { agent: string; metadata?: LockMetadata } | null {
  if (typeof val === 'string' || typeof val === 'number') {
    const agent = String(val).trim();
    return agent ? { agent } : null;
  }
  if (val && typeof typeof val === 'object' && val !== null) {
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

export function parseLockKey(key: string): { filePath: string; section?: string } {
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

export function isLockEntryStale(meta: LockMetadata | undefined, now: number, maxAgeMs: number): boolean {
  if (!meta) return false;
  if (meta.pid !== undefined && !isPidAlive(meta.pid)) return true;
  return typeof meta.acquiredAt === 'number' && now - meta.acquiredAt > maxAgeMs;
}

export function readMetaFile(metaFile: string): Map<string, LockMetadata> {
  const map = new Map<string, LockMetadata>();
  if (!fs.existsSync(metaFile)) return map;
  try {
    const raw = stripBom(fs.readFileSync(metaFile, 'utf8')).trim();
    const data = raw ? safeParseJson(raw) : null;
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data)) {
        const obj = v as Record<string, unknown> | null;
        if (typeof obj?.acquiredAt === 'number') {
          map.set(normPath(k), { acquiredAt: obj.acquiredAt, pid: typeof obj.pid === 'number' ? obj.pid : undefined });
        }
      }
    }
  } catch (err: unknown) {
    debugLogIgnored('WorktreeLockManager:readMetaFile', err);
  }
  return map;
}

export function writeAtomicJsonFile(filePath: string, data: unknown): void {
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    try {
      fs.renameSync(tmp, filePath);
    } catch (renameErr: unknown) {
      debugLogIgnored('WorktreeLockManager:renameTmp', renameErr);
      fs.copyFileSync(tmp, filePath);
    }
  } catch (err: unknown) {
    debugLogIgnored('WorktreeLockManager:writeAtomicJson', err);
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    } catch (cleanupErr: unknown) {
      debugLogIgnored('WorktreeLockManager:cleanupTmp', cleanupErr);
    }
  }
}

export function backupCorruptLockFile(lockFile: string): void {
  try {
    fs.renameSync(lockFile, `${lockFile}.corrupt.${Date.now()}`);
  } catch (renameErr: unknown) {
    debugLogIgnored('WorktreeLockManager:renameCorruptLockFile', renameErr);
    try {
      fs.rmSync(lockFile, { force: true });
    } catch (rmErr: unknown) {
      debugLogIgnored('WorktreeLockManager:rmCorruptLockFile', rmErr);
    }
  }
}
