import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentWorktree, WorktreeListResult } from '@aegis/shared';

export interface WorktreeManagerOptions {
  repoRoot?: string;
  worktreePrefix?: string;
  persistLocks?: boolean;
}

export class WorktreeManager {
  private repoRoot: string;
  private worktreePrefix: string;
  private persistLocks: boolean;
  private activeLocks: Map<string, string> = new Map(); // filePath -> agentName

  constructor(options: WorktreeManagerOptions = {}) {
    this.repoRoot = options.repoRoot ?? process.cwd();
    this.worktreePrefix = options.worktreePrefix ?? 'experimental';
    this.persistLocks = options.persistLocks ?? false;
    if (this.persistLocks) this.loadLocks();
  }

  private getLockFilePath(): string {
    return path.resolve(this.repoRoot, '.aegis', 'locks.json');
  }

  private safeUnlock(lockDir: string): () => void {
    return () => {
      for (let i = 0; i < 3; i++) {
        try {
          fs.rmSync(lockDir, { recursive: true, force: true });
          break;
        } catch { /* ignore */ }
      }
    };
  }

  private acquireMutex(): () => void {
    const lockDir = `${this.getLockFilePath()}.lock`;
    const pidFile = path.join(lockDir, 'pid');
    fs.mkdirSync(path.dirname(lockDir), { recursive: true });
    const maxRetries = 120;
    const retryDelay = 50;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        fs.mkdirSync(lockDir);
        fs.writeFileSync(pidFile, String(process.pid), 'utf8');
        return this.safeUnlock(lockDir);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== 'EEXIST') throw err;
        if (this.isLockStale(lockDir, pidFile)) {
          try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* ignore */ }
          continue;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelay);
      }
    }
    throw new Error('Aegis Mutex Timeout: Failed to acquire lock within 6000ms');
  }

  private isLockStale(lockDir: string, pidFile: string): boolean {
    const stat = fs.statSync(lockDir, { throwIfNoEntry: false });
    if (!stat) return true;
    const age = Date.now() - stat.mtimeMs;

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

  private withLock<T>(fn: () => T): T {
    if (!this.persistLocks) return fn();
    const unlock = this.acquireMutex();
    try {
      this.loadLocks();
      const res = fn();
      this.saveLocks();
      return res;
    } finally {
      unlock();
    }
  }

  private loadLocks(): void {
    const lockFile = this.getLockFilePath();
    if (fs.existsSync(lockFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        this.activeLocks = new Map(Object.entries(data));
      } catch {
        this.activeLocks = new Map();
      }
    }
  }

  private saveLocks(): void {
    if (!this.persistLocks) return;
    try {
      const lockFile = this.getLockFilePath();
      fs.mkdirSync(path.dirname(lockFile), { recursive: true });
      const tmpFile = `${lockFile}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(Object.fromEntries(this.activeLocks.entries()), null, 2), 'utf8');
      try {
        fs.renameSync(tmpFile, lockFile);
      } catch {
        fs.copyFileSync(tmpFile, lockFile);
        try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  public getWorktreePath(agentName: string): string {
    return path.resolve(this.repoRoot, this.worktreePrefix, agentName);
  }

  public detectCurrentBranch(): string {
    try {
      if (fs.existsSync(path.join(this.repoRoot, '.git'))) {
        const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: this.repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        }).trim();
        if (branch && branch !== 'HEAD') return branch;
      }
    } catch { /* ignore */ }
    return 'master';
  }

  public ensureWorktree(agentName: string, baseBranchArg?: string): AgentWorktree {
    const targetDir = this.getWorktreePath(agentName);
    const branchName = `aegis/${agentName}`;
    const baseBranch = baseBranchArg || this.detectCurrentBranch();

    if (!fs.existsSync(targetDir)) {
      try {
        execFileSync('git', ['worktree', 'prune'], {
          cwd: this.repoRoot,
          stdio: 'pipe',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        });
      } catch { /* ignore */ }
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      try {
        execFileSync('git', ['worktree', 'add', targetDir, '-B', branchName, baseBranch], {
          cwd: this.repoRoot,
          stdio: 'pipe',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('already exists') && !message.includes('already checked out') && !message.includes('already registered')) {
          throw err;
        }
      }
    }

    return {
      agentName,
      branch: branchName,
      path: targetDir,
      status: 'idle',
      lockedFiles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  public removeWorktree(agentName: string): boolean {
    const targetDir = this.getWorktreePath(agentName);
    try {
      execFileSync('git', ['worktree', 'remove', targetDir, '--force'], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });
      return true;
    } catch {
      if (fs.existsSync(targetDir)) {
        try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch { /* ignore */ }
        try {
          execFileSync('git', ['worktree', 'prune'], {
            cwd: this.repoRoot,
            stdio: 'pipe',
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
          });
        } catch { /* ignore */ }
        return true;
      }
      return false;
    }
  }

  private parseWorktreeBlock(block: string): AgentWorktree | null {
    if (!block.trim()) return null;
    const lines = block.split('\n');
    const worktreeLine = lines.find(l => l.startsWith('worktree '));
    const branchLine = lines.find(l => l.startsWith('branch '));
    if (!worktreeLine) return null;

    const wtPath = worktreeLine.replace('worktree ', '').trim();
    const branch = branchLine ? branchLine.replace('branch refs/heads/', '').trim() : 'HEAD';
    if (!wtPath.includes(this.worktreePrefix)) return null;

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

  public listWorktrees(): WorktreeListResult {
    try {
      if (!fs.existsSync(path.join(this.repoRoot, '.git'))) {
        return { worktrees: [], activeCount: 0 };
      }
      const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });
      const worktrees = output
        .split('\n\n')
        .map(b => this.parseWorktreeBlock(b))
        .filter((wt): wt is AgentWorktree => Boolean(wt));

      return { worktrees, activeCount: worktrees.length };
    } catch {
      return { worktrees: [], activeCount: 0 };
    }
  }

  public acquireFileLocks(agentName: string, files: string[]): { success: boolean; conflictingFiles: string[] } {
    return this.withLock(() => {
      const conflictingFiles: string[] = [];
      for (const file of files) {
        const existingOwner = this.activeLocks.get(file);
        if (existingOwner && existingOwner !== agentName) {
          conflictingFiles.push(file);
        }
      }
      if (conflictingFiles.length > 0) return { success: false, conflictingFiles };

      for (const file of files) {
        this.activeLocks.set(file, agentName);
      }
      return { success: true, conflictingFiles: [] };
    });
  }

  public releaseFileLocks(agentName: string): void {
    this.withLock(() => {
      for (const [file, owner] of this.activeLocks.entries()) {
        if (owner === agentName) this.activeLocks.delete(file);
      }
    });
  }

  public getLockedFiles(): Map<string, string> {
    if (this.persistLocks) this.loadLocks();
    return new Map(this.activeLocks);
  }
}
