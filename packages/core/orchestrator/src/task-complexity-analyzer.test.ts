import test from 'node:test';
import * as assert from 'node:assert';
import { TaskComplexityAnalyzer } from './task-complexity-analyzer.js';

test('TaskComplexityAnalyzer correctly classifies TRIVIAL task', () => {
  const result = TaskComplexityAnalyzer.analyze('fix typo in readme', ['README.md']);
  assert.strictEqual(result.tier, 'TRIVIAL');
  assert.strictEqual(result.optimalAgentCount, 1);
  assert.strictEqual(result.shouldEnableHierarchicalTree, false);
  assert.deepStrictEqual(result.suggestedRoles, ['docs']);
});

test('TaskComplexityAnalyzer correctly classifies MODERATE task', () => {
  const result = TaskComplexityAnalyzer.analyze('fix bug in parser and add test', [
    'src/parser.ts',
    'test/parser.test.ts'
  ]);
  assert.strictEqual(result.tier, 'MODERATE');
  assert.strictEqual(result.optimalAgentCount, 2);
  assert.strictEqual(result.shouldEnableHierarchicalTree, false);
  assert.ok(result.suggestedRoles.includes('solver'));
  assert.ok(result.suggestedRoles.includes('qa'));
});

test('TaskComplexityAnalyzer correctly classifies COMPLEX task', () => {
  const result = TaskComplexityAnalyzer.analyze('feature pipeline integration for state controller and test suite', [
    'src/state-controller.ts',
    'src/state-worker.ts',
    'src/adapter.ts',
    'test/state.test.ts'
  ]);
  assert.strictEqual(result.tier, 'COMPLEX');
  assert.strictEqual(result.optimalAgentCount, 4);
  assert.strictEqual(result.suggestedRoles.length, 4);
});

test('TaskComplexityAnalyzer correctly classifies HYPER_SCALE task', () => {
  const result = TaskComplexityAnalyzer.analyze('monorepo architecture overhaul refactor engine with multi-agent swarm', [
    'packages/core/orchestrator/src/a.ts',
    'packages/cli/src/b.ts',
    'packages/godot-runtime/src/c.ts',
    'packages/web-dashboard/src/d.ts',
    'packages/core/orchestrator/src/e.ts',
    'packages/cli/src/f.ts'
  ]);
  assert.strictEqual(result.tier, 'HYPER_SCALE');
  assert.ok(result.optimalAgentCount >= 8);
  assert.strictEqual(result.shouldEnableHierarchicalTree, true);
});

test('TaskComplexityAnalyzer formatRadar formats markdown output', () => {
  const result = TaskComplexityAnalyzer.analyze('monorepo architecture overhaul', ['packages/cli/src/index.ts']);
  const radar = TaskComplexityAnalyzer.formatRadar(result);
  assert.ok(radar.includes('Otonom Görev Karmaşıklık Radarı'));
  assert.ok(radar.includes('Önerilen / Tahsis Edilen Ajan Sayısı:'));
});

test('TaskComplexityAnalyzer correctly classifies Turkish multi-agent complex task', () => {
  const result = TaskComplexityAnalyzer.analyze(
    'çoklu ajan mantığı ile eş zamanlı çalışıp hızlı sonuç odaklı analiz ve mimari geliştirme yap',
    ['packages/core/orchestrator/src/a.ts', 'packages/cli/src/b.ts']
  );
  assert.ok(result.tier === 'COMPLEX' || result.tier === 'HYPER_SCALE');
  assert.ok(result.optimalAgentCount >= 4);
});
