/**
 * @file source-freshness.test.ts
 * Tests for SourceFreshnessAuditor and SourceTombstonePruner.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import test from 'node:test';
import * as assert from 'node:assert';
import { SourceFreshnessAuditor, SourceTombstonePruner } from './source-freshness.js';
import { NotebookLmNativeClient } from './notebooklm-native-client.js';

test('SourceFreshnessAuditor marks pinned sources as immutable', () => {
  const auditor = new SourceFreshnessAuditor({
    pinnedTitles: ['Core Architecture', 'Demir-Kafes'],
    pinnedIds: ['src-pinned-1']
  });

  const sources = [
    { id: 'src-pinned-1', title: 'Any Title' },
    { id: 'src-2', title: 'Aegis Core Architecture Guide' },
    { id: 'src-3', title: 'Demir-Kafes Rules' },
    { id: 'src-4', title: 'Regular Module' }
  ];

  const results = auditor.auditSources(sources);
  assert.strictEqual(results[0].isPinned, true);
  assert.strictEqual(results[0].isStale, false);
  assert.strictEqual(results[1].isPinned, true);
  assert.strictEqual(results[2].isPinned, true);
  assert.strictEqual(results[3].isPinned, false);
});

test('SourceFreshnessAuditor detects obsolete tags in titles', () => {
  const auditor = new SourceFreshnessAuditor();
  const sources = [
    { id: 'src-obs-1', title: 'Legacy Godot 3 Audio [Deprecated]' },
    { id: 'src-obs-2', title: 'Old Pipeline [Superseded]' },
    { id: 'src-active', title: 'Godot 4.7 Audio Stream' }
  ];

  const results = auditor.auditSources(sources);
  assert.strictEqual(results[0].isStale, true);
  assert.strictEqual(results[0].reason, 'obsolete');
  assert.strictEqual(results[1].isStale, true);
  assert.strictEqual(results[2].isStale, false);
});

test('SourceFreshnessAuditor matches superseded RFCs from rfc directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-rfc-test-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'RFC-005-legacy-cache.md'),
      '# RFC-005\n- Status: Superseded by RFC-016\nDetails.',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'RFC-016-dynamic-substrate.md'),
      '# RFC-016\n- Status: Implemented\nDetails.',
      'utf8'
    );

    const auditor = new SourceFreshnessAuditor();
    const sources = [
      { id: 'src-rfc-5', title: 'RFC-005: Legacy Cache Spec' },
      { id: 'src-rfc-16', title: 'RFC-016: Dynamic Substrate' }
    ];

    const results = auditor.auditSources(sources, tmpDir);
    assert.strictEqual(results[0].isStale, true);
    assert.strictEqual(results[0].reason, 'superseded');
    assert.strictEqual(results[0].supersededBy, 'RFC-016');
    assert.strictEqual(results[1].isStale, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SourceTombstonePruner performs dry-run by default without deleting', async () => {
  let deleteCalled = false;
  const mockHttp = async (_url: string, body: string) => {
    if (body.includes('ListSources')) {
      return {
        status: 200,
        text: async () => ')]}\'\n[[["src-stale-1", "Old [Deprecated]"], ["src-active", "Active"]]]',
        headers: {}
      };
    }
    if (body.includes('DeleteSource')) {
      deleteCalled = true;
      return { status: 200, text: async () => ')]}\'\n[["ok"]]', headers: {} };
    }
    return { status: 200, text: async () => '', headers: {} };
  };

  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const pruner = new SourceTombstonePruner(client);

  const res = await pruner.prune('nb-1');
  assert.strictEqual(res.dryRun, true);
  assert.strictEqual(res.candidates.length, 1);
  assert.strictEqual(res.candidates[0].sourceId, 'src-stale-1');
  assert.strictEqual(res.pruned.length, 0);
  assert.strictEqual(deleteCalled, false);
});

test('SourceTombstonePruner deletes stale sources when force is true', async () => {
  const deletedIds: string[] = [];
  const mockHttp = async (_url: string, body: string) => {
    if (body.includes('ListSources')) {
      return {
        status: 200,
        text: async () => ')]}\'\n[[["src-stale-2", "Obsolete [Obsolete]"], ["src-pinned-ok", "Constitution"]]]',
        headers: {}
      };
    }
    if (body.includes('DeleteSource')) {
      deletedIds.push('src-stale-2');
      return { status: 200, text: async () => ')]}\'\n[["ok"]]', headers: {} };
    }
    return { status: 200, text: async () => '', headers: {} };
  };

  const client = new NotebookLmNativeClient({ cookies: 'SID=test;', httpPost: mockHttp });
  const pruner = new SourceTombstonePruner(client);

  const res = await pruner.prune('nb-1', { force: true });
  assert.strictEqual(res.dryRun, false);
  assert.strictEqual(res.candidates.length, 1);
  assert.strictEqual(res.pruned.length, 1);
  assert.strictEqual(deletedIds[0], 'src-stale-2');
});
