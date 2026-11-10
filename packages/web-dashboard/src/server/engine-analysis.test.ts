import { test, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
});
