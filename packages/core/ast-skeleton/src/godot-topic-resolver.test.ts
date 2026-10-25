import { test } from 'node:test';
import * as assert from 'node:assert';
import { GodotTopicResolver } from './godot-topic-resolver.js';
import { MemoryAdapterResolver } from './memory-adapter-resolver.js';

test('GodotTopicResolver extracts extends class', () => {
  assert.strictEqual(
    GodotTopicResolver.extractExtendsClass('extends CharacterBody2D\n\nvar speed = 100'),
    'CharacterBody2D'
  );
  assert.strictEqual(
    GodotTopicResolver.extractExtendsClass('extends Button\n'),
    'Button'
  );
  assert.strictEqual(
    GodotTopicResolver.extractExtendsClass('class_name Player\n\nvar hp = 100'),
    null
  );
});

test('GodotTopicResolver checks ClassDB inheritance chain', () => {
  assert.strictEqual(GodotTopicResolver.isSubclassOf('CharacterBody2D', 'CollisionObject2D'), true);
  assert.strictEqual(GodotTopicResolver.isSubclassOf('CharacterBody2D', 'Node'), true);
  assert.strictEqual(GodotTopicResolver.isSubclassOf('CharacterBody2D', 'Control'), false);
  assert.strictEqual(GodotTopicResolver.isSubclassOf('MarginContainer', 'Control'), true);
  assert.strictEqual(GodotTopicResolver.isSubclassOf('CheckButton', 'Control'), true);
  assert.strictEqual(GodotTopicResolver.isSubclassOf('CheckButton', 'CollisionObject2D'), false);
});

test('GodotTopicResolver accurately categorizes physics, ui, signals, and lifecycle', () => {
  assert.strictEqual(GodotTopicResolver.resolveTopic('extends CharacterBody2D\nfunc _physics_process(d): pass'), 'physics');
  assert.strictEqual(GodotTopicResolver.resolveTopic('extends RigidBody3D\npass'), 'physics');
  assert.strictEqual(GodotTopicResolver.resolveTopic('extends Area2D\npass'), 'physics');

  assert.strictEqual(GodotTopicResolver.resolveTopic('extends Button\npass'), 'ui');
  assert.strictEqual(GodotTopicResolver.resolveTopic('extends MarginContainer\npass'), 'ui');
  assert.strictEqual(GodotTopicResolver.resolveTopic('extends VBoxContainer\npass'), 'ui');
  assert.strictEqual(GodotTopicResolver.resolveTopic('extends ProgressBar\npass'), 'ui');

  assert.strictEqual(GodotTopicResolver.resolveTopic('class_name MyBus\nsignal on_hit(damage: int)'), 'signals');
  assert.strictEqual(GodotTopicResolver.resolveTopic('func setup():\n\tsomething.connect(fn)'), 'signals');

  assert.strictEqual(GodotTopicResolver.resolveTopic('extends Node\nfunc _ready(): pass'), 'lifecycle');
  assert.strictEqual(GodotTopicResolver.resolveTopic('class_name Unknown\nfunc compute(): pass'), 'lifecycle');
});

test('MemoryAdapterResolver integrates GodotTopicResolver for ground-truth resolution', () => {
  const queried: string[] = [];
  const adapters = {
    docProvider: (lib: string, topic: string) => {
      queried.push(`${lib}::${topic}`);
      return `doc-for-${lib}-${topic}`;
    }
  };

  const codePhysics = 'extends CharacterBody2D\nfunc _physics_process(d): pass';
  const docs = MemoryAdapterResolver.resolveGroundTruth(codePhysics, adapters, 'player.gd');
  assert.strictEqual(docs.length, 1);
  assert.ok(queried.includes('godot4::physics'));

  const codeUi = 'extends MarginContainer\nfunc _ready(): pass';
  MemoryAdapterResolver.resolveGroundTruth(codeUi, adapters, 'hud.gd');
  assert.ok(queried.includes('godot4::ui'));
});
