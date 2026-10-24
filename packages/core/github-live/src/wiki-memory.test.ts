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

test('GitHubWikiLiveAdapter seeds 8-page living architecture suite into git cache', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-seed-test-'));
  try {
    const adapter = new GitHubWikiLiveAdapter({ localCloneDir: tmpDir });
    const res = adapter.seedComprehensiveWikiSuite();
    assert.strictEqual(res.created, 8);
    assert.ok(res.pages.includes('Home'));
    assert.ok(res.pages.includes('Architecture'));
    assert.ok(res.pages.includes('Toolchain-and-IDEs'));
    assert.ok(res.pages.includes('MCP-and-Skills-Ecosystem'));
    assert.ok(res.pages.includes('Plugin-and-Extensibility'));
    assert.ok(res.pages.includes('NotebookLM-Integration'));
    assert.ok(res.pages.includes('Quality-Shields-and-Gates'));
    assert.ok(res.pages.includes('Autonomous-Kanban-Protocol'));

    const home = adapter.getPage('Home');
    assert.ok(home);
    assert.ok(home.content.includes('Aegis Yaşayan Mimari Dokümantasyonuna Hoş Geldiniz'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitHubWikiLiveAdapter backs up conflicting local wiki before re-cloning', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-backup-test-'));
  const cloneDir = path.join(tmpBase, 'wiki-clone');
  fs.mkdirSync(cloneDir, { recursive: true });
  fs.writeFileSync(path.join(cloneDir, 'ConflictingDraft.md'), '# Unsaved Research Notes\n• Point A\n', 'utf8');

  try {
    const adapter = new GitHubWikiLiveAdapter({ localCloneDir: cloneDir });
    (adapter as unknown as { cloneWikiRemote: (url: string) => void }).cloneWikiRemote('https://invalid.example/repo.wiki.git');

    const aegisDir = path.resolve(process.cwd(), '.aegis');
    const backups = fs.existsSync(aegisDir)
      ? fs.readdirSync(aegisDir).filter(f => f.startsWith('wiki-backup-'))
      : [];
    assert.ok(backups.length > 0, 'Should have created a wiki-backup directory');

    const latestBackup = path.join(aegisDir, backups[backups.length - 1]);
    const backedUpFile = path.join(latestBackup, 'ConflictingDraft.md');
    assert.ok(fs.existsSync(backedUpFile), 'Backed up file should exist');
    assert.ok(fs.readFileSync(backedUpFile, 'utf8').includes('Unsaved Research Notes'));

    for (const b of backups) {
      fs.rmSync(path.join(aegisDir, b), { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});


test('GitHubWikiLiveAdapter prevents path traversal when retrieving or publishing pages', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-wiki-traversal-test-'));
  try {
    const adapter = new GitHubWikiLiveAdapter({ localCloneDir: tmpDir });
    // Attempting traversal slug
    adapter.publishPage('../../traversal', 'Traversal Test', ['A', 'B', 'C'], 'content');

    // Page must be contained inside tmpDir, not escape into parent
    const safePage = adapter.getPage('../../traversal');
    assert.ok(safePage);
    assert.strictEqual(safePage.slug, 'traversal');
    assert.ok(fs.existsSync(path.join(tmpDir, 'traversal.md')));
    assert.strictEqual(fs.existsSync(path.resolve(tmpDir, '..', 'traversal.md')), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
