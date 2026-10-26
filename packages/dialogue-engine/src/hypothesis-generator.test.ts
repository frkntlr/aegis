import { test } from 'node:test';
import assert from 'node:assert';
import { AstTriangulator } from './ast-triangulator.js';
import { DynamicHypothesisGenerator } from './hypothesis-generator.js';
import { DiagnosticCategory } from './types.js';
import { IMemorySliceResolver, MemorySymbolSlice } from './ports/memory-slice-resolver.js';

class MockSliceResolver implements IMemorySliceResolver {
  constructor(private delayMs = 0) {}
  async resolveSlice(filePath: string, line?: number, sym?: string): Promise<MemorySymbolSlice | null> {
    if (this.delayMs > 0) {
      await new Promise(r => setTimeout(r, this.delayMs));
    }
    return {
      symbolName: sym || 'processTask',
      filePath,
      startLine: line || 10,
      endLine: (line || 10) + 15,
      foldedSkeleton: 'function processTask() { ... }',
      ambientTypes: ['interface TaskData'],
      calleeSignatures: ['clean()'],
      upstreamCallers: ['runner.ts'],
      context7Doc: 'Test Doc'
    };
  }
}

test('AstTriangulator extracts symbol slice and callers within SLA', async () => {
  const triangulator = new AstTriangulator();
  const res = await triangulator.triangulate(
    {
      filePath: 'src/task.ts',
      lineNumber: 42,
      columnNumber: 5,
      symbolName: 'runWorker',
      format: 'generic_posix',
      confidence: 0.95
    },
    new MockSliceResolver()
  );

  assert.strictEqual(res.isSlaBreached, false);
  assert.strictEqual(res.location.filePath, 'src/task.ts');
  assert.strictEqual(res.slice?.symbolName, 'runWorker');
  assert.deepStrictEqual(res.callers, ['runner.ts']);
});

test('AstTriangulator enforces SLA timeout and falls back safely', async () => {
  const triangulator = new AstTriangulator();
  const slowResolver = new MockSliceResolver(100);
  const res = await triangulator.triangulate(
    {
      filePath: 'src/slow.ts',
      lineNumber: 10,
      columnNumber: 1,
      format: 'generic_posix',
      confidence: 0.8
    },
    slowResolver,
    20
  );

  assert.strictEqual(res.isSlaBreached, true);
  assert.strictEqual(res.slice, undefined);
  assert.ok(res.primaryHypothesis.includes('src/slow.ts:10'));
});

test('DynamicHypothesisGenerator generates falsifiable hypotheses with micro-probe commands', async () => {
  const triangulator = new AstTriangulator();
  const ctx = await triangulator.triangulate(
    {
      filePath: 'packages/core/watchdog.ts',
      lineNumber: 55,
      columnNumber: 3,
      symbolName: 'resetTimer',
      format: 'node_v8',
      confidence: 0.95
    },
    new MockSliceResolver()
  );

  const options = DynamicHypothesisGenerator.generate(DiagnosticCategory.PERFORMANCE, ctx);
  assert.strictEqual(options.length, 2);
  assert.strictEqual(options[0].id, 'hyp-direct');
  assert.strictEqual(options[0].hypothesisKey, 'NULL_DEREFERENCE');
  assert.ok(options[0].label.includes('resetTimer()'));
  assert.ok(options[0].microProbeCommand?.includes('npm test -- -t "resetTimer"'));
  assert.strictEqual(options[1].id, 'hyp-async');
});

test('DynamicHypothesisGenerator includes budget decomposition option when quota is low', async () => {
  const triangulator = new AstTriangulator();
  const ctx = await triangulator.triangulate(
    {
      filePath: 'packages/core/engine.ts',
      lineNumber: 290,
      columnNumber: 1,
      symbolName: 'start',
      format: 'generic_posix',
      confidence: 0.9
    },
    new MockSliceResolver()
  );

  const budget = {
    filePath: 'packages/core/engine.ts',
    currentLines: 288,
    maxLines: 300,
    remainingLines: 12,
    mustDecompose: true
  };

  const options = DynamicHypothesisGenerator.generate(DiagnosticCategory.CAGE_VIOLATION, ctx, budget);
  assert.strictEqual(options.length, 3);
  assert.strictEqual(options[2].id, 'hyp-budget');
  assert.strictEqual(options[2].hypothesisKey, 'LINE_BUDGET_OVERFLOW');
  assert.ok(options[2].microProbeCommand?.includes('cage:check'));
});

test('DynamicHypothesisGenerator falls back to static options when no triangulated context', () => {
  const options = DynamicHypothesisGenerator.generate(DiagnosticCategory.GODOT_ENGINE);
  assert.ok(options.length >= 2);
  assert.strictEqual(options[0].id, 'godot-1');
});
