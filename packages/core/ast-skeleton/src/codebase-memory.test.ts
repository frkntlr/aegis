import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CodebaseMemoryEngine } from './codebase-memory.js';

test('CodebaseMemoryEngine: indexes files incrementally and caches identical content', () => {
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const filePath = 'src/player.ts';
  const content = 'export class PlayerController { public updateScore(): void {} }';

  const first = engine.indexFile(filePath, content, 'solver');
  assert.strictEqual(first, true, 'First indexing should return true');

  const second = engine.indexFile(filePath, content, 'solver');
  assert.strictEqual(second, false, 'Second identical indexing should return false (cache hit)');

  const modified = engine.indexFile(filePath, content + '\n// modified', 'solver');
  assert.strictEqual(modified, true, 'Modified content should return true');
});

test('CodebaseMemoryEngine: isolates namespaces across worktrees', () => {
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  engine.indexFile('src/a.ts', 'export class Alpha {}', 'master');
  engine.indexFile('src/b.ts', 'export class Beta {}', 'solver');

  const statsMaster = engine.getMemoryStats('master');
  assert.strictEqual(statsMaster.totalFiles, 1);
  assert.strictEqual(statsMaster.totalSymbols, 1);

  const statsSolver = engine.getMemoryStats('solver');
  assert.strictEqual(statsSolver.totalFiles, 1);
  assert.strictEqual(statsSolver.totalSymbols, 1);

  const qAlphaInSolver = engine.queryMemory('Alpha', { worktreeId: 'solver' });
  assert.strictEqual(qAlphaInSolver.found, false, 'Alpha should not exist in solver worktree');

  const qAlphaInMaster = engine.queryMemory('Alpha', { worktreeId: 'master' });
  assert.strictEqual(qAlphaInMaster.found, true, 'Alpha must exist in master worktree');
});

test('CodebaseMemoryEngine: queries memory and provides 5-layer enriched context', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mem-test-'));
  const targetFile = path.join(tmpDir, 'Enemy.gd');
  const code = [
    'class_name Enemy',
    'extends CharacterBody2D',
    'signal enemy_died(score: int)',
    'func take_damage() -> void:',
    '    enemy_died.emit(100)'
  ].join('\n');
  fs.writeFileSync(targetFile, code, 'utf8');

  const engine = new CodebaseMemoryEngine({
    persistToDisk: false,
    docProvider: (lib, topic) => `[${lib}:${topic}] Ground truth doc`,
    logCompressor: (raw) => ({ text: raw.replace(/node:internal/g, '[PRUNED]'), tokenSavingsPercent: 50 }),
    constitutionProvider: () => ['Rule: Max 40 lines per function']
  });

  engine.indexFile(targetFile, code);

  const result = engine.queryMemory('take_damage', {
    rawLogs: 'Error\n    at node:internal/loader.js\n    at Enemy.gd:5'
  });

  assert.strictEqual(result.found, true);
  assert.ok(result.slice && result.slice.includes('take_damage'));
  assert.ok(result.groundTruthDocs.length > 0, 'Must have ground-truth docs for Godot class');
  assert.ok(result.groundTruthDocs[0].includes('godot4:lifecycle'));
  assert.ok(result.constitutionRules.includes('Rule: Max 40 lines per function'));
  assert.ok(result.compressedLogs && result.compressedLogs.includes('[PRUNED]'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CodebaseMemoryEngine: indexes directories and tracks cache hits', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mem-dir-'));
  fs.writeFileSync(path.join(tmpDir, 'one.ts'), 'export const ONE = 1;');
  fs.writeFileSync(path.join(tmpDir, 'two.ts'), 'export const TWO = 2;');

  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const firstScan = engine.indexDirectory(tmpDir, 'test-dir-wt');
  assert.strictEqual(firstScan.indexed, 2);
  assert.strictEqual(firstScan.cached, 0);

  const secondScan = engine.indexDirectory(tmpDir, 'test-dir-wt');
  assert.strictEqual(secondScan.indexed, 0);
  assert.strictEqual(secondScan.cached, 2);

  const stats = engine.getMemoryStats('test-dir-wt');
  assert.strictEqual(stats.totalFiles, 2);
  assert.ok(stats.estimatedTokenSavings > 0);

  engine.clearCache();
  assert.strictEqual(engine.getMemoryStats('test-dir-wt').totalFiles, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
