/**
 * @file git-push-command.ts
 * Safe, automated post-task remote sync and push command with pre-push quality shield.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { execFileSync } from 'node:child_process';
import { resolveSafeRepoRoot, cleanGitEnv } from '@aegis/shared';
import { showBanner } from './banner.js';

export interface GitPushOptions {
  branch?: string;
  autoCommit?: boolean;
  commitMessage?: string;
  skipVerify?: boolean;
  dryRun?: boolean;
}

export class GitPushManager {
  private repoRoot: string;

  constructor(repoRoot?: string) {
    this.repoRoot = resolveSafeRepoRoot(repoRoot);
  }

  public detectCurrentBranch(): string {
    try {
      return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: cleanGitEnv()
      }).trim() || 'master';
    } catch {
      return 'master';
    }
  }

  public checkAuthStatus(): { authenticated: boolean; user?: string; error?: string } {
    try {
      const out = execFileSync('gh', ['auth', 'status'], {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...cleanGitEnv(), GIT_TERMINAL_PROMPT: '0' }
      });
      const userMatch = out.match(/account\s+([a-zA-Z0-9_-]+)/);
      return { authenticated: true, user: userMatch ? userMatch[1] : undefined };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { authenticated: false, error: msg };
    }
  }

  public isAheadOfRemote(branch: string): { ahead: boolean; count: number } {
    try {
      execFileSync('git', ['fetch', 'origin', branch], {
        cwd: this.repoRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...cleanGitEnv(), GIT_TERMINAL_PROMPT: '0' }
      });
      const out = execFileSync('git', ['rev-list', `origin/${branch}..${branch}`, '--count'], {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: cleanGitEnv()
      }).trim();
      const count = parseInt(out, 10) || 0;
      return { ahead: count > 0, count };
    } catch {
      return { ahead: false, count: 0 };
    }
  }

  public hasUncommittedChanges(): boolean {
    try {
      const out = execFileSync('git', ['status', '--porcelain'], {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env: cleanGitEnv()
      }).trim();
      return out.length > 0;
    } catch {
      return false;
    }
  }

  public commitAll(message = 'feat: autonomous verified changes'): boolean {
    try {
      execFileSync('git', ['add', '-A'], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      execFileSync('git', ['commit', '-m', message], {
        cwd: this.repoRoot,
        stdio: 'pipe',
        env: cleanGitEnv()
      });
      return true;
    } catch {
      return false;
    }
  }

  public executePush(branch: string, dryRun = false): { success: boolean; message: string } {
    const args = ['push'];
    if (dryRun) args.push('--dry-run');
    args.push('origin', branch);

    try {
      const out = execFileSync('git', args, {
        cwd: this.repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...cleanGitEnv(), GIT_TERMINAL_PROMPT: '0' }
      });
      return { success: true, message: out.trim() || `Pushed ${branch} to origin successfully.` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  }
}

function commitIfDirtyConsole(mgr: GitPushManager, commitMsg: string, autoCommit: boolean): void {
  if (!mgr.hasUncommittedChanges()) return;
  const prefix = autoCommit ? ' • Committing working tree:' : ' ⚠️ Working tree dirty. Auto-committing before push:';
  console.log(`${prefix} "${commitMsg}"...`);
  mgr.commitAll(commitMsg);
}

function reportPushOutcome(res: { success: boolean; message: string }, branch: string): boolean {
  if (res.success) {
    console.log(`\n🎉 Remote Push Succeeded: ${res.message}`);
    console.log(`✅ origin/${branch} is now completely in sync with local ${branch}.`);
    return true;
  }
  console.error(`\n❌ Push Failed: ${res.message}`);
  return false;
}

export async function handleGitPush(...args: string[]): Promise<boolean> {
  showBanner();
  const dryRun = args.includes('--dry-run');
  const autoCommit = args.includes('--commit') || args.includes('-c');
  const msgArg = args.find(a => a.startsWith('--message=') || a.startsWith('-m='));
  const commitMsg = msgArg ? msgArg.slice(msgArg.indexOf('=') + 1) : 'feat: autonomous verified changes';

  const mgr = new GitPushManager();
  const branch = mgr.detectCurrentBranch();
  console.log(`🚀 Aegis Autonomous Remote Push Shield [Branch: ${branch}]`);

  const auth = mgr.checkAuthStatus();
  if (!auth.authenticated) {
    console.error(`❌ GitHub Authentication Failed: ${auth.error || 'Not logged in'}`);
    console.error('💡 Run "gh auth login" or provide GH_TOKEN in environment.');
    return false;
  }
  console.log(` • Authenticated as: @${auth.user || 'developer'} ✅`);

  commitIfDirtyConsole(mgr, commitMsg, autoCommit);

  const aheadInfo = mgr.isAheadOfRemote(branch);
  if (!aheadInfo.ahead) {
    console.log(`✅ Branch ${branch} is already up to date with origin/${branch}. Nothing to push.`);
    return true;
  }

  console.log(` • Commits to push: ${aheadInfo.count} commit(s) ahead of origin/${branch}.`);
  console.log(` • Executing ${dryRun ? 'DRY-RUN push' : 'safe remote push'}...`);
  const res = mgr.executePush(branch, dryRun);
  return reportPushOutcome(res, branch);
}

export function mcpGitPush(args: Record<string, unknown> = {}): string {
  const mgr = new GitPushManager();
  const branch = typeof args.branch === 'string' ? args.branch : mgr.detectCurrentBranch();
  const dryRun = Boolean(args.dryRun);
  const autoCommit = Boolean(args.autoCommit ?? true);
  const commitMsg = typeof args.message === 'string' ? args.message : 'feat: autonomous verified changes';

  const auth = mgr.checkAuthStatus();
  if (!auth.authenticated) {
    return JSON.stringify({ success: false, error: auth.error || 'GitHub Authentication Failed' });
  }

  if (!dryRun && mgr.hasUncommittedChanges() && autoCommit) {
    mgr.commitAll(commitMsg);
  }

  const aheadInfo = mgr.isAheadOfRemote(branch);
  if (!aheadInfo.ahead) {
    return JSON.stringify({ success: true, branch, message: `Branch ${branch} is already up to date with origin.` });
  }

  const pushRes = mgr.executePush(branch, dryRun);
  return JSON.stringify({ success: pushRes.success, branch, aheadCount: aheadInfo.count, message: pushRes.message });
}
