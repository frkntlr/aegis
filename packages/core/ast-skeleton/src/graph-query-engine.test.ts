import { test } from 'node:test';
import * as assert from 'node:assert';
import { RelationalGraph } from './relational-graph.js';
import { GraphQueryEngine } from './graph-query-engine.js';

test('GraphQueryEngine traverses multi-hop upstream call-hierarchy and computes surgical blast radius', () => {
  const graph = new RelationalGraph();
  graph.addNode({ id: 'src/api.ts::handleRequest', name: 'handleRequest', kind: 'symbol', filePath: 'src/api.ts' });
  graph.addNode({ id: 'src/service.ts::processPayment', name: 'processPayment', kind: 'symbol', filePath: 'src/service.ts' });
  graph.addNode({ id: 'src/gateway.ts::chargeCard', name: 'chargeCard', kind: 'symbol', filePath: 'src/gateway.ts' });

  // api -> service -> gateway
  graph.addEdge({ from: 'src/api.ts::handleRequest', to: 'src/service.ts::processPayment', type: 'CALLS_SYMBOL' });
  graph.addEdge({ from: 'src/service.ts::processPayment', to: 'src/gateway.ts::chargeCard', type: 'CALLS_SYMBOL' });

  const engine = new GraphQueryEngine(graph);
  const trace = engine.trace('chargeCard');

  assert.ok(trace.foundNode);
  assert.strictEqual(trace.foundNode.name, 'chargeCard');
  assert.strictEqual(trace.upstreamEdges.length, 2);
  assert.ok(trace.blastRadiusFiles.includes('src/gateway.ts'));
  assert.ok(trace.blastRadiusFiles.includes('src/service.ts'));
  assert.ok(trace.blastRadiusFiles.includes('src/api.ts'));
});

test('GraphQueryEngine handles 3-node mutual recursion and cycles with zero infinite loops', () => {
  const graph = new RelationalGraph();
  graph.addNode({ id: 'src/a.ts::stepA', name: 'stepA', kind: 'symbol', filePath: 'src/a.ts' });
  graph.addNode({ id: 'src/b.ts::stepB', name: 'stepB', kind: 'symbol', filePath: 'src/b.ts' });
  graph.addNode({ id: 'src/c.ts::stepC', name: 'stepC', kind: 'symbol', filePath: 'src/c.ts' });

  // Cycle: A -> B -> C -> A
  graph.addEdge({ from: 'src/a.ts::stepA', to: 'src/b.ts::stepB', type: 'CALLS_SYMBOL' });
  graph.addEdge({ from: 'src/b.ts::stepB', to: 'src/c.ts::stepC', type: 'CALLS_SYMBOL' });
  graph.addEdge({ from: 'src/c.ts::stepC', to: 'src/a.ts::stepA', type: 'CALLS_SYMBOL' });

  const engine = new GraphQueryEngine(graph);
  const trace = engine.trace('src/a.ts::stepA', 10);

  assert.strictEqual(trace.upstreamEdges.length, 3);
  assert.strictEqual(trace.downstreamEdges.length, 3);
  assert.strictEqual(trace.blastRadiusFiles.length, 3);
  assert.ok(trace.blastRadiusFiles.includes('src/a.ts'));
  assert.ok(trace.blastRadiusFiles.includes('src/b.ts'));
  assert.ok(trace.blastRadiusFiles.includes('src/c.ts'));
});

test('GraphQueryEngine respects maxDepth limit during BFS traversal', () => {
  const graph = new RelationalGraph();
  // Chain: N0 -> N1 -> N2 -> N3 -> N4 -> N5
  for (let i = 0; i <= 5; i++) {
    graph.addNode({ id: `f${i}.ts::func${i}`, name: `func${i}`, kind: 'symbol', filePath: `f${i}.ts` });
    if (i > 0) {
      graph.addEdge({ from: `f${i - 1}.ts::func${i - 1}`, to: `f${i}.ts::func${i}`, type: 'CALLS_SYMBOL' });
    }
  }

  const engine = new GraphQueryEngine(graph);
  // maxDepth = 2 from func5 should only see func4 and func3
  const trace = engine.trace('f5.ts::func5', 2);
  assert.strictEqual(trace.upstreamEdges.length, 2);
});

test('GraphQueryEngine bridges short symbol names and fully qualified node IDs', () => {
  const graph = new RelationalGraph();
  graph.addNode({ id: 'src/hero.gd::take_damage', name: 'take_damage', kind: 'symbol', filePath: 'src/hero.gd' });
  // Incoming edge using short name target
  graph.addEdge({ from: 'src/enemy.gd::attack', to: 'take_damage', type: 'CALLS_SYMBOL' });

  const engine = new GraphQueryEngine(graph);
  const trace = engine.trace('src/hero.gd::take_damage');

  assert.strictEqual(trace.upstreamEdges.length, 1);
  assert.strictEqual(trace.upstreamEdges[0].from, 'src/enemy.gd::attack');
  assert.ok(trace.blastRadiusFiles.includes('src/enemy.gd'));
});
