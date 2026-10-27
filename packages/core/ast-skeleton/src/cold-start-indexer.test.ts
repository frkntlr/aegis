import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ColdStartIndexer } from './cold-start-indexer.js';
import { CodebaseMemoryEngine } from './codebase-memory.js';

test('ColdStartIndexer: collects candidate files and respects blacklist and extensions', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-start-test-'));
  try {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'pkg'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'experimental', 'solver'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'worktrees', 'qa'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.worktrees', 'docs'), { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'src', 'main.ts'), 'export const x = 1;');
    fs.writeFileSync(path.join(tempDir, 'src', 'player.gd'), 'extends Node\nsignal jumped');
    fs.writeFileSync(path.join(tempDir, 'src', 'notes.txt'), 'plain text');
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'pkg', 'dep.ts'), 'export const y = 2;');
    fs.writeFileSync(path.join(tempDir, 'dist', 'bundle.js'), 'console.log();');
    fs.writeFileSync(path.join(tempDir, 'experimental', 'solver', 'exp.ts'), 'export const s = 10;');
    fs.writeFileSync(path.join(tempDir, 'worktrees', 'qa', 'qa.ts'), 'export const q = 20;');
    fs.writeFileSync(path.join(tempDir, '.worktrees', 'docs', 'doc.ts'), 'export const d = 30;');

    const indexer = new ColdStartIndexer();
    const files = indexer.collectCandidateFiles(tempDir);

    assert.strictEqual(files.length, 2);
    const basenames = files.map(f => path.basename(f)).sort();
    assert.deepStrictEqual(basenames, ['main.ts', 'player.gd']);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ColdStartIndexer: indexes full project root and skips unchanged files', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cold-start-run-'));
  try {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'service.ts'), 'export class AuthService { login() {} }');

    const engine = new CodebaseMemoryEngine({ persistToDisk: false });
    const indexer = new ColdStartIndexer();

    const res1 = await indexer.indexProjectRoot(engine, { repoRoot: tempDir, worktreeId: 'test-wt' });
    assert.strictEqual(res1.scannedFiles, 1);
    assert.strictEqual(res1.indexedFiles, 1);

    const mem = engine.queryMemory('AuthService', { worktreeId: 'test-wt' });
    assert.strictEqual(mem.found, true);

    const res2 = await indexer.indexProjectRoot(engine, { repoRoot: tempDir, worktreeId: 'test-wt' });
    assert.strictEqual(res2.scannedFiles, 1);
    assert.strictEqual(res2.indexedFiles, 0);
    assert.strictEqual(res2.fastSynced, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ColdStartIndexer: handles non-existent directory gracefully', () => {
  const indexer = new ColdStartIndexer();
  const files = indexer.collectCandidateFiles(path.join(os.tmpdir(), 'non-existent-xyz-' + Date.now()));
  assert.deepStrictEqual(files, []);
});
