import { test } from 'node:test';
import * as assert from 'node:assert';
import { AegisEngineService } from './engine-service.js';

test('AegisEngineService executes analysis tools cleanly', () => {
  const engine = new AegisEngineService();

  const cage = engine.runCageCheck();
  assert.strictEqual(cage.tool, 'cage_check');
  assert.ok(typeof cage.filesScanned === 'number');
  assert.ok(cage.filesScanned > 0);
  assert.strictEqual(cage.violationsCount, 0);

  const triage = engine.runBugTriage();
  assert.strictEqual(triage.tool, 'bug_triage');
  assert.strictEqual(triage.criticalCount, 0);
  assert.strictEqual(triage.clean, true);

  const sym = engine.runSymbolFind('IronCageValidator');
  assert.strictEqual(sym.tool, 'symbol_find');
  assert.ok(typeof sym.matchesCount === 'number');
  assert.ok(sym.matchesCount > 0);

  const trace = engine.runRelationalTrace('IronCageValidator');
  assert.strictEqual(trace.tool, 'relational_trace');
  assert.ok(typeof trace.blastRadiusFilesCount === 'number');
});
