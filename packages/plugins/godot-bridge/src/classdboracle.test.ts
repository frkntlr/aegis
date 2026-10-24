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

  const typoScript = [
    'extends CharacterBody2D',
    'func _physics_process(delta):',
    '    self.move_and_slid()'
  ].join('\n');
  const typoViolations = oracle.validateUsage(typoScript, 'typo.gd');
  assert.strictEqual(typoViolations.length, 1);
  assert.ok(typoViolations[0].message.includes("Did you mean 'move_and_slide'?"));
});

test('ClassDbOracle resolves expanded builtin classes offline', () => {
  const oracle = new ClassDbOracle();
  assert.ok(oracle.queryClass('RefCounted'));
  assert.ok(oracle.queryClass('Resource'));
  assert.ok(oracle.queryClass('Label'));
  assert.ok(oracle.queryClass('Timer'));
  assert.ok(oracle.queryClass('AudioStreamPlayer'));

  const timerTimeout = oracle.querySignal('Timer', 'timeout');
  assert.ok(timerTimeout);

  const audioPlay = oracle.queryMethod('AudioStreamPlayer', 'play');
  assert.ok(audioPlay);
});

test('ClassDbOracle accepts local script methods called via self without false errors', () => {
  const oracle = new ClassDbOracle();
  const scriptWithLocal = [
    'extends Control',
    'func _ready():',
    '    self._init_custom_ui()',
    'func _init_custom_ui():',
    '    pass'
  ].join('\n');

  const violations = oracle.validateUsage(scriptWithLocal, 'test.gd');
  assert.strictEqual(violations.length, 0);
});

test('ClassDbOracle resolves Tween, SceneTree, TextureRect, and LineEdit offline', () => {
  const oracle = new ClassDbOracle();
  assert.ok(oracle.queryClass('Tween'));
  assert.ok(oracle.queryClass('SceneTree'));
  assert.ok(oracle.queryClass('TextureRect'));
  assert.ok(oracle.queryClass('LineEdit'));

  const tweenProp = oracle.queryMethod('Tween', 'tween_property');
  assert.ok(tweenProp);

  const sceneCreateTween = oracle.queryMethod('SceneTree', 'create_tween');
  assert.ok(sceneCreateTween);

  const lineEditText = oracle.queryProperty('LineEdit', 'text');
  assert.ok(lineEditText);
});

test('ClassDbOracle resolves PanelContainer, HFlowContainer, and RichTextLabel', () => {
  const oracle = new ClassDbOracle();
  const panel = oracle.queryClass('PanelContainer');
  assert.ok(panel);
  assert.strictEqual(panel.inherits, 'Container');

  const hflow = oracle.queryClass('HFlowContainer');
  assert.ok(hflow);
  assert.ok(['Container', 'FlowContainer'].includes(hflow.inherits || ''));

  const richText = oracle.queryClass('RichTextLabel');
  assert.ok(richText);
  assert.strictEqual(richText.inherits, 'Control');
  const appendMethod = oracle.queryMethod('RichTextLabel', 'append_text');
  assert.ok(appendMethod);
});
