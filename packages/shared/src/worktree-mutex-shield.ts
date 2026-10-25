import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ActiveLockInfo {
  filePath: string;
  lockedBy: string;
  lockId?: string;
  isLockedByOther: boolean;
  warning?: string;
}

export class WorktreeMutexShield {
  public static isPidAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  public static normalizeLockPath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/')
      .replace(/^(experimental\/(solver|qa|ui|docs)\/)/, '')
      .replace(/^\.\//, '')
      .trim()
      .toLowerCase();
  }

  public static inspectLock(
    filePath: string,
    currentWorktreeOrAgent = 'default',
    rootDir = process.cwd()
  ): ActiveLockInfo | null {
    const lockFile = path.resolve(rootDir, '.aegis', 'locks.json');
    if (!fs.existsSync(lockFile)) return null;

    try {
      const raw = fs.readFileSync(lockFile, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;

      const normTarget = WorktreeMutexShield.normalizeLockPath(filePath);

      for (const [lockPath, lockVal] of Object.entries(data)) {
        const normKey = WorktreeMutexShield.normalizeLockPath(lockPath);
        if (normKey === normTarget || normKey.endsWith('/' + normTarget) || normTarget.endsWith('/' + normKey)) {
          if (lockVal && typeof lockVal === 'object') {
            const pid = Number((lockVal as { pid?: number }).pid);
            if (pid && !WorktreeMutexShield.isPidAlive(pid)) continue;
          }
          return WorktreeMutexShield.buildLockInfo(filePath, lockVal, currentWorktreeOrAgent);
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private static buildLockInfo(
    filePath: string,
    lockVal: unknown,
    currentWorktreeOrAgent: string
  ): ActiveLockInfo {
    let lockedBy = 'unknown';
    let lockId: string | undefined;

    if (typeof lockVal === 'string') {
      lockedBy = lockVal;
    } else if (lockVal && typeof lockVal === 'object') {
      const obj = lockVal as Record<string, unknown>;
      lockedBy = String(obj.agent || obj.worktreeId || 'unknown');
      if (obj.lockId) lockId = String(obj.lockId);
    }

    const normCurrent = currentWorktreeOrAgent.replace(/^aegis\//, '').toLowerCase();
    const normOwner = lockedBy.replace(/^aegis\//, '').toLowerCase();
    const isLockedByOther = normOwner !== normCurrent && normOwner !== 'none';

    let warning: string | undefined;
    if (isLockedByOther) {
      const idPart = lockId ? ` (Lock ID: ${lockId})` : '';
      warning = [
        '🔒 Worktree Mutex Uyarısı:',
        `   Bu dosya şu anda '${lockedBy}' ajanı tarafından kilitlenmiştir${idPart}.`,
        '   Paralel yazma çakışmaya yol açacaktır; görevi erteleyiniz veya salt-okunur modda devam ediniz.'
      ].join('\n');
    }

    return { filePath, lockedBy, lockId, isLockedByOther, warning };
  }
}
