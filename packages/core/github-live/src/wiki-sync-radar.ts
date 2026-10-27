/**
 * @file wiki-sync-radar.ts
 * High-performance Zero-Roundtrip Git Radar and Divergence Tracker for GitHub Wiki.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from './wiki-helpers.js';
import type { WikiFastSyncResult, WikiSyncOptions, WikiSyncStateManifest } from './types.js';

export interface ReconcileParams {
  cloneDir: string;
  remoteUrl: string;
  remoteRepo: string;
  options?: WikiSyncOptions;
}

export class WikiSyncRadar {
  public static isLocalDirty(cloneDir: string): boolean {
    if (!fs.existsSync(cloneDir) || !fs.existsSync(path.join(cloneDir, '.git'))) return false;
    try {
      const out = execFileSync('git', ['-C', cloneDir, 'status', '--porcelain'], {
        stdio: 'pipe',
        encoding: 'utf8',
        env: cleanGitEnv(),
        timeout: 5000
      });
      return out.trim().length > 0;
    } catch {
      return false;
    }
  }

  public static stageAndCommitDirty(cloneDir: string, msg = 'docs(wiki): sync living memory update'): boolean {
    if (!this.isLocalDirty(cloneDir)) return false;
    try {
      const env = cleanGitEnv();
      execFileSync('git', ['-C', cloneDir, 'add', '.'], { stdio: 'pipe', env, timeout: 5000 });
      execFileSync('git', ['-C', cloneDir, 'commit', '-m', msg], { stdio: 'pipe', env, timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  public static getHeadSha(cloneDir: string): string {
    try {
      return execFileSync('git', ['-C', cloneDir, 'rev-parse', 'HEAD'], {
        stdio: 'pipe',
        encoding: 'utf8',
        env: cleanGitEnv(),
        timeout: 5000
      }).trim();
    } catch {
      return '';
    }
  }

  public static getCommitDivergence(cloneDir: string): { ahead: number; behind: number } {
    if (!fs.existsSync(path.join(cloneDir, '.git'))) return { ahead: 0, behind: 0 };
    const env = cleanGitEnv();
    try {
      execFileSync('git', ['-C', cloneDir, 'rev-parse', '--verify', 'origin/master'], {
        stdio: 'pipe',
        env,
        timeout: 5000
      });
    } catch {
      return this.resolveUnpublishedDivergence(cloneDir, env);
    }

    try {
      const out = execFileSync(
        'git',
        ['-C', cloneDir, 'rev-list', '--left-right', '--count', 'HEAD...origin/master'],
        { stdio: 'pipe', encoding: 'utf8', env, timeout: 5000 }
      ).trim();
      const parts = out.split(/\s+/);
      const ahead = parseInt(parts[0] || '0', 10);
      const behind = parseInt(parts[1] || '0', 10);
      return { ahead: isNaN(ahead) ? 0 : ahead, behind: isNaN(behind) ? 0 : behind };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  private static resolveUnpublishedDivergence(cloneDir: string, env: NodeJS.ProcessEnv): { ahead: number; behind: number } {
    try {
      const count = execFileSync('git', ['-C', cloneDir, 'rev-list', '--count', 'HEAD'], {
        stdio: 'pipe',
        encoding: 'utf8',
        env,
        timeout: 5000
      }).trim();
      return { ahead: parseInt(count, 10) || 0, behind: 0 };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  public static resolveManifestPath(cloneDir: string): string {
    return path.join(path.dirname(cloneDir), 'wiki-sync-state.json');
  }

  public static readSyncManifest(manifestPath: string): WikiSyncStateManifest | null {
    if (!fs.existsSync(manifestPath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (typeof parsed.lastSyncTimestamp === 'number' && typeof parsed.headSha === 'string') {
        return parsed as WikiSyncStateManifest;
      }
      return null;
    } catch {
      return null;
    }
  }

  public static writeSyncManifest(manifestPath: string, manifest: WikiSyncStateManifest): void {
    try {
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch {
      // Graceful fallback
    }
  }

  public static isTtlValid(manifest: WikiSyncStateManifest | null, ttlMs = 60_000): boolean {
    return manifest !== null && Date.now() - manifest.lastSyncTimestamp < ttlMs;
  }
}

export function executeFastReconcile(params: ReconcileParams): WikiFastSyncResult {
  const start = Date.now();
  const { cloneDir, options = {} } = params;
  const ttlMs = options.ttlMs ?? 60_000;
  const manifestPath = WikiSyncRadar.resolveManifestPath(cloneDir);
  const manifest = WikiSyncRadar.readSyncManifest(manifestPath);

  const wasDirty = WikiSyncRadar.isLocalDirty(cloneDir);
  if (wasDirty) {
    WikiSyncRadar.stageAndCommitDirty(cloneDir, options.commitMessage);
  }

  const headSha = WikiSyncRadar.getHeadSha(cloneDir);
  if (!options.force && !wasDirty && manifest && WikiSyncRadar.isTtlValid(manifest, ttlMs) && manifest.headSha === headSha) {
    return {
      success: true,
      message: 'Already synchronized with remote (TTL active)',
      pulled: false,
      pushed: false,
      cached: true,
      durationMs: Date.now() - start
    };
  }

  return performNetworkReconcile(params, start, manifestPath);
}

function performNetworkReconcile(params: ReconcileParams, start: number, manifestPath: string): WikiFastSyncResult {
  const { cloneDir, remoteUrl, remoteRepo } = params;
  const env = cleanGitEnv();
  const gitDir = path.join(cloneDir, '.git');

  if (!fs.existsSync(gitDir)) {
    try {
      execFileSync('git', ['clone', remoteUrl, cloneDir], { stdio: 'pipe', timeout: 20000, env });
      const sha = WikiSyncRadar.getHeadSha(cloneDir);
      WikiSyncRadar.writeSyncManifest(manifestPath, {
        lastSyncTimestamp: Date.now(),
        remoteRepo,
        headSha: sha,
        lastStatus: 'clean'
      });
      return { success: true, message: 'Cloned remote wiki repository.', pulled: true, pushed: false, cached: false, durationMs: Date.now() - start };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to clone remote wiki: ${msg}`, pulled: false, pushed: false, cached: false, durationMs: Date.now() - start };
    }
  }

  try {
    execFileSync('git', ['-C', cloneDir, 'fetch', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to fetch remote wiki: ${msg}`, pulled: false, pushed: false, cached: false, durationMs: Date.now() - start };
  }

  return applyDivergence(cloneDir, remoteRepo, start, manifestPath, env);
}

function handleBehindMerge(cloneDir: string, behind: number, env: NodeJS.ProcessEnv) {
  try {
    execFileSync('git', ['-C', cloneDir, 'merge', 'origin/master', '--ff-only'], { stdio: 'pipe', timeout: 10000, env });
    return { pulled: true, pushed: false, message: `Fast-forward merged ${behind} incoming wiki commit(s).`, lastStatus: 'behind' as const };
  } catch {
    return { pulled: false, pushed: false, message: 'Failed to fast-forward merge incoming wiki commits.', lastStatus: 'behind' as const };
  }
}

function handleAheadPush(cloneDir: string, ahead: number, env: NodeJS.ProcessEnv) {
  try {
    execFileSync('git', ['-C', cloneDir, 'push', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
    return { pulled: false, pushed: true, message: `Pushed ${ahead} local wiki commit(s) to remote.`, lastStatus: 'ahead' as const };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { pulled: false, pushed: false, message: `Failed to push local wiki commits: ${msg}`, lastStatus: 'ahead' as const };
  }
}

function handleDivergedReconcile(cloneDir: string, div: { ahead: number; behind: number }, env: NodeJS.ProcessEnv) {
  try {
    execFileSync('git', ['-C', cloneDir, 'merge', 'origin/master', '--allow-unrelated-histories', '-X', 'ours'], { stdio: 'pipe', timeout: 10000, env });
    execFileSync('git', ['-C', cloneDir, 'push', 'origin', 'master'], { stdio: 'pipe', timeout: 15000, env });
    return { pulled: true, pushed: true, message: `Reconciled (${div.behind} pulled, ${div.ahead} pushed) diverged wiki commits.`, lastStatus: 'diverged' as const };
  } catch {
    try {
      execFileSync('git', ['-C', cloneDir, 'merge', '--abort'], { stdio: 'pipe', env });
    } catch {
      // abort cleanup
    }
    return { pulled: false, pushed: false, message: 'Divergence conflict detected during wiki reconciliation.', lastStatus: 'diverged' as const };
  }
}

function resolveDivergenceAction(
  cloneDir: string,
  div: { ahead: number; behind: number },
  env: NodeJS.ProcessEnv
): { pulled: boolean; pushed: boolean; message: string; lastStatus: WikiSyncStateManifest['lastStatus'] } {
  if (div.behind > 0 && div.ahead === 0) return handleBehindMerge(cloneDir, div.behind, env);
  if (div.ahead > 0 && div.behind === 0) return handleAheadPush(cloneDir, div.ahead, env);
  if (div.ahead > 0 && div.behind > 0) return handleDivergedReconcile(cloneDir, div, env);
  return { pulled: false, pushed: false, message: 'Wiki up to date with remote.', lastStatus: 'clean' };
}

function applyDivergence(
  cloneDir: string,
  remoteRepo: string,
  start: number,
  manifestPath: string,
  env: NodeJS.ProcessEnv
): WikiFastSyncResult {
  const div = WikiSyncRadar.getCommitDivergence(cloneDir);
  const action = resolveDivergenceAction(cloneDir, div, env);
  const sha = WikiSyncRadar.getHeadSha(cloneDir);

  WikiSyncRadar.writeSyncManifest(manifestPath, {
    lastSyncTimestamp: Date.now(),
    remoteRepo,
    headSha: sha,
    lastStatus: action.lastStatus
  });

  return {
    success: true,
    message: action.message,
    pulled: action.pulled,
    pushed: action.pushed,
    cached: false,
    durationMs: Date.now() - start,
    divergence: div
  };
}
