import { execSync } from 'node:child_process';
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
    if (this.persistLocks) {
      this.loadLocks();
    }
  }

  private getLockFilePath(): string {
    return path.resolve(this.repoRoot, '.aegis', 'locks.json');
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
      const obj = Object.fromEntries(this.activeLocks.entries());
      fs.writeFileSync(lockFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch {
      // Ignore write errors gracefully
    }
  }

  public getWorktreePath(agentName: string): string {
    return path.resolve(this.repoRoot, this.worktreePrefix, agentName);
  }

  public ensureWorktree(agentName: string, baseBranch = 'master'): AgentWorktree {
    const targetDir = this.getWorktreePath(agentName);
    const branchName = `aegis/${agentName}`;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      try {
        // Create worktree if it does not exist
        execSync(`git worktree add "${targetDir}" -B "${branchName}" "${baseBranch}"`, {
          cwd: this.repoRoot,
          stdio: 'pipe'
        });
      } catch (err: unknown) {
        // Fallback: If already checked out, recover or reuse
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('already exists') && !message.includes('already checked out')) {
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

  public listWorktrees(): WorktreeListResult {
    try {
      const output = execSync('git worktree list --porcelain', {
        cwd: this.repoRoot,
        encoding: 'utf8'
      });

      const worktrees: AgentWorktree[] = [];
      const blocks = output.split('\n\n');

      for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.split('\n');
        const worktreeLine = lines.find(l => l.startsWith('worktree '));
        const branchLine = lines.find(l => l.startsWith('branch '));

        if (worktreeLine) {
          const wtPath = worktreeLine.replace('worktree ', '').trim();
          const branch = branchLine ? branchLine.replace('branch refs/heads/', '').trim() : 'HEAD';
          
          if (wtPath.includes(this.worktreePrefix)) {
            const agentName = path.basename(wtPath);
            worktrees.push({
              agentName,
              branch,
              path: wtPath,
              status: 'idle',
              lockedFiles: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        }
      }

      return {
        worktrees,
        activeCount: worktrees.length
      };
    } catch {
      return { worktrees: [], activeCount: 0 };
    }
  }

  public acquireFileLocks(agentName: string, files: string[]): { success: boolean; conflictingFiles: string[] } {
    const conflictingFiles: string[] = [];

    for (const file of files) {
      const existingOwner = this.activeLocks.get(file);
      if (existingOwner && existingOwner !== agentName) {
        conflictingFiles.push(file);
      }
    }

    if (conflictingFiles.length > 0) {
      return { success: false, conflictingFiles };
    }

    for (const file of files) {
      this.activeLocks.set(file, agentName);
    }
    this.saveLocks();

    return { success: true, conflictingFiles: [] };
  }

  public releaseFileLocks(agentName: string): void {
    for (const [file, owner] of this.activeLocks.entries()) {
      if (owner === agentName) {
        this.activeLocks.delete(file);
      }
    }
    this.saveLocks();
  }

  public getLockedFiles(): Map<string, string> {
    return new Map(this.activeLocks);
  }
}
