/**
 * @file nlm-prune-helper.ts
 * Autonomous MFCS source pruning and tombstone restoration helpers.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import {
  NotebookLmNativeClient,
  AutonomousPruningEngine,
  TombstoneVaultManager,
  type NotebookSourceSummary,
  type EvaluatedPruneCandidate
} from '@aegis/github-live';
import { showBanner } from './banner.js';

const DEFAULT_NOTEBOOK_ID = '3767b1fc-5759-416d-b938-495b8138ccd7';

async function executePruneBatch(
  client: NotebookLmNativeClient,
  vault: TombstoneVaultManager,
  nbId: string,
  approved: EvaluatedPruneCandidate[],
  sources: NotebookSourceSummary[]
): Promise<number> {
  let count = 0;
  for (const c of approved) {
    const sObj = sources.find(s => s.id === c.sourceId) || { id: c.sourceId, title: c.title };
    vault.archiveSource(sObj, {
      metadata: { notebookId: nbId },
      pruneScore: c.score
    });
    await client.deleteSource(c.sourceId);
    count++;
    console.log(` 🗑️ Archived & Pruned: [${c.sourceId}] ${c.title}`);
  }
  return count;
}

export async function handleNlmPrune(...args: string[]): Promise<void> {
  showBanner();
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const nbId = args.find(a => !a.startsWith('-')) || DEFAULT_NOTEBOOK_ID;

  console.log(`🧹 Running Autonomous Pruner on Notebook [${nbId}] (${dryRun ? 'DRY-RUN' : 'AUTONOMOUS ACTIVE'})...`);
  try {
    const client = new NotebookLmNativeClient();
    const vault = new TombstoneVaultManager();
    const engine = new AutonomousPruningEngine();
    const sources = await client.listSources(nbId);

    const candidates = await engine.evaluateAll(sources);
    const approved = candidates.filter(c => c.score.verdict === 'AUTONOMOUS_PRUNE_APPROVED');
    const protectedCount = candidates.filter(c => c.score.immutabilityShield).length;

    console.log(`\n📊 Audit: ${sources.length} sources | ${approved.length} approved | ${protectedCount} protected`);
    if (dryRun) {
      for (const c of approved) {
        console.log(` • [${c.sourceId}] ${c.title} (Score: ${c.score.totalScore}) -> ${c.score.reasons.join(', ')}`);
      }
      return;
    }
    if (approved.length === 0) {
      console.log('✅ All sources healthy and active. Zero pruning needed.');
      return;
    }

    const prunedCount = await executePruneBatch(client, vault, nbId, approved, sources);
    console.log(`\n✅ Autonomous Pruning Complete: ${prunedCount} source(s) archived to vault and deleted.`);
    console.log(`🛡️ ${protectedCount} source(s) preserved by Immutability Shield.`);
    console.log(`ℹ️ To restore any pruned source, run: aegis nlm:restore <sourceId>`);
  } catch (err: unknown) {
    console.error(`❌ Autonomous Prune Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function handleNlmRestore(sourceIdArg?: string, notebookIdArg?: string): Promise<void> {
  showBanner();
  const vault = new TombstoneVaultManager();
  const nbId = notebookIdArg || DEFAULT_NOTEBOOK_ID;

  if (!sourceIdArg) {
    const archived = vault.listArchived();
    console.log(`🏛️ Tombstone Vault Listing (${archived.length} archived items):`);
    for (const item of archived) {
      console.log(` • [${item.sourceId}] ${item.title} (Archived: ${item.archivedAt})`);
    }
    console.log('\nℹ️ Restore with: aegis nlm:restore <sourceId> [notebookId]');
    return;
  }

  console.log(`♻️ Restoring source [${sourceIdArg}] to Notebook [${nbId}]...`);
  try {
    const client = new NotebookLmNativeClient();
    const res = await vault.restore(sourceIdArg, nbId, client);
    if (!res.success) {
      console.error(`❌ Restore Failed: ${res.error}`);
      return;
    }
    console.log(`✅ Source restored successfully! New Source ID: ${res.newSourceId}`);
  } catch (err: unknown) {
    console.error(`❌ Restore Failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
