import test from 'node:test';
import * as assert from 'node:assert/strict';
import { GodotTopicResolver } from './godot-topic-resolver.js';

test('GodotTopicResolver.isSubclassOf traverses GDScript hierarchy', () => {
  assert.equal(GodotTopicResolver.isSubclassOf('CharacterBody2D', 'CollisionObject2D'), true);
  assert.equal(GodotTopicResolver.isSubclassOf('CharacterBody2D', 'Node'), true);
  assert.equal(GodotTopicResolver.isSubclassOf('CheckButton', 'Control'), true);
  assert.equal(GodotTopicResolver.isSubclassOf('Label', 'Node2D'), false);
  assert.equal(GodotTopicResolver.isSubclassOf('UnknownType', 'Node'), false);
});

test('GodotTopicResolver.extractExtendsClass parses extends declarations', () => {
  assert.equal(GodotTopicResolver.extractExtendsClass('  extends CharacterBody3D\nfunc _ready(): pass'), 'CharacterBody3D');
  assert.equal(GodotTopicResolver.extractExtendsClass('extends VBoxContainer'), 'VBoxContainer');
  assert.equal(GodotTopicResolver.extractExtendsClass('var x = 1'), null);
});

test('GodotTopicResolver.resolveTopic classifies physics, ui, signals, and lifecycle', () => {
  assert.equal(GodotTopicResolver.resolveTopic('extends RigidBody2D\nfunc _physics_process(d): pass'), 'physics');
  assert.equal(GodotTopicResolver.resolveTopic('extends Area3D\n'), 'physics');
  assert.equal(GodotTopicResolver.resolveTopic('extends MarginContainer\n'), 'ui');
  assert.equal(GodotTopicResolver.resolveTopic('extends Button\n'), 'ui');
  assert.equal(GodotTopicResolver.resolveTopic('extends Node\nsignal health_changed(val)\n'), 'signals');
  assert.equal(GodotTopicResolver.resolveTopic('extends Node\nfunc _ready():\n  btn.pressed.connect(_go)\n'), 'signals');
  assert.equal(GodotTopicResolver.resolveTopic('extends Node\nfunc _ready(): pass\n'), 'lifecycle');
});
