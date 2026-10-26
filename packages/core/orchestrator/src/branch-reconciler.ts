import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { cleanGitEnv } from './worktree-mutex.js';

export interface WorktreeInfo {
  agentName: string;
  branch: string;
  path: string;
}

export interface SyncReport {
  agentName: string;
  passed: boolean;
  message: string;
}

export class BranchReconciler {
  private repoRoot: string;
  private worktreePrefix: string;

  constructor(repoRoot: string, worktreePrefix = 'experimental') {
    this.repoRoot = repoRoot;
    this.worktreePrefix = worktreePrefix;
  }

  public discoverWorktrees(): WorktreeInfo[] {
    try {
      if (!fs.existsSync(path.join(this.repoRoot, '.git'))) return [];
      const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: cleanGitEnv()
      });
      return this.parseWorktreeList(output);
    } catch {
      return [];
    }
  }

  private parseWorktreeList(output: string): WorktreeInfo[] {
    const list: WorktreeInfo[] = [];
    const blocks = output.split('\n\n');
    for (const b of blocks) {
      const lines = b.split('\n');
      const wtLine = lines.find(l => l.startsWith('worktree '));
      const branchLine = lines.find(l => l.startsWith('branch '));
      if (!wtLine) continue;
      const wtPath = wtLine.replace('worktree ', '').trim();
      if (!wtPath.includes(this.worktreePrefix)) continue;
      const branch = branchLine ? branchLine.replace('branch refs/heads/', '').trim() : 'HEAD';
      list.push({
        agentName: path.basename(wtPath),
        branch,
        path: wtPath
      });
    }
    return list;
  }

  public withStashGuard<T>(agentDir: string, fn: () => T): T {
    let stashed = false;
    try {
      const status = execFileSync('git', ['-C', agentDir, 'status', '--porcelain'], {
        stdio: 'pipe',
        encoding: 'utf8',
        env: cleanGitEnv()
      }).trim();
      if (status.length > 0) {
        execFileSync('git', ['-C', agentDir, 'stash', 'push', '-u', '-m', `aegis-guard-${Date.now()}`], {
          stdio: 'pipe',
          env: cleanGitEnv()
        });
        stashed = true;
      }
    } catch { /* proceed if git stash fails */ }

    try {
      return fn();
    } finally {
      if (stashed) {
        try {
          execFileSync('git', ['-C', agentDir, 'stash', 'pop'], {
            stdio: 'pipe',
            env: cleanGitEnv()
          });
        } catch { /* preserve stash on pop conflict */ }
      }
    }
  }

  public resolveBranchName(agentName: string, agentDir: string): string {
    if (fs.existsSync(agentDir)) {
      try {
        const br = execFileSync('git', ['-C', agentDir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
          stdio: 'pipe',
          encoding: 'utf8',
          env: cleanGitEnv()
        }).trim();
        if (br && br !== 'HEAD') return br;
      } catch { /* fallback */ }
    }
    return agentName.startsWith('aegis/') ? agentName : `aegis/${agentName}`;
  }

  public syncWorktree(agentName: string, agentDir: string, baseBranch: string): SyncReport {
    try {
      const dirty = execFileSync('git', ['-C', agentDir, 'status', '--porcelain'], {
        stdio: 'pipe',
        encoding: 'utf8',
        env: cleanGitEnv()
      }).trim();

      if (dirty.length > 0) {
        return {
          agentName,
          passed: true,
          message: `Sibling ${agentName} has uncommitted modifications; skipped hard reset to preserve data.`
        };
      }

      return this.applySync(agentName, agentDir, baseBranch);
    } catch {
      return {
        agentName,
        passed: false,
        message: `Failed to synchronize sibling ${agentName} with ${baseBranch}.`
      };
    }
  }

  private applySync(agentName: string, agentDir: string, baseBranch: string): SyncReport {
    const ahead = this.checkAhead(agentDir, baseBranch);
    if (ahead > 0) {
      execFileSync('git', ['-C', agentDir, 'rebase', baseBranch], {
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      return {
        agentName,
        passed: true,
        message: `Rebased ${agentName} workspace (${ahead} local commit(s)) onto latest ${baseBranch}.`
      };
    }

    execFileSync('git', ['-C', agentDir, 'reset', '--hard', baseBranch], {
      stdio: 'pipe',
      env: cleanGitEnv()
    });
    return {
      agentName,
      passed: true,
      message: `Synchronized ${agentName} workspace with latest ${baseBranch}.`
    };
  }

  private checkAhead(agentDir: string, baseBranch: string): number {
    try {
      const raw = execFileSync('git', ['-C', agentDir, 'rev-list', '--count', `${baseBranch}..HEAD`], {
        stdio: 'pipe',
        encoding: 'utf8',
        env: cleanGitEnv()
      }).trim();
      return parseInt(raw, 10) || 0;
    } catch {
      return 0;
    }
  }

  public syncAll(baseBranch: string, excludeAgent?: string): SyncReport[] {
    const discovered = this.discoverWorktrees();
    const reports: SyncReport[] = [];
    for (const wt of discovered) {
      if (wt.agentName === excludeAgent) continue;
      reports.push(this.syncWorktree(wt.agentName, wt.path, baseBranch));
    }
    return reports;
  }
}
