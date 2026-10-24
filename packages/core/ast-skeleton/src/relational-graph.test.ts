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
