/**
 * @file engine-update-types.ts
 * Leaf type definitions for Aegis engine version reports and updates.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import type { BumpType } from './version-manager.js';

export interface MonorepoPackageInfo {
  name: string;
  version: string;
}

export interface EngineVersionReport {
  currentVersion: string;
  localCommit: string;
  remoteCommit: string;
  branch: string;
  driftStatus: 'synced' | 'behind' | 'ahead' | 'diverged' | 'offline';
  behindCount: number;
  aheadCount: number;
  worktreesCount: number;
  monorepoPackages: MonorepoPackageInfo[];
  installedShims: string[];
  mcpToolCount: number;
  latestTag: string | null;
  upgradeAvailable: boolean;
  nextRecommendedVersion: string;
  nextPatch?: string;
  nextMinor?: string;
  timestamp: string;
}

export interface EngineUpdateOptions {
  clean?: boolean;
  pull?: boolean;
  force?: boolean;
  checkOnly?: boolean;
  repoRoot?: string;
  projectRoot?: string;
  bump?: BumpType;
}

export interface EngineUpdateResult {
  engineRoot?: string;
  success: boolean;
  previousVersion: string;
  newVersion: string;
  commitHash: string;
  cleaned: boolean;
  built: boolean;
  reinstalledShims: number;
  syncedPlugins: boolean;
  syncedIdes: string[];
  syncedWorktrees: number;
  durationMs: number;
  message: string;
}

export interface EngineUpdateRunner {
  getVersionReport(repoRoot?: string): EngineVersionReport;
  pullLatest(repoRoot: string): { pulled: boolean; error?: string };
  cleanWorkspace(repoRoot?: string): { cachesRemoved: string[]; locksCleared: number };
  installDependencies(repoRoot: string): void;
  rebuild(repoRoot: string): { built: boolean; error?: string };
  reinstallPC(repoRoot: string, projectRoot?: string): { shimsCount: number; idesSynced: string[]; worktreesSynced: number };
}
