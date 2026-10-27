import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  BlastRadiusStratifier,
  RelationalGraphProvider,
  RelationalEdgeRef
} from './blast-radius-stratifier.js';
import type { TriageFinding } from './triage-gate.js';

class MockGraph implements RelationalGraphProvider {
  private incomingMap: Map<string, RelationalEdgeRef[]> = new Map();

  public addEdge(from: string, to: string): void {
    const normTo = to.replace(/\\/g, '/');
    const normFrom = from.replace(/\\/g, '/');
    const list = this.incomingMap.get(normTo) || [];
    list.push({ from: normFrom, to: normTo });
    this.incomingMap.set(normTo, list);
  }

  public getIncoming(id: string): RelationalEdgeRef[] {
    return this.incomingMap.get(id.replace(/\\/g, '/')) || [];
  }
}

test('BlastRadiusStratifier calculates blast radius across dependent incoming graph edges', () => {
  const graph = new MockGraph();
  graph.addEdge('src/b.ts', 'src/a.ts');
  graph.addEdge('src/c.ts', 'src/a.ts');
  graph.addEdge('src/d.ts', 'src/b.ts');

  const result = BlastRadiusStratifier.calculateBlastRadius('src/a.ts', graph, 3);
  assert.strictEqual(result.radius, 3);
  assert.deepStrictEqual(result.dependents.sort(), ['src/b.ts', 'src/c.ts', 'src/d.ts'].sort());
});

test('BlastRadiusStratifier respects depth ceiling D <= 3 and avoids circular graph cycles', () => {
  const graph = new MockGraph();
  graph.addEdge('src/b.ts', 'src/a.ts');
  graph.addEdge('src/c.ts', 'src/b.ts');
  graph.addEdge('src/d.ts', 'src/c.ts');
  graph.addEdge('src/e.ts', 'src/d.ts');
  graph.addEdge('src/b.ts', 'src/d.ts');

  const result = BlastRadiusStratifier.calculateBlastRadius('src/a.ts', graph, 3);
  assert.strictEqual(result.radius, 3);
  assert.ok(result.dependents.includes('src/b.ts'));
  assert.ok(result.dependents.includes('src/c.ts'));
  assert.ok(result.dependents.includes('src/d.ts'));
  assert.ok(!result.dependents.includes('src/e.ts'));
});

test('BlastRadiusStratifier stratifies critical findings into Tier 1 when blast radius >= 5', () => {
  const graph = new MockGraph();
  for (let i = 1; i <= 6; i++) {
    graph.addEdge(`src/client${i}.ts`, 'src/core.ts');
  }

  const finding: TriageFinding = {
    id: 'crit-1',
    category: 'CRITICAL_DEFECT',
    title: 'Crash in core',
    filePath: 'src/core.ts',
    evidence: 'Null pointer exception',
    blocking: true
  };

  const res = BlastRadiusStratifier.stratifyFinding(finding, { graph, criticalThreshold: 5 });
  assert.strictEqual(res.tier, 'TIER_1_CRITICAL_BLAST');
  assert.strictEqual(res.blastRadius, 6);
});

test('BlastRadiusStratifier stratifies isolated defects as Tier 2 and debt as Tier 3', () => {
  const graph = new MockGraph();
  graph.addEdge('src/app.ts', 'src/isolated.ts');

  const f1: TriageFinding = {
    id: 'crit-2', category: 'CRITICAL_DEFECT', title: 'Warn', filePath: 'src/isolated.ts', evidence: 'Warn', blocking: false
  };
  const f2: TriageFinding = {
    id: 'debt-1', category: 'ARCHITECTURAL_DEBT', title: 'Lines', filePath: 'src/long.ts', evidence: 'Debt', blocking: false
  };

  assert.strictEqual(BlastRadiusStratifier.stratifyFinding(f1, { graph }).tier, 'TIER_2_ISOLATED_DEFECT');
  assert.strictEqual(BlastRadiusStratifier.stratifyFinding(f2, { graph }).tier, 'TIER_3_DEMIR_KAFES_DEBT');
});

test('BlastRadiusStratifier sorts stratified findings with Tier 1 and highest blast radius first', () => {
  const graph = new MockGraph();
  graph.addEdge('src/b1.ts', 'src/high.ts');
  graph.addEdge('src/b2.ts', 'src/high.ts');

  const list: TriageFinding[] = [
    { id: 'debt-1', category: 'ARCHITECTURAL_DEBT', title: 'D', filePath: 'src/debt.ts', evidence: 'e', blocking: false },
    { id: 'crit-low', category: 'CRITICAL_DEFECT', title: 'L', filePath: 'src/low.ts', evidence: 'e', blocking: false },
    { id: 'crit-test', category: 'CRITICAL_DEFECT', defectType: 'TEST_FAILURE', title: 'T', filePath: 'src/high.ts', evidence: 'e', blocking: true }
  ];

  const sorted = BlastRadiusStratifier.stratifyAll(list, { graph });
  assert.strictEqual(sorted[0].id, 'crit-test');
  assert.strictEqual(sorted[0].tier, 'TIER_1_CRITICAL_BLAST');
  assert.strictEqual(sorted[1].id, 'crit-low');
  assert.strictEqual(sorted[2].id, 'debt-1');
});
