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

      const normTarget = filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim().toLowerCase();

      for (const [lockPath, lockVal] of Object.entries(data)) {
        const normKey = lockPath.replace(/\\/g, '/').replace(/^\.\//, '').trim().toLowerCase();
        if (normKey === normTarget || normKey.endsWith('/' + normTarget) || normTarget.endsWith('/' + normKey)) {
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
