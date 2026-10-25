import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SymbolIndexer } from './symbol-indexer.js';
import { SymbolParser, type SymbolEntry } from './symbol-parser.js';
import { SymbolSliceExtractor } from './symbol-slice-extractor.js';
import { CrossReferenceLinker } from './cross-reference-linker.js';

const sampleTs = [
  'export interface Config { timeout: number; }',
  'export class Worker {',
  '  private name: string;',
  '  constructor(name: string) { this.name = name; }',
  '  public run(): boolean {',
  '    console.log("running");',
  '    return true;',
  '  }',
  '}',
  'export function helper(x: number): number {',
  '  return x * 2;',
  '}'
].join('\n');

const sampleGd = [
  'class_name Hero',
  'signal health_changed(new_hp, max_hp)',
  'var hp: int = 100',
  'func take_damage(amount: int) -> void:',
  '    hp -= amount',
  '    health_changed.emit(hp, 100)',
  'static func get_default_hp() -> int:',
  '    return 100'
].join('\n');

test('SymbolIndexer extracts TypeScript classes, methods, and functions', () => {
  const indexer = new SymbolIndexer();
  const symbols = indexer.indexFile('src/worker.ts', sampleTs);

  assert.strictEqual(symbols.length >= 4, true);
  const classSym = symbols.find(s => s.name === 'Worker');
  assert.ok(classSym);
  assert.strictEqual(classSym.kind, 'class');

  const methodSym = symbols.find(s => s.name === 'Worker.run');
  assert.ok(methodSym);
  assert.strictEqual(methodSym.kind, 'method');

  const fnSym = symbols.find(s => s.name === 'helper');
  assert.ok(fnSym);
  assert.strictEqual(fnSym.kind, 'function');
});

test('SymbolIndexer extracts GDScript class, signals, and functions', () => {
  const indexer = new SymbolIndexer();
  const symbols = indexer.indexFile('scripts/hero.gd', sampleGd);

  const heroCls = symbols.find(s => s.name === 'Hero');
  assert.ok(heroCls);
  assert.strictEqual(heroCls.kind, 'class');

  const sig = symbols.find(s => s.name === 'health_changed');
  assert.ok(sig);
  assert.strictEqual(sig.kind, 'signal');

  const method = symbols.find(s => s.name === 'Hero.take_damage');
  assert.ok(method);
  assert.strictEqual(method.kind, 'method');
});

test('SymbolIndexer caches results and skips re-parsing for unchanged hash', () => {
  const indexer = new SymbolIndexer();
  indexer.indexFile('src/worker.ts', sampleTs);

  const db = indexer.getDatabase();
  assert.ok(db.files['src/worker.ts']);
  const originalHash = db.files['src/worker.ts'].hash;

  // Re-indexing same content returns cached symbols
  const reindexed = indexer.indexFile('src/worker.ts', sampleTs);
  assert.strictEqual(reindexed.length, db.files['src/worker.ts'].symbols.length);
  assert.strictEqual(db.files['src/worker.ts'].hash, originalHash);
});

test('SymbolIndexer findSymbols prioritizes exact match over partials', () => {
  const indexer = new SymbolIndexer();
  indexer.indexFile('src/worker.ts', sampleTs);

  const exact = indexer.findSymbols('Worker');
  assert.strictEqual(exact[0].name, 'Worker');

  const partial = indexer.findSymbols('help');
  assert.strictEqual(partial.length, 1);
  assert.strictEqual(partial[0].name, 'helper');
});

test('SymbolSliceExtractor slices function context and computes token savings', () => {
  const indexer = new SymbolIndexer();
  indexer.indexFile('src/worker.ts', sampleTs);

  const extractor = new SymbolSliceExtractor(indexer);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-slice-test-'));
  const targetPath = path.join(tmpDir, 'worker.ts');
  fs.writeFileSync(targetPath, sampleTs, 'utf8');

  try {
    const slice = extractor.sliceContent('helper', 'worker.ts', sampleTs, 10, 12, 1);
    assert.strictEqual(slice.symbol, 'helper');
    assert.strictEqual(slice.startLine, 10);
    assert.strictEqual(slice.endLine, 12);
    assert.ok(slice.codeSlice.includes('export function helper'));
    assert.ok(slice.codeSlice.includes('>'));
    assert.ok(slice.tokenSavingsPercent > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SymbolParser extracts TS variable functions, type aliases, and GDScript bracketed types', () => {
  const tsCode = [
    'export type State = "active" | "idle";',
    'export const calculateScore = (x: number) => x * 2;',
    'export const runTask = function() { return true; };'
  ].join('\n');
  const tsSymbols = SymbolParser.parseTypeScript('src/state.ts', tsCode);
  assert.ok(tsSymbols.find((s: SymbolEntry) => s.name === 'State'));
  assert.ok(tsSymbols.find((s: SymbolEntry) => s.name === 'calculateScore'));
  assert.ok(tsSymbols.find((s: SymbolEntry) => s.name === 'runTask'));

  const gdCode = [
    'class_name Inventory',
    'func get_items() -> Array[Item]:',
    '    return []',
    'func get_dict() -> Dictionary[String, int]:',
    '    return {}'
  ].join('\n');
  const gdSymbols = SymbolParser.parseGDScript('scripts/inventory.gd', gdCode);
  assert.ok(gdSymbols.find((s: SymbolEntry) => s.name === 'Inventory.get_items'));
  assert.ok(gdSymbols.find((s: SymbolEntry) => s.name === 'Inventory.get_dict'));
});

test('SymbolParser parses @rpc decorated GDScript functions and includes decorators in slice line range', () => {
  const gdDecorated = [
    'class_name NetworkController',
    '@rpc("any_peer", "call_local")',
    'func sync_player(state: Dictionary) -> void:',
    '    print("syncing")',
    '',
    '@rpc func ping() -> void:',
    '    pass'
  ].join('\n');

  const symbols = SymbolParser.parseGDScript('scripts/net.gd', gdDecorated);
  const syncFunc = symbols.find((s: SymbolEntry) => s.name === 'NetworkController.sync_player');
  assert.ok(syncFunc);
  assert.strictEqual(syncFunc.startLine, 2); // Includes @rpc annotation line
  assert.strictEqual(syncFunc.endLine, 5);

  const pingFunc = symbols.find((s: SymbolEntry) => s.name === 'NetworkController.ping');
  assert.ok(pingFunc);
  assert.strictEqual(pingFunc.startLine, 6);
});

test('SymbolParser and CrossReferenceLinker parse Python/polyglot files with multi-line blocks', () => {
  const pyCode = [
    'class DataProcessor:',
    '    def compute(self, val):',
    '        result = val * 10',
    '        return result',
    '',
    'def standalone():',
    '    pass'
  ].join('\n');

  const symbols = SymbolParser.parseGeneric('scripts/processor.py', pyCode);
  const computeFn = symbols.find((s: SymbolEntry) => s.name === 'compute');
  assert.ok(computeFn);
  assert.strictEqual(computeFn.startLine, 2);
  assert.strictEqual(computeFn.endLine, 5);

  const linker = new CrossReferenceLinker();
  linker.linkSingleFile('scripts/processor.py', pyCode);
  const nodes = linker.getGraph().getAllNodes();
  assert.ok(nodes.some(n => n.name === 'compute'));
  assert.ok(nodes.some(n => n.name === 'DataProcessor'));
});

test('SymbolIndexer findSymbols resolves all symbols in file when queried by file path', () => {
  const indexer = new SymbolIndexer();
  indexer.indexFile('src/models/user.ts', 'export class User { id: string; } export function createUser() {}');

  const matchesDirect = indexer.findSymbols('src/models/user.ts');
  assert.strictEqual(matchesDirect.length, 2);
  assert.strictEqual(matchesDirect[0].name, 'User');

  const matchesFilename = indexer.findSymbols('user.ts');
  assert.strictEqual(matchesFilename.length, 2);
});
