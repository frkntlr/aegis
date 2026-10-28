/**
 * @file deps-commands.ts
 * Command handlers for aegis deps:drift and dependency ecosystem synchronization.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { MultiLanguageMetadataManager } from '@aegis/ast-skeleton';
import {
  ContractDriftRadar,
  ProjectReferencesRadar,
  TopologicalDependencyRadar
} from '@aegis/github-live';
import { showBanner } from './banner.js';

function reportProjectReferences(): void {
  const radar = new ProjectReferencesRadar();
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
}

function reportTopologicalDependencies(): boolean {
  const radar = new TopologicalDependencyRadar();
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

function reportEcosystemStatus(): void {
  const manager = new MultiLanguageMetadataManager();
  const { drifted, ledger } = manager.checkEcosystemDrift();

  console.log('📦 Multi-Language Ecosystem Status:');
  for (const [eco, entry] of Object.entries(ledger.ecosystems)) {
    const isDrifted = drifted.includes(eco as 'npm' | 'godot' | 'nuget');
    const icon = isDrifted ? '⚠️  DRIFT' : '✅ SYNCED';
    const hashPreview = entry.compositeHash ? entry.compositeHash.substring(0, 12) : 'none';
    console.log(` • [${eco.toUpperCase()}] ${icon} (Hash: ${hashPreview})`);
  }
}

async function reportContractDrift(): Promise<boolean> {
  const radar = new ContractDriftRadar();
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
    return false;
  }
  console.log('\n✅ No breaking upstream contract changes detected.');
  return true;
}

export async function handleDepsDrift(): Promise<void> {
  showBanner();
  console.log('📡 Running Symbiotic Substrate 2.0 Contract Drift Radar...\n');
  reportEcosystemStatus();
  const contractClean = await reportContractDrift();
  reportProjectReferences();
  const topoClean = reportTopologicalDependencies();
  if (!contractClean || !topoClean) {
    process.exitCode = 1;
  }
}
