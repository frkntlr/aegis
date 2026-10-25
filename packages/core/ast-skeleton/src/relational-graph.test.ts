import { test } from 'node:test';
import * as assert from 'node:assert';
import { RelationalGraph } from './relational-graph.js';
import { TscnRelationParser } from './tscn-relation-parser.js';
import { CrossReferenceLinker } from './cross-reference-linker.js';
import { GraphQueryEngine } from './graph-query-engine.js';

const sampleTscn = [
  '[gd_scene load_steps=3 format=3 uid="uid://abc123xyz"]',
  '[ext_resource type="Script" path="res://scripts/hero.gd" id="1_hero"]',
  '[ext_resource type="PackedScene" path="res://scenes/sword.tscn" id="2_sword"]',
  '[node name="HeroRoot" type="CharacterBody2D"]',
  'script = ExtResource("1_hero")',
  '[node name="Weapon" type="Node2D" parent="."] ',
  'instance = ExtResource("2_sword")',
  '[node name="AttackButton" type="Button" parent="."] ',
  '[connection signal="pressed" from="AttackButton" to="." method="_on_attack_pressed"]'
].join('\n');

const sampleHeroGd = [
  'class_name Hero',
  'extends CharacterBody2D',
  'signal health_depleted(final_val)',
  'func take_damage(amount: int) -> void:',
  '    health_depleted.emit(0)',
  'func _on_attack_pressed() -> void:',
  '    pass'
].join('\n');

test('TscnRelationParser extracts nodes, attached scripts, and signal connections', () => {
  const res = TscnRelationParser.parse('scenes/hero.tscn', sampleTscn);

  assert.strictEqual(res.nodes.length >= 4, true);
  const scriptEdge = res.edges.find(e => e.type === 'ATTACHES_SCRIPT');
  assert.ok(scriptEdge);
  assert.strictEqual(scriptEdge.to, 'scripts/hero.gd');

  const instanceEdge = res.edges.find(e => e.type === 'INSTANTIATES');
  assert.ok(instanceEdge);
  assert.strictEqual(instanceEdge.to, 'scenes/sword.tscn');

  const connEdge = res.edges.find(e => e.type === 'CONNECTS_SIGNAL');
  assert.ok(connEdge);
  assert.strictEqual(connEdge.metadata?.signal, 'pressed');
  assert.strictEqual(connEdge.metadata?.method, '_on_attack_pressed');
});

test('CrossReferenceLinker connects scenes, scripts, and signals into unified graph', () => {
  const linker = new CrossReferenceLinker();
  linker.linkSingleFile('scenes/hero.tscn', sampleTscn);
  linker.linkSingleFile('scripts/hero.gd', sampleHeroGd);

  const graph = linker.getGraph();
  const heroNode = graph.getNode('scripts/hero.gd::Hero');
  assert.ok(heroNode);

  const queryEngine = new GraphQueryEngine(graph);
  const trace = queryEngine.trace('scripts/hero.gd::_on_attack_pressed');

  assert.strictEqual(trace.upstreamEdges.length >= 1, true);
  assert.strictEqual(trace.connectedScenes.includes('scenes/hero.tscn'), true);
  assert.ok(trace.blastRadiusFiles.length >= 1);
});

test('GraphQueryEngine safely handles cyclic dependencies without infinite recursion', () => {
  const graph = new RelationalGraph();
  graph.addNode({ id: 'nodeA', name: 'nodeA', kind: 'symbol', filePath: 'a.ts' });
  graph.addNode({ id: 'nodeB', name: 'nodeB', kind: 'symbol', filePath: 'b.ts' });

  // A -> B -> A cycle
  graph.addEdge({ from: 'nodeA', to: 'nodeB', type: 'CALLS' });
  graph.addEdge({ from: 'nodeB', to: 'nodeA', type: 'CALLS' });

  const queryEngine = new GraphQueryEngine(graph);
  const trace = queryEngine.trace('nodeA', 6);

  assert.strictEqual(trace.downstreamEdges.length >= 2, true);
  assert.ok(trace.blastRadiusFiles.includes('a.ts'));
  assert.ok(trace.blastRadiusFiles.includes('b.ts'));
});

test('RelationalGraph serializes and deserializes accurately', () => {
  const graph = new RelationalGraph();
  graph.addNode({ id: 'srv', name: 'Server', kind: 'symbol', filePath: 'srv.ts' });
  graph.addEdge({ from: 'srv', to: 'client', type: 'CALLS' });

  const json = graph.toJSON();
  const graph2 = new RelationalGraph();
  graph2.fromJSON(json);

  assert.ok(graph2.getNode('srv'));
  assert.strictEqual(graph2.getOutgoing('srv').length, 1);
});

test('RelationalGraph normalizes Windows backslashes and deduplicates edges', () => {
  const graph = new RelationalGraph();
  graph.addNode({ id: 'src\\hero.ts::Hero', name: 'Hero', kind: 'symbol', filePath: 'src\\hero.ts' });
  assert.ok(graph.getNode('src/hero.ts::Hero'));

  graph.addEdge({ from: 'src\\hero.ts', to: 'src\\utils.ts', type: 'CALLS' });
  graph.addEdge({ from: 'src/hero.ts', to: 'src/utils.ts', type: 'CALLS' });
  assert.strictEqual(graph.getOutgoing('src/hero.ts').length, 1);
});

test('TscnRelationParser handles unquoted id=1 and child node script connections', () => {
  const customTscn = [
    '[gd_scene format=3]',
    '[ext_resource path="res://child.gd" type="Script" id=1]',
    '[node name="Root" type="Node2D"]',
    '[node name="ChildUI" type="Control" parent="."] ',
    'script = ExtResource(1)',
    '[connection signal="click" from="ChildUI" to="ChildUI" method="_on_click"]'
  ].join('\n');

  const res = TscnRelationParser.parse('scenes/test.tscn', customTscn);
  const conn = res.edges.find(e => e.type === 'CONNECTS_SIGNAL');
  assert.ok(conn);
  assert.strictEqual(conn.to, 'child.gd::_on_click');
});

test('GraphQueryEngine resolves scoped dot-syntax queries like Hero.take_damage', () => {
  const graph = new RelationalGraph();
  graph.addNode({ id: 'scripts/hero.gd::Hero', name: 'Hero', kind: 'symbol', filePath: 'scripts/hero.gd' });
  graph.addNode({ id: 'scripts/hero.gd::take_damage', name: 'take_damage', kind: 'symbol', filePath: 'scripts/hero.gd' });
  graph.addEdge({ from: 'scenes/main.tscn', to: 'scripts/hero.gd::take_damage', type: 'CALLS' });

  const engine = new GraphQueryEngine(graph);
  const trace = engine.trace('Hero.take_damage');
  assert.ok(trace.foundNode);
  assert.strictEqual(trace.foundNode.name, 'take_damage');
  assert.strictEqual(trace.upstreamEdges.length, 1);
});

test('CrossReferenceLinker resolves relative TypeScript imports to normalized target file paths', () => {
  const linker = new CrossReferenceLinker();
  const callerCode = "import { helper } from './utils/helper.js';";
  linker.linkSingleFile('src/services/user.ts', callerCode);

  const graph = linker.getGraph();
  const edges = graph.getOutgoing('src/services/user.ts');
  assert.strictEqual(edges.length, 1);
  assert.strictEqual(edges[0].to, 'src/services/utils/helper.ts');
});

test('GraphQueryEngine extractBlastRadius excludes dot-syntax symbols from file blast radius', () => {
  const graph = new RelationalGraph();
  graph.addEdge({ from: 'Hero.take_damage', to: 'Enemy.die', type: 'CALLS' });
  graph.addEdge({ from: 'src/battle.ts', to: 'Hero.take_damage', type: 'CALLS' });

  const engine = new GraphQueryEngine(graph);
  const trace = engine.trace('Hero.take_damage');
  assert.strictEqual(trace.blastRadiusFiles.includes('Hero.take_damage'), false);
  assert.strictEqual(trace.blastRadiusFiles.includes('Enemy.die'), false);
  assert.strictEqual(trace.blastRadiusFiles.includes('src/battle.ts'), true);
});

test('RelationalGraph supports multi-dimensional nodes, edges, and fast querying', () => {
  const graph = new RelationalGraph();
  graph.addNode({ id: 'src/types.ts::Payload', name: 'Payload', kind: 'type', filePath: 'src/types.ts' });
  graph.addNode({ id: 'res://scenes/Hero.tscn#HitBox', name: 'HitBox', kind: 'scene_node', filePath: 'res://scenes/Hero.tscn' });
  graph.addNode({ id: 'res://hero.gd::damaged', name: 'damaged', kind: 'signal', filePath: 'res://hero.gd' });
  graph.addNode({ id: 'src/hero.ts::takeDamage', name: 'takeDamage', kind: 'symbol', filePath: 'src/hero.ts' });

  assert.strictEqual(graph.nodeCount, 4);
  assert.strictEqual(graph.hasNode('src/types.ts::Payload'), true);
  assert.strictEqual(graph.getNodesByKind('type').length, 1);
  assert.strictEqual(graph.getNodesByKind('signal').length, 1);

  graph.addEdge({ from: 'src/hero.ts::takeDamage', to: 'src/types.ts::Payload', type: 'REFERENCES_TYPE' });
  graph.addEdge({ from: 'src/hero.ts::takeDamage', to: 'src/hero.ts::applyDamage', type: 'CALLS_SYMBOL' });
  graph.addEdge({ from: 'res://scenes/Hero.tscn#HitBox', to: 'res://hero.gd', type: 'ATTACHED_SCRIPT' });

  assert.strictEqual(graph.edgeCount, 3);
  assert.strictEqual(graph.hasEdge('src/hero.ts::takeDamage', 'src/types.ts::Payload', 'REFERENCES_TYPE'), true);
  assert.strictEqual(graph.hasEdge('src/hero.ts::takeDamage', 'nonexistent'), false);

  graph.clear();
  assert.strictEqual(graph.nodeCount, 0);
  assert.strictEqual(graph.edgeCount, 0);
});
