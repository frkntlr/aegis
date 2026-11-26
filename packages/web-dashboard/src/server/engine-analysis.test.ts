import { test, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EngineAnalysisTools } from './engine-analysis-tools.js';
import { AegisEngineService } from './engine-service.js';

const previousWorkspace = process.env.AEGIS_WORKSPACE;
let root: string;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-analysis-fixture-'));
  process.env.AEGIS_WORKSPACE = root;
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/validator.ts'),
    'export class FixtureValidator {\n  public validate(): boolean { return true; }\n}\n');
});
after(() => {
  if (previousWorkspace === undefined) delete process.env.AEGIS_WORKSPACE;
  else process.env.AEGIS_WORKSPACE = previousWorkspace;
  fs.rmSync(root, { recursive: true, force: true });
});

test('AegisEngineService executes analysis tools cleanly', () => {
  const engine = new AegisEngineService();

  const cage = engine.runCageCheck('src');
  assert.strictEqual(cage.tool, 'cage_check');
  assert.ok(typeof cage.filesScanned === 'number');
  assert.strictEqual(cage.filesScanned, 1);
  assert.strictEqual(cage.violationsCount, 0);

  const triage = engine.runBugTriage('src');
  assert.strictEqual(triage.tool, 'bug_triage');
  assert.strictEqual(triage.criticalCount, 0);
  assert.strictEqual(triage.clean, true);

  const sym = engine.runSymbolFind('FixtureValidator');
  assert.strictEqual(sym.tool, 'symbol_find');
  assert.ok(typeof sym.matchesCount === 'number');
  assert.ok(Number(sym.matchesCount) >= 1);
  assert.ok(String((sym.topMatch as { filePath: string }).filePath).endsWith('src/validator.ts'));

  const trace = engine.runRelationalTrace('FixtureValidator');
  assert.strictEqual(trace.tool, 'relational_trace');
  assert.ok(typeof trace.blastRadiusFilesCount === 'number');

  const missingSym = engine.runSymbolFind('NonExistentSymbolXyz999');
  assert.strictEqual(missingSym.matchesCount, 0);
  assert.strictEqual(missingSym.topMatch, null);
});

test('EngineAnalysisTools resolves paths relative to repoRoot rather than process.cwd()', () => {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-noncwd-root-'));
  const prevEnv = process.env.AEGIS_WORKSPACE;
  delete process.env.AEGIS_WORKSPACE;
  try {
    fs.mkdirSync(path.join(isolatedRoot, 'src'), { recursive: true });
    const bodyLines = Array.from({ length: 42 }, (_, i) => `  const v${i} = ${i};`).join('\n');
    fs.writeFileSync(path.join(isolatedRoot, 'src', 'bad.ts'), `export function tooLong(): number {\n${bodyLines}\n  return 0;\n}\n`, 'utf8');

    const tools = new EngineAnalysisTools(isolatedRoot);
    const cage = tools.runCageCheck('src');
    const violations = cage.violations as Array<{ file: string; rule: string }>;
    assert.ok(violations.length >= 1);
    assert.strictEqual(cage.compliancePercent, 0);
    assert.strictEqual(violations[0].file, 'src/bad.ts');
    assert.ok(!violations[0].file.startsWith('..'));

    const emptyCage = tools.runCageCheck('non-existent-dir');
    assert.strictEqual(emptyCage.filesScanned, 0);
    assert.strictEqual(emptyCage.compliancePercent, 100);

    const triage = tools.runBugTriage('src');
    assert.strictEqual(triage.tool, 'bug_triage');
    assert.ok(Number(triage.debtCount) >= 1);
    assert.ok(String(cage.summary).includes('ihlal tespit edildi'));
  } finally {
    if (prevEnv !== undefined) process.env.AEGIS_WORKSPACE = prevEnv;
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
});

test('EngineAnalysisTools covers summary, trace, memory, ast, rtk, and context7 outputs', () => {
  const tools = new EngineAnalysisTools();
  const cleanCage = tools.runCageCheck('src');
  assert.ok(String(cleanCage.summary).includes('%100 CLEAN'));

  const defaultTrace = tools.runRelationalTrace(undefined);
  assert.strictEqual(defaultTrace.target, 'IronCageValidator');
  assert.strictEqual(defaultTrace.nodeKind, 'unknown');

  const symTrace = tools.runRelationalTrace('FixtureValidator');
  assert.strictEqual(symTrace.target, 'FixtureValidator');
  assert.strictEqual(typeof symTrace.nodeKind, 'string');

  const stats = tools.runMemoryStats('ut-wt');
  assert.strictEqual(stats.worktreeId, 'ut-wt');
  assert.ok(Number(stats.totalFiles) >= 1);
  assert.strictEqual(fs.existsSync(path.join(root, '.aegis', 'cache', 'memory.json')), false);

  const memFound = tools.runMemoryQuery('FixtureValidator', 'ut-wt');
  assert.strictEqual(memFound.found, true);
  const memDefault = tools.runMemoryQuery(undefined, 'ut-wt');
  assert.strictEqual(memDefault.symbol, 'IronCageValidator');
  assert.strictEqual(memDefault.found, false);

  const ast = tools.runAstSearch('class $NAME', 'src');
  assert.ok(Number(ast.matchCount) >= 1);
  const rtk = tools.runRtkCompress(undefined);
  assert.strictEqual(rtk.tool, 'rtk_compress');
  const c7 = tools.runContext7Query(undefined, undefined);
  assert.strictEqual(c7.library, 'godot4');
  assert.strictEqual(c7.topic, 'lifecycle');
  assert.strictEqual(c7.found, true);
});
