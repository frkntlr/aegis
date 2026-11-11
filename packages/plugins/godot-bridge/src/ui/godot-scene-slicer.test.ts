import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GodotSceneSlicer } from './godot-scene-slicer.js';

const SAMPLE_TSCN = `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/start_button.gd" id="1_btn"]

[node name="MainUI" type="Control"]
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0

[node name="Header" type="HBoxContainer" parent="."]
custom_minimum_size = Vector2(0, 60)

[node name="Title" type="Label" parent="Header"]
text = "Aegis Game"

[node name="Content" type="VBoxContainer" parent="."]
custom_minimum_size = Vector2(400, 300)

[node name="StartButton" type="Button" parent="Content"]
unique_name_in_owner = true
text = "Start Game"
custom_minimum_size = Vector2(120, 48)
script = ExtResource("1_btn")

[node name="Icon" type="TextureRect" parent="Content/StartButton"]

[node name="ExitButton" type="Button" parent="Content"]
text = "Exit"
custom_minimum_size = Vector2(100, 40)

[node name="Footer" type="PanelContainer" parent="."]

[connection signal="pressed" from="StartButton" to="." method="_on_start_pressed"]
[connection signal="pressed" from="ExitButton" to="." method="_on_exit_pressed"]
`;

test('GodotSceneSlicer slices full scene into surgical compact text under token budget', () => {
  const start = performance.now();
  const sliced = GodotSceneSlicer.sliceContent(SAMPLE_TSCN);
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 100, `Slicing took ${elapsed}ms, expected sub-100ms on CI`);
  assert.ok(sliced.includes('MainUI [Control]'));
  assert.ok(sliced.includes('anchors_preset: 15'));
  assert.ok(sliced.includes('Header [HBoxContainer]'));
  assert.ok(sliced.includes('custom_minimum_size: Vector2(0, 60)'));
  assert.ok(sliced.includes('%StartButton [Button]'));
  assert.ok(sliced.includes('script: res://scripts/start_button.gd'));
  assert.ok(sliced.includes('signals: [pressed -> _on_start_pressed]'));
  assert.ok(sliced.includes('Icon [TextureRect]'));

  // Ensure surgical size (<150 tokens ~ <600 chars)
  assert.ok(sliced.length < 1000, `Output length ${sliced.length} exceeds token budget`);
});

test('GodotSceneSlicer limits tree depth with maxDepth', () => {
  const depth0 = GodotSceneSlicer.sliceContent(SAMPLE_TSCN, { maxDepth: 0 });
  assert.ok(depth0.includes('MainUI [Control]'));
  assert.ok(!depth0.includes('Header'));
  assert.ok(!depth0.includes('StartButton'));

  const depth1 = GodotSceneSlicer.sliceContent(SAMPLE_TSCN, { maxDepth: 1 });
  assert.ok(depth1.includes('MainUI [Control]'));
  assert.ok(depth1.includes('Header [HBoxContainer]'));
  assert.ok(depth1.includes('Content [VBoxContainer]'));
  assert.ok(depth1.includes('Footer [PanelContainer]'));
  assert.ok(!depth1.includes('Title'));
  assert.ok(!depth1.includes('StartButton'));
});

test('GodotSceneSlicer isolates focusNode with its direct parent and children', () => {
  const sliced = GodotSceneSlicer.sliceContent(SAMPLE_TSCN, { focusNode: '%StartButton' });

  // Focus node and ancestors
  assert.ok(sliced.includes('MainUI [Control]'));
  assert.ok(sliced.includes('Content [VBoxContainer]'));
  assert.ok(sliced.includes('%StartButton [Button]'));
  // Direct child
  assert.ok(sliced.includes('Icon [TextureRect]'));

  // Unrelated branches & siblings must be excluded
  assert.ok(!sliced.includes('Header'));
  assert.ok(!sliced.includes('Title'));
  assert.ok(!sliced.includes('ExitButton'));
  assert.ok(!sliced.includes('Footer'));
});

test('GodotSceneSlicer supports compact mode and empty inputs', () => {
  const compact = GodotSceneSlicer.sliceContent(SAMPLE_TSCN, { compact: true });
  assert.ok(!compact.includes('└──'));
  assert.ok(compact.includes('  Header [HBoxContainer]'));

  const empty = GodotSceneSlicer.sliceContent('');
  assert.strictEqual(empty, '');

  const nonExistentFocus = GodotSceneSlicer.sliceContent(SAMPLE_TSCN, { focusNode: 'NonExistent' });
  assert.strictEqual(nonExistentFocus, '');
});

test('GodotSceneSlicer reads from file path and handles errors', () => {
  const tempPath = path.join(os.tmpdir(), `aegis-test-scene-${Date.now()}.tscn`);
  try {
    fs.writeFileSync(tempPath, SAMPLE_TSCN, 'utf8');
    const result = GodotSceneSlicer.sliceScene(tempPath, { maxDepth: 1 });
    assert.ok(result.includes('MainUI [Control]'));
    assert.ok(result.includes('Content [VBoxContainer]'));

    const parsed = GodotSceneSlicer.parseFile(tempPath);
    assert.strictEqual(parsed.nodes.length, 8);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }

  assert.throws(() => {
    GodotSceneSlicer.sliceScene('/invalid/path/to/missing.tscn');
  }, /Scene file not found/);
});
