import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentWorktree } from '@aegis/shared';

export function parseWorktreePorcelainBlock(block: string, worktreePrefix: string): AgentWorktree | null {
  if (!block.trim()) return null;
  const lines = block.split('\n');
  const worktreeLine = lines.find(l => l.startsWith('worktree '));
  const branchLine = lines.find(l => l.startsWith('branch '));
  if (!worktreeLine) return null;

  const wtPath = worktreeLine.replace('worktree ', '').trim();
  const branch = branchLine ? branchLine.replace('branch refs/heads/', '').trim() : 'HEAD';
  if (!wtPath.includes(worktreePrefix)) return null;

  return {
    agentName: path.basename(wtPath),
    branch,
    path: wtPath,
    status: 'idle',
    lockedFiles: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export const normPath = (p: string): string => p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
export { WorktreeMutexShield, type ActiveLockInfo } from '@aegis/shared';

export function cleanGitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  delete env.GIT_DIR;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_WORK_TREE;
  delete env.GIT_PREFIX;
  delete env.GIT_COMMON_DIR;
  return env;
}

export class WorktreeMutex {
  public static safeUnlock(lockDir: string): () => void {
    return () => {
      for (let i = 0; i < 3; i++) {
        try {
          fs.rmSync(lockDir, { recursive: true, force: true });
          break;
        } catch { /* ignore */ }
      }
    };
  }

  public static isLockStale(lockDir: string, pidFile: string): boolean {
    const stat = fs.statSync(lockDir, { throwIfNoEntry: false });
    if (!stat) return true;
    const age = Date.now() - stat.mtimeMs;
    if (age > 60000) return true;

    try {
      const rawPid = fs.readFileSync(pidFile, 'utf8').trim();
      const ownerPid = parseInt(rawPid, 10);
      if (!Number.isFinite(ownerPid) || ownerPid <= 0) {
        return age > 5000;
      }
      process.kill(ownerPid, 0);
      return false;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ESRCH') return true;
      if (code === 'EPERM') return false;
      return age > 30000;
    }
  }

  public static acquire(lockFilePath: string, maxRetries = 120, retryDelay = 50): () => void {
    const lockDir = `${lockFilePath}.lock`;
    const pidFile = path.join(lockDir, 'pid');
    fs.mkdirSync(path.dirname(lockDir), { recursive: true });

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        fs.mkdirSync(lockDir);
        fs.writeFileSync(pidFile, String(process.pid), 'utf8');
        return WorktreeMutex.safeUnlock(lockDir);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== 'EEXIST') throw err;
        if (WorktreeMutex.isLockStale(lockDir, pidFile)) {
          try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* ignore */ }
          continue;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelay);
      }
    }
    throw new Error('Aegis Mutex Timeout: Failed to acquire lock within 6000ms');
  }
}
