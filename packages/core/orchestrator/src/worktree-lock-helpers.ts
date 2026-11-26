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
