import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TombstoneVaultManager } from './tombstone-vault-manager.js';
import type { NotebookLmNativeClient } from './notebooklm-native-client.js';
import type { NotebookSourceSummary } from './types.js';

test('TombstoneVaultManager: archives and lists sources cleanly', () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-vault-test-'));
  const vault = new TombstoneVaultManager(tmpVault);

  const source: NotebookSourceSummary = {
    id: 'src-123',
    title: 'Obsolete System Blueprint',
    type: 'document'
  };

  const archivePath = vault.archiveSource(source, {
    contentOrUrl: 'Legacy design specifications...',
    pruneScore: 75
  });

  assert.ok(fs.existsSync(archivePath));
  const retrieved = vault.getArchived('src-123');
  assert.ok(retrieved);
  assert.strictEqual(retrieved.sourceId, 'src-123');
  assert.strictEqual(retrieved.title, 'Obsolete System Blueprint');
  assert.strictEqual(retrieved.contentOrUrl, 'Legacy design specifications...');

  const all = vault.listArchived();
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].sourceId, 'src-123');
});

test('TombstoneVaultManager: restores archived source via mock client', async () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-vault-test-'));
  const vault = new TombstoneVaultManager(tmpVault);

  vault.archiveSource(
    { id: 'src-res', title: 'Recoverable Doc', type: 'document' },
    { contentOrUrl: 'Important content' }
  );

  const mockClient = {
    addTextSource: async (_nbId: string, title: string, content: string) => {
      assert.ok(title.includes('Recoverable Doc'));
      assert.strictEqual(content, 'Important content');
      return { sourceId: 'new-src-999' };
    }
  } as unknown as NotebookLmNativeClient;

  const res = await vault.restore('src-res', 'nb-1', mockClient);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.newSourceId, 'new-src-999');
});

test('TombstoneVaultManager: executeTransactionalSwap succeeds and deletes on valid import', async () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-vault-test-'));
  const vault = new TombstoneVaultManager(tmpVault);

  const toPrune: NotebookSourceSummary[] = [
    { id: 'src-p1', title: 'Prune 1', type: 'document' },
    { id: 'src-p2', title: 'Prune 2', type: 'document' }
  ];

  const deletedIds: string[] = [];
  const mockClient = {
    deleteSource: async (id: string) => {
      deletedIds.push(id);
      return { success: true };
    }
  } as unknown as NotebookLmNativeClient;

  const swap = await vault.executeTransactionalSwap(
    'nb-1',
    toPrune,
    async () => ({ importedCount: 3 }),
    mockClient
  );

  assert.strictEqual(swap.result.importedCount, 3);
  assert.strictEqual(swap.prunedCount, 2);
  assert.strictEqual(swap.rollbacked, false);
  assert.deepStrictEqual(deletedIds, ['src-p1', 'src-p2']);
  assert.ok(vault.getArchived('src-p1'));
  assert.ok(vault.getArchived('src-p2'));
});

test('TombstoneVaultManager: executeTransactionalSwap rolls back without deleting when import fails', async () => {
  const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-vault-test-'));
  const vault = new TombstoneVaultManager(tmpVault);

  const toPrune: NotebookSourceSummary[] = [
    { id: 'src-safe', title: 'Safe Doc', type: 'document' }
  ];

  const deletedIds: string[] = [];
  const mockClient = {
    deleteSource: async (id: string) => {
      deletedIds.push(id);
      return { success: true };
    }
  } as unknown as NotebookLmNativeClient;

  await assert.rejects(
    async () => {
      await vault.executeTransactionalSwap(
        'nb-1',
        toPrune,
        async () => {
          throw new Error('Network timeout during import');
        },
        mockClient
      );
    },
    /\[2PC Transactional Rollback\]/
  );

  // Ensure NO sources were deleted
  assert.strictEqual(deletedIds.length, 0);
  // Ensure the candidates were safely backed up in the vault nonetheless
  assert.ok(vault.getArchived('src-safe'));
});
