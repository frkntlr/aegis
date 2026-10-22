import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WikiMemoryManager } from './wiki-memory.js';

test('WikiMemoryManager loads, persists and exports living architecture memory to disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-test-'));
  try {
    const manager = new WikiMemoryManager(tmpDir);
    const pages = manager.listPages();
    assert.ok(pages.length >= 2, 'Should seed default architecture pages on first run');

    const arch = manager.getPage('architecture');
    assert.ok(arch);
    assert.strictEqual(arch.title, 'Aegis System Architecture');
    assert.strictEqual(arch.threeBulletSummary.length, 3);

    manager.setPage('new-module', 'New Module Title', ['Bullet 1', 'Bullet 2', 'Bullet 3'], 'Module content');
    assert.ok(fs.existsSync(path.join(tmpDir, 'new-module.md')));

    const reloaded = new WikiMemoryManager(tmpDir);
    assert.strictEqual(reloaded.getPage('new-module')?.title, 'New Module Title');

    const exportDir = path.join(tmpDir, 'export');
    const written = manager.exportAll(exportDir);
    assert.ok(written.length >= 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('WikiMemoryManager extracts selective tagged memory summaries for prompt compile', () => {
  const manager = new WikiMemoryManager();
  manager.setPage('architecture', 'General Arch', ['Arch 1', 'Arch 2', 'Arch 3']);
  manager.setPage('ast', 'AST Engine', ['AST 1', 'AST 2', 'AST 3']);

  const generalSummary = manager.getContextForLabels(['status:ready']);
  assert.ok(generalSummary.includes('Arch 1'));

  const taggedSummary = manager.getContextForLabels(['status:ready', 'wiki:ast']);
  assert.ok(taggedSummary.includes('AST Engine'));
  assert.ok(taggedSummary.includes('AST 1'));
});
