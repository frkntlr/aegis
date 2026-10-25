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
  assert.ok(result.groundTruthDocs[0].includes('godot4:physics'));
  assert.ok(result.constitutionRules.includes('Rule: Max 40 lines per function'));
  assert.ok(result.compressedLogs && result.compressedLogs.includes('[PRUNED]'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('CodebaseMemoryEngine: removeFile evicts file from hashes and index database', () => {
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const fPath = 'src/test-del.ts';
  engine.indexFile(fPath, 'export class ToDelete { run() {} }');

  assert.strictEqual(engine.getMemoryStats().totalFiles, 1);
  assert.strictEqual(engine.removeFile(fPath), true);
  assert.strictEqual(engine.getMemoryStats().totalFiles, 0);
  assert.strictEqual(engine.removeFile(fPath), false);
});

test('CodebaseMemoryEngine: queryMemory resolves symbols by relative file path', () => {
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const fPath = 'src/services/player-service.ts';
  const code = 'export class PlayerService { getHealth(): number { return 100; } }';
  engine.indexFile(fPath, code);

  const res = engine.queryMemory('src/services/player-service.ts');
  assert.strictEqual(res.found, true);
  assert.ok(res.slice?.includes('PlayerService'));
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

test('CodebaseMemoryEngine: queryMemory returns real callers, callees, and surgical blast radius for class and functions', () => {
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  const gatewayCode = 'export class PaymentGateway { charge() { return true; } }';
  const serviceCode = "import { PaymentGateway } from './gateway.js'; export class OrderService { pay() { const gw = new PaymentGateway(); gw.charge(); } }";
  const controllerCode = "import { OrderService } from './service.js'; export function handleCheckout() { const s = new OrderService(); s.pay(); }";

  engine.indexFile('src/gateway.ts', gatewayCode);
  engine.indexFile('src/service.ts', serviceCode);
  engine.indexFile('src/controller.ts', controllerCode);

  const qGateway = engine.queryMemory('PaymentGateway');
  assert.strictEqual(qGateway.found, true);
  assert.ok(qGateway.callers.some(c => c.includes('OrderService') || c.includes('service.ts')), 'Gateway callers must include OrderService');
  assert.ok(qGateway.blastRadius.includes('src/service.ts'));

  const qService = engine.queryMemory('OrderService');
  assert.strictEqual(qService.found, true);
  assert.ok(qService.callers.some(c => c.includes('handleCheckout') || c.includes('controller.ts')), 'OrderService callers must include handleCheckout');
  assert.ok(qService.callees.some(c => c.includes('charge') || c.includes('PaymentGateway')), 'OrderService callees must include charge');
});

test('CodebaseMemoryEngine: inherits base memory into new worktree with copy-on-write overlay', () => {
  const engine = new CodebaseMemoryEngine({ persistToDisk: false });
  engine.indexFile('src/base.ts', 'export class BaseService { ping(): boolean { return true; } }', 'default');

  // Querying in fresh solver worktree should inherit BaseService seamlessly
  const qSolver = engine.queryMemory('BaseService', { worktreeId: 'solver' });
  assert.strictEqual(qSolver.found, true, 'solver should inherit BaseService from default base memory');

  // Add worktree-specific feature in solver
  engine.indexFile('src/solver-patch.ts', 'export class SolverPatch {}', 'solver');

  // solver has both BaseService and SolverPatch
  assert.strictEqual(engine.queryMemory('BaseService', { worktreeId: 'solver' }).found, true);
  assert.strictEqual(engine.queryMemory('SolverPatch', { worktreeId: 'solver' }).found, true);

  // default remains untouched (Copy-On-Write isolation)
  assert.strictEqual(engine.queryMemory('SolverPatch', { worktreeId: 'default' }).found, false, 'default base must not contain solver changes');
});

test('CodebaseMemoryEngine: resolves worktree id dynamically from CWD path', () => {
  assert.strictEqual(CodebaseMemoryEngine.resolveWorktreeIdFromCwd('c:/project/experimental/solver'), 'solver');
  assert.strictEqual(CodebaseMemoryEngine.resolveWorktreeIdFromCwd('/home/user/repo/worktrees/qa'), 'qa');
  assert.strictEqual(CodebaseMemoryEngine.resolveWorktreeIdFromCwd('c:/games/HakeGame-ui'), 'HakeGame-ui');
  assert.strictEqual(CodebaseMemoryEngine.resolveWorktreeIdFromCwd('c:/project/src'), 'default');
});

test('MemoryDiskStore: loads base memory when worktree cache is not found on disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cow-disk-'));
  const prevCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    const engine1 = new CodebaseMemoryEngine({ persistToDisk: true });
    engine1.indexFile('src/shared.ts', 'export class SharedEngine {}', 'default');
    engine1.saveNamespaceToDisk('default');

    // Fresh engine instance querying 'new-worktree' should inherit from 'default' on disk
    const engine2 = new CodebaseMemoryEngine({ persistToDisk: true });
    const res = engine2.queryMemory('SharedEngine', { worktreeId: 'new-worktree' });
    assert.strictEqual(res.found, true, 'new-worktree must load shared memory from base default');

    // Modify in worktree and save
    engine2.indexFile('src/feature.ts', 'export class LocalFeature {}', 'new-worktree');
    engine2.saveNamespaceToDisk('new-worktree');

    // Verify .aegis/memory/new-worktree exists independently now
    assert.strictEqual(fs.existsSync(path.join(tmpDir, '.aegis', 'memory', 'new-worktree', 'symbols.json')), true);
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
