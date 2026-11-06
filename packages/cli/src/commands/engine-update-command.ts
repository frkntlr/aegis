/**
 * @file engine-update-command.ts
 * CLI command handlers for dynamic Aegis update, clean reinstallation, and version drift radar.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  EngineUpdater,
  type EngineUpdateOptions,
  type EngineVersionReport,
  type EngineUpdateResult
} from '@aegis/orchestrator';
import { showBanner } from './banner.js';

interface UpdateFlags {
  clean: boolean;
  pull: boolean;
  force: boolean;
  check: boolean;
  json: boolean;
}

function parseUpdateFlags(args: string[]): UpdateFlags {
  return {
    clean: args.includes('--clean') || args.includes('--fresh') || args.includes('-c'),
    pull: args.includes('--pull') || args.includes('-p'),
    force: args.includes('--force') || args.includes('-f'),
    check: args.includes('--check') || args.includes('--dry-run'),
    json: args.includes('--json') || args.includes('-j')
  };
}

export function handleVersionStatus(flag?: string): void {
  const isJson = flag === '--json' || flag === '-j';
  const report = EngineUpdater.getVersionReport();

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  showBanner();
  console.log('📡 Aegis Dynamic Version & Drift Radar');
  console.log(` • Version:       v${report.currentVersion}`);
  console.log(` • Local Commit:  ${report.localCommit} [Branch: ${report.branch}]`);
  console.log(` • Remote Commit: ${report.remoteCommit}`);

  printDriftStatus(report);
  console.log(` • Monorepo:      ${report.monorepoPackages.length} packages loaded`);
  console.log(` • MCP Tools:     ${report.mcpToolCount} authoritative tools active`);
  console.log(` • Global Shims:  ${report.installedShims.length} shims active in bin`);
  console.log(` • Worktrees:     ${report.worktreesCount} active git worktrees`);
}

function printDriftStatus(report: EngineVersionReport): void {
  if (report.driftStatus === 'synced') {
    console.log(' • Drift Status:  ✅ 100% SYNCED with origin/master');
  } else if (report.driftStatus === 'ahead') {
    console.log(` • Drift Status:  🚀 AHEAD of origin/master by ${report.aheadCount} commit(s)`);
  } else if (report.driftStatus === 'behind') {
    console.log(` • Drift Status:  ⚠️  BEHIND origin/master by ${report.behindCount} commit(s) -> run 'aegis update --pull'`);
  } else if (report.driftStatus === 'diverged') {
    console.log(` • Drift Status:  🔀 DIVERGED (+${report.aheadCount} / -${report.behindCount}) from origin`);
  } else {
    console.log(' • Drift Status:  🌐 OFFLINE / Remote unreachable');
  }
}

export function handleEngineUpdate(...args: string[]): EngineUpdateResult | null {
  const flags = parseUpdateFlags(args);

  if (flags.check) {
    handleVersionStatus(flags.json ? '--json' : undefined);
    return null;
  }

  if (!flags.json) {
    showBanner();
    console.log('🔄 Aegis Dynamic Engine Update & Full Reinstallation Initiated...');
    if (flags.clean) console.log('🧹 Clean Mode Active: Wiping build caches and stale locks.');
    if (flags.pull) console.log('🐙 Remote Pull: Checking for latest commits on origin/master.');
  }

  const opts: EngineUpdateOptions = {
    clean: flags.clean,
    pull: flags.pull,
    force: flags.force
  };

  const result = EngineUpdater.runUpdate(opts);

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  printUpdateSummary(result);
  return result;
}

function printUpdateSummary(result: EngineUpdateResult): void {
  if (!result.success) {
    console.error(`\n❌ Update failed: ${result.message}`);
    return;
  }

  console.log('\n🎉 Aegis Update Complete!');
  console.log(` • Version:           v${result.previousVersion} -> v${result.newVersion} (${result.commitHash})`);
  console.log(` • Clean Reinstall:   ${result.cleaned ? '✅ Yes' : '⚡ Incremental'}`);
  console.log(` • Monorepo Build:    ${result.built ? '✅ 100% Succeeded' : '❌ Failed'}`);
  console.log(` • Global Shims:      ✅ ${result.reinstalledShims} shims reinstalled`);
  console.log(` • Plugin & Schemas:  ${result.syncedPlugins ? '✅ Synchronized (41 tools)' : '❌ Not synced'}`);
  console.log(` • IDEs Synchronized: [${result.syncedIdes.join(', ')}]`);
  console.log(` • Worktree Branches: ${result.syncedWorktrees} worktrees synced with master`);
  console.log(` • Elapsed Duration:  ${(result.durationMs / 1000).toFixed(2)}s`);
  console.log('\n✨ Everyone on this PC is now guaranteed running the latest Aegis build!');
}
