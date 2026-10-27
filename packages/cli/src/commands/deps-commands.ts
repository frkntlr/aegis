/**
 * @file deps-commands.ts
 * Command handlers for aegis deps:drift and dependency ecosystem synchronization.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { MultiLanguageMetadataManager } from '@aegis/ast-skeleton';
import { ContractDriftRadar } from '@aegis/github-live';
import { showBanner } from './banner.js';

export async function handleDepsDrift(): Promise<void> {
  showBanner();
  console.log('📡 Running Symbiotic Substrate 2.0 Contract Drift Radar...\n');

  const manager = new MultiLanguageMetadataManager();
  const { drifted, ledger } = manager.checkEcosystemDrift();

  console.log('📦 Multi-Language Ecosystem Status:');
  for (const [eco, entry] of Object.entries(ledger.ecosystems)) {
    const isDrifted = drifted.includes(eco as 'npm' | 'godot' | 'nuget');
    const icon = isDrifted ? '⚠️  DRIFT' : '✅ SYNCED';
    const hashPreview = entry.compositeHash ? entry.compositeHash.substring(0, 12) : 'none';
    console.log(` • [${eco.toUpperCase()}] ${icon} (Hash: ${hashPreview})`);
  }

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
  } else {
    console.log('\n✅ No breaking upstream contract changes detected.');
  }
}
