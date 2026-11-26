/**
 * @file engine-updater.ts
 * Dynamic version radar, clean workspace reinstallation, and PC-wide Aegis update engine.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as cp from 'node:child_process';
import { cleanGitEnv, debugLogIgnored, readJsonSafe, resolveSafeRepoRoot } from '@aegis/shared';
import { VersionManager } from './version-manager.js';
import { refreshEngineInstallations, resolveUpdateEngineRoot } from './engine-update-refresh.js';
import { runEngineUpdate } from './engine-update-run.js';
import type {
  EngineUpdateOptions,
  EngineUpdateResult,
  EngineVersionReport,
  MonorepoPackageInfo
} from './engine-update-types.js';

export type {
  EngineUpdateOptions,
  EngineUpdateResult,
  EngineVersionReport,
  MonorepoPackageInfo
} from './engine-update-types.js';

function runGitCommand(args: string[], cwd: string, timeout = 15000): string | null {
  try {
    return cp.execFileSync('git', args, { cwd, timeout, env: cleanGitEnv(), stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch { return null; }
}

function calculateRepoDrift(
  repoRoot: string, branch: string, localCommit: string, remoteCommit: string
): { driftStatus: 'synced' | 'behind' | 'ahead' | 'diverged' | 'offline'; behindCount: number; aheadCount: number } {
  if (remoteCommit === 'offline') return { driftStatus: 'offline', behindCount: 0, aheadCount: 0 };
  if (localCommit === remoteCommit) return { driftStatus: 'synced', behindCount: 0, aheadCount: 0 };

  const countRev = runGitCommand(['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`], repoRoot);
  if (!countRev) return { driftStatus: 'diverged', behindCount: 0, aheadCount: 0 };

  const [aheadStr, behindStr] = countRev.split(/\s+/);
  const aheadCount = parseInt(aheadStr, 10) || 0;
  const behindCount = parseInt(behindStr, 10) || 0;

  if (behindCount > 0 && aheadCount > 0) return { driftStatus: 'diverged', behindCount, aheadCount };
  if (behindCount > 0) return { driftStatus: 'behind', behindCount, aheadCount: 0 };
  if (aheadCount > 0) return { driftStatus: 'ahead', behindCount: 0, aheadCount };
  return { driftStatus: 'synced', behindCount: 0, aheadCount: 0 };
}

function listInstalledShimsHelper(): string[] {
  const userHome = os.homedir();
  const binDir = path.resolve(userHome, '.gemini', 'antigravity', 'bin');
  if (!fs.existsSync(binDir)) return [];
  return fs.readdirSync(binDir).filter(f => f.startsWith('aegis') || f.startsWith('tw'));
}

function countMcpToolsHelper(): number {
  const userHome = os.homedir();
  const mcpDir = path.resolve(userHome, '.gemini', 'antigravity', 'mcp', 'aegis');
  if (!fs.existsSync(mcpDir)) return 0;
  return fs.readdirSync(mcpDir).filter(f => f.endsWith('.json')).length;
}

export class EngineUpdater {
  public static safeExec(cmd: string, cwd: string, timeoutMs = 15000): string | null {
    try {
      const env = { ...cleanGitEnv(), GIT_ASKPASS: '', SSH_ASKPASS: '' };
      return cp.execSync(cmd, { cwd, timeout: timeoutMs, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    } catch {
      return null;
    }
  }

  public static discoverMonorepoPackages(repoRoot: string): MonorepoPackageInfo[] {
    const pkgs: MonorepoPackageInfo[] = [];
    const pkgsDir = path.resolve(repoRoot, 'packages');
    if (!fs.existsSync(pkgsDir)) return pkgs;

    const scan = (dir: string): void => {
      for (const entry of fs.readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        const sub = path.join(dir, entry);
        if (fs.statSync(sub).isDirectory()) {
          const pj = path.join(sub, 'package.json');
          if (fs.existsSync(pj)) {
            try {
              const parsed = readJsonSafe<{ name?: string; version?: string }>(pj);
              if (parsed.name) pkgs.push({ name: parsed.name, version: parsed.version || '0.1.0' });
            } catch (err: unknown) { debugLogIgnored('EngineUpdater:discoverPackages', err); }
          }
          scan(sub);
        }
      }
    };
    scan(pkgsDir);
    return pkgs;
  }

  public static getVersionReport(repoRoot?: string): EngineVersionReport {
    const root = resolveUpdateEngineRoot(repoRoot);
    const rootPkgPath = path.resolve(root, 'package.json');
    let currentVersion = '0.1.0';
    if (fs.existsSync(rootPkgPath)) {
      try {
        currentVersion = readJsonSafe<{ version?: string }>(rootPkgPath).version || '0.1.0';
      } catch (err: unknown) { debugLogIgnored('EngineUpdater:getVersionReport', err); }
    }

    const localCommit = this.safeExec('git rev-parse --short HEAD', root) || 'unknown';
    const branch = this.safeExec('git rev-parse --abbrev-ref HEAD', root) || 'master';
    const remoteRaw = runGitCommand(['ls-remote', 'origin', `refs/heads/${branch}`], root);
    const remoteCommit = remoteRaw ? remoteRaw.split(/\s+/)[0]?.slice(0, 7) || 'unknown' : 'offline';

    const { driftStatus, behindCount, aheadCount } = calculateRepoDrift(root, branch, localCommit, remoteCommit);
    const monorepoPackages = this.discoverMonorepoPackages(root);
    const installedShims = listInstalledShimsHelper();
    const mcpToolCount = countMcpToolsHelper();
    const wtOutput = this.safeExec('git worktree list', root);
    const worktreesCount = wtOutput ? wtOutput.split('\n').filter(Boolean).length : 1;
    const grade = VersionManager.checkVersionGrade(currentVersion, root);
    const nextRecommended = grade.upgradeAvailable && grade.latestTag
      ? grade.latestTag.replace(/^v/, '')
      : grade.nextPatch;

    return {
      currentVersion, localCommit, remoteCommit, branch, driftStatus,
      behindCount, aheadCount, worktreesCount, monorepoPackages,
      installedShims, mcpToolCount, latestTag: grade.latestTag,
      upgradeAvailable: grade.upgradeAvailable, nextRecommendedVersion: nextRecommended,
      nextPatch: grade.nextPatch, nextMinor: grade.nextMinor, timestamp: new Date().toISOString()
    };
  }

  public static cleanWorkspace(repoRoot?: string): { cachesRemoved: string[]; locksCleared: number } {
    const root = resolveSafeRepoRoot(repoRoot);
    const cachesRemoved: string[] = [];
    const targets = [
      path.resolve(root, '.turbo'),
      path.resolve(root, 'node_modules', '.cache')
    ];
    for (const t of targets) {
      if (!t.startsWith(path.resolve(root) + path.sep)) throw new Error('Cache cleanup target escapes engine root');
      if (fs.existsSync(t)) {
        fs.rmSync(t, { recursive: true, force: true }); cachesRemoved.push(path.basename(t));
      }
    }
    return { cachesRemoved, locksCleared: 0 };
  }

  public static pullLatest(repoRoot: string): { pulled: boolean; error?: string } {
    const out = runGitCommand(['pull', '--ff-only'], repoRoot, 30000);
    if (out === null) return { pulled: false, error: 'Git pull failed or network timed out' };
    return { pulled: true };
  }

  public static rebuild(repoRoot: string): { built: boolean; error?: string } {
    try {
      cp.execSync('npm run build', { cwd: repoRoot, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
      return { built: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { built: false, error: msg };
    }
  }

  public static installDependencies(repoRoot: string): void {
    const command = fs.existsSync(path.join(repoRoot, 'package-lock.json')) ? 'npm ci' : 'npm install';
    cp.execSync(command, { cwd: repoRoot, timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] });
  }

  public static reinstallPC(repoRoot: string, projectRoot = process.cwd()): { shimsCount: number; idesSynced: string[]; worktreesSynced: number } {
    return refreshEngineInstallations(repoRoot, projectRoot);
  }

  public static runUpdate(options: EngineUpdateOptions = {}): EngineUpdateResult {
    return runEngineUpdate(this, options);
  }
}
