import { test } from 'node:test';
import * as assert from 'node:assert';
import { ClassDbOracle } from './classdboracle/classdboracle.js';

test('ClassDbOracle resolves builtin classes and walks inheritance chain', () => {
  const oracle = new ClassDbOracle();

  const nodeCls = oracle.queryClass('Node');
  assert.ok(nodeCls);
  assert.strictEqual(nodeCls.name, 'Node');

  // Direct method
  const directMethod = oracle.queryMethod('CharacterBody2D', 'move_and_slide');
  assert.ok(directMethod);
  assert.strictEqual(directMethod.returnType, 'bool');

  // Inherited method (CharacterBody2D -> Node2D -> CanvasItem -> Node)
  const inheritedMethod = oracle.queryMethod('CharacterBody2D', 'get_node');
  assert.ok(inheritedMethod);
  assert.strictEqual(inheritedMethod.name, 'get_node');

  // Inherited property
  const inheritedProp = oracle.queryProperty('CharacterBody2D', 'position');
  assert.ok(inheritedProp);
  assert.strictEqual(inheritedProp.type, 'Vector2');

  // Signals
  const btnSignal = oracle.querySignal('Button', 'pressed');
  assert.ok(btnSignal);
});

test('ClassDbOracle searches classes and validates GDScript base usage', () => {
  const oracle = new ClassDbOracle();

  const matches = oracle.searchClasses('node');
  assert.ok(matches.length >= 2);

  const cleanScript = [
    'extends CharacterBody2D',
    'func _physics_process(delta):',
    '    self.move_and_slide()'
  ].join('\n');

  const cleanViolations = oracle.validateUsage(cleanScript, 'player.gd');
  assert.strictEqual(cleanViolations.length, 0);

  const invalidScript = [
    'extends CharacterBody2D',
    'func _ready():',
    '    self.non_existent_method_xyz()'
  ].join('\n');

  const invalidViolations = oracle.validateUsage(invalidScript, 'broken.gd');
  assert.strictEqual(invalidViolations.length, 1);
  assert.strictEqual(invalidViolations[0].symbol, 'non_existent_method_xyz');
  assert.strictEqual(invalidViolations[0].severity, 'error');
});
