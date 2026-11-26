/**
 * @file deps-commands.ts
 * Command handlers for aegis deps:drift and dependency ecosystem synchronization.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as path from 'node:path';
import { MultiLanguageMetadataManager } from '@aegis/ast-skeleton';
import {
  ContractDriftRadar,
  ProjectReferencesRadar,
  TopologicalDependencyRadar
} from '@aegis/github-live';
import { showBanner } from './banner.js';

export interface DepsDriftOptions {
  projectRoot?: string;
  cacheDir?: string;
}

function resolveContractCacheDir(cacheDir?: string): string | undefined {
  return cacheDir ? path.join(cacheDir, 'context7') : undefined;
}

function reportProjectReferences(projectRoot?: string): boolean {
  const radar = new ProjectReferencesRadar(projectRoot);
  const report = radar.scan();
  console.log('\n📐 TypeScript Project References Status:');
  console.log(` • Packages Scanned:      ${report.totalPackages}`);
  const statusIcon = report.valid ? '✅ 100% SYNCED' : '⚠️  DESYNCHRONIZED';
  console.log(` • References Integrity:  ${statusIcon}`);
  if (!report.valid) {
    for (const err of report.errors) {
      console.warn(`   - ${err}`);
    }
  }
  return report.valid;
}

function reportTopologicalDependencies(projectRoot?: string): boolean {
  const radar = new TopologicalDependencyRadar(projectRoot);
  const report = radar.scan();
  console.log('\n🧭 Monorepo Topological Dependency Radar (RFC-036):');
  console.log(` • Packages Scanned:      ${report.totalPackages}`);
  console.log(` • Source Files Checked:  ${report.totalSourceFiles}`);
  const statusIcon = report.valid ? '✅ 100% CLEAN' : '❌ VIOLATIONS FOUND';
  console.log(` • Graph Integrity:       ${statusIcon}`);
  if (!report.valid) {
    for (const err of report.errors) {
      console.error(`   - ${err}`);
    }
  }
  return report.valid;
}

function reportEcosystemStatus(options: DepsDriftOptions): boolean {
  const manager = new MultiLanguageMetadataManager({
    projectRoot: options.projectRoot,
    cacheDir: options.cacheDir
  });
  const { drifted, ledger } = manager.checkEcosystemDrift();

  console.log('📦 Multi-Language Ecosystem Status:');
  for (const [eco, entry] of Object.entries(ledger.ecosystems)) {
    const isDrifted = drifted.includes(eco as 'npm' | 'godot' | 'nuget');
    const icon = isDrifted ? '⚠️  DRIFT' : '✅ SYNCED';
    const hashPreview = entry.compositeHash ? entry.compositeHash.substring(0, 12) : 'none';
    console.log(` • [${eco.toUpperCase()}] ${icon} (Hash: ${hashPreview})`);
  }
  return drifted.length === 0;
}

async function reportContractDrift(
  options: DepsDriftOptions
): Promise<{ clean: boolean; hasDrift: boolean }> {
  const radar = new ContractDriftRadar({
    projectRoot: options.projectRoot,
    cacheDir: resolveContractCacheDir(options.cacheDir)
  });
  const driftRes = await radar.evaluateDrift();

  if (driftRes.hasDrift) {
    console.log(`\n🔍 Changed Dependency Manifests (${driftRes.changedFiles.length}):`);
    for (const f of driftRes.changedFiles) {
      console.log(` • ${f}`);
    }
  }
  if (driftRes.breakingChanges.length > 0) {
    console.error('\n🚨 Breaking Contract Changes Detected:');
    for (const b of driftRes.breakingChanges) {
      console.error(` • ${b}`);
    }
  }
  if (driftRes.shouldBlock) {
    console.error('\n❌ Contract drift contains breaking changes. Worktree tasks should be BLOCKED.');
    return { clean: false, hasDrift: true };
  }
  console.log('\n✅ No breaking upstream contract changes detected.');
  return { clean: true, hasDrift: driftRes.hasDrift };
}

async function syncDependencyLedgers(options: DepsDriftOptions): Promise<void> {
  const manager = new MultiLanguageMetadataManager({
    projectRoot: options.projectRoot,
    cacheDir: options.cacheDir
  });
  const { ledger } = manager.checkEcosystemDrift();
  manager.saveLockLedger(ledger);
  const radar = new ContractDriftRadar({
    projectRoot: options.projectRoot,
    cacheDir: resolveContractCacheDir(options.cacheDir)
  });
  await radar.recordBaseline();
  console.log('🔒 Baseline dependency ledgers successfully recorded to .aegis/cache\n');
}

export async function handleDepsDrift(
  args: string[] = [],
  options: DepsDriftOptions = {}
): Promise<void> {
  const isSync = args.includes('--sync') || args.includes('-s');
  const isStrict = args.includes('--strict');
  showBanner();
  const modeStr = isSync ? ' (Sync Mode)' : '';
  console.log(`📡 Running Symbiotic Substrate 2.0 Contract Drift Radar${modeStr}...\n`);
  if (isSync) {
    await syncDependencyLedgers(options);
  }
  const ecoClean = reportEcosystemStatus(options);
  const contract = await reportContractDrift(options);
  const refsClean = reportProjectReferences(options.projectRoot);
  const topoClean = reportTopologicalDependencies(options.projectRoot);
  const hasStrictDrift = !ecoClean || contract.hasDrift || !refsClean || !topoClean;
  if (!contract.clean || !topoClean || !refsClean || (isStrict && hasStrictDrift)) {
    process.exitCode = 1;
  }
}
