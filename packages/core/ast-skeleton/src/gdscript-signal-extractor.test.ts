import { test } from 'node:test';
import * as assert from 'node:assert';
import { GdSignalExtractor } from './gdscript-signal-extractor.js';
import { SymbolParser } from './symbol-parser.js';
import { TscnRelationParser } from './tscn-relation-parser.js';

test('GdSignalExtractor resolves modern Godot 4 Callable connections without creating orphan nodes', () => {
  const filePath = 'scripts/player.gd';
  const content = [
    'class_name Player',
    'extends CharacterBody2D',
    'signal player_died',
    'func _ready():',
    '    $AttackButton.pressed.connect(_on_attack_pressed)',
    '    timer.timeout.connect(Callable(self, "_on_timeout"))',
    '    player_died.connect(_on_player_died)',
    'func _on_attack_pressed():',
    '    pass',
    'func _on_timeout():',
    '    pass',
    'func _on_player_died():',
    '    pass'
  ].join('\n');

  const symbols = SymbolParser.parseGDScript(filePath, content);
  const result = GdSignalExtractor.extract(filePath, content, symbols);

  const attackConn = result.edges.find(e => e.metadata?.signal === 'pressed');
  assert.ok(attackConn);
  assert.strictEqual(attackConn.from, 'AttackButton::pressed');
  assert.strictEqual(attackConn.to, 'scripts/player.gd::_on_attack_pressed');
  assert.strictEqual(attackConn.type, 'CONNECTS_SIGNAL');

  const timerConn = result.edges.find(e => e.metadata?.signal === 'timeout');
  assert.ok(timerConn);
  assert.strictEqual(timerConn.from, 'timer::timeout');
  assert.strictEqual(timerConn.to, 'scripts/player.gd::_on_timeout');

  const diedConn = result.edges.find(e => e.metadata?.signal === 'player_died');
  assert.ok(diedConn);
  assert.strictEqual(diedConn.from, 'scripts/player.gd::player_died');
  assert.strictEqual(diedConn.to, 'scripts/player.gd::_on_player_died');

  const orphan = result.edges.find(e => e.from === 'scripts/player.gd::pressed');
  assert.strictEqual(orphan, undefined);
});

test('GdSignalExtractor attributes signal emissions to enclosing functions', () => {
  const filePath = 'scripts/hero.gd';
  const content = [
    'signal damaged(amount)',
    'func take_damage(amount: int) -> void:',
    '    damaged.emit(amount)',
    '    target.hit.emit()',
    'func legacy_heal():',
    '    emit_signal("damaged", 0)'
  ].join('\n');

  const symbols = SymbolParser.parseGDScript(filePath, content);
  const result = GdSignalExtractor.extract(filePath, content, symbols);

  const localEmit = result.edges.find(e => e.from === 'scripts/hero.gd::take_damage' && e.to === 'scripts/hero.gd::damaged');
  assert.ok(localEmit);
  assert.strictEqual(localEmit.type, 'EMITS_SIGNAL');

  const targetEmit = result.edges.find(e => e.to === 'target::hit');
  assert.ok(targetEmit);
  assert.strictEqual(targetEmit.from, 'scripts/hero.gd::take_damage');

  const legacyEmit = result.edges.find(e => e.from === 'scripts/hero.gd::legacy_heal');
  assert.ok(legacyEmit);
  assert.strictEqual(legacyEmit.to, 'scripts/hero.gd::damaged');
});

test('TscnRelationParser creates bi-directional ATTACHES_SCRIPT and ATTACHED_SCRIPT edges', () => {
  const sceneContent = [
    '[gd_scene format=3]',
    '[ext_resource type="Script" path="res://player.gd" id="1_scr"]',
    '[node name="Root" type="Node2D"]',
    'script = ExtResource("1_scr")',
    '[node name="Btn" type="Button" parent="."] ',
    '[connection signal="pressed" from="Btn" to="." method="_on_pressed"]'
  ].join('\n');

  const parsed = TscnRelationParser.parse('scenes/main.tscn', sceneContent);

  const attachEdge = parsed.edges.find(e => e.type === 'ATTACHES_SCRIPT');
  assert.ok(attachEdge);
  assert.strictEqual(attachEdge.from, 'scenes/main.tscn::Root');
  assert.strictEqual(attachEdge.to, 'player.gd');

  const attachedEdge = parsed.edges.find(e => e.type === 'ATTACHED_SCRIPT');
  assert.ok(attachedEdge);
  assert.strictEqual(attachedEdge.from, 'player.gd');
  assert.strictEqual(attachedEdge.to, 'scenes/main.tscn::Root');

  const connEdge = parsed.edges.find(e => e.type === 'CONNECTS_SIGNAL');
  assert.ok(connEdge);
  assert.strictEqual(connEdge.to, 'player.gd::_on_pressed');
});
