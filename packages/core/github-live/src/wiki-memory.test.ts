import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { WikiMemoryManager } from './wiki-memory.js';
import { GitHubWikiLiveAdapter } from './wiki-adapter.js';

test('GitHubWikiLiveAdapter parses and lists pages directly from git clone directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-adapter-test-'));
  try {
    const adapter = new GitHubWikiLiveAdapter({ localCloneDir: tmpDir });
    const pages = adapter.listPages();
    assert.ok(pages.length >= 2, 'Should provide default living memory pages');

    const published = adapter.publishPage(
      'protocol',
      'Protocol Living Memory',
      ['Rule 1', 'Rule 2', 'Rule 3'],
      'Live protocol documentation.'
    );
    // Since tmpDir is not a git remote, publishPage writes to local clone cache
    assert.strictEqual(typeof published, 'boolean');

    const page = adapter.getPage('protocol');
    assert.ok(page);
    assert.strictEqual(page.title, 'Protocol Living Memory');
    assert.strictEqual(page.threeBulletSummary[0], 'Rule 1');
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
