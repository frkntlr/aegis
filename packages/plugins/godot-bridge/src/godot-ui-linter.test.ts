import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GodotUiLinter } from './ui/godot-ui-linter.js';

test('GodotUiLinter passes fully compliant Godot 4 UI scene with high score', () => {
  const tscn = `[gd_scene load_steps=2 format=3]

[node name="PauseMenu" type="Control"]
layout_mode = 3
anchors_preset = 15
anchor_right = 1.0
anchor_bottom = 1.0
grow_horizontal = 2
grow_vertical = 2

[node name="VBox" type="VBoxContainer" parent="."]
layout_mode = 2

[node name="ResumeButton" type="Button" parent="VBox"]
custom_minimum_size = Vector2(200, 50)
layout_mode = 2
text = "Resume"
`;

  const report = GodotUiLinter.lintContent(tscn, 'pause_menu.tscn');
  assert.strictEqual(report.valid, true);
  assert.strictEqual(report.nodeCount, 3);
  assert.strictEqual(report.rootNodeType, 'Control');
  assert.strictEqual(report.issues.length, 0);
  assert.strictEqual(report.score, 100);
});

test('GodotUiLinter flags non-responsive root Control without anchors', () => {
  const tscn = `[gd_scene format=3]

[node name="BadRoot" type="Control"]
offset_right = 400.0
offset_bottom = 300.0
`;

  const report = GodotUiLinter.lintContent(tscn, 'bad.tscn');
  assert.strictEqual(report.valid, true); // Warnings don't invalidate validity
  const issue = report.issues.find(i => i.rule === 'ROOT_CONTROL_RESPONSIVENESS');
  assert.ok(issue);
  assert.strictEqual(issue.severity, 'warning');
  assert.ok(report.score < 100);
});

test('GodotUiLinter flags container child with hardcoded position', () => {
  const tscn = `[gd_scene format=3]

[node name="Root" type="Control"]
anchors_preset = 15

[node name="VBox" type="VBoxContainer" parent="."]

[node name="ConflictedButton" type="Button" parent="VBox"]
position = Vector2(100, 200)
custom_minimum_size = Vector2(120, 50)
`;

  const report = GodotUiLinter.lintContent(tscn);
  const issue = report.issues.find(i => i.rule === 'CONTAINER_CHILD_CONFLICT');
  assert.ok(issue);
  assert.strictEqual(issue.nodeName, 'ConflictedButton');
});

test('GodotUiLinter warns on undersized button touch target (<44px)', () => {
  const tscn = `[gd_scene format=3]

[node name="Root" type="Control"]
anchors_preset = 15

[node name="TinyBtn" type="Button" parent="."]
text = "Tiny"
custom_minimum_size = Vector2(30, 20)
`;

  const report = GodotUiLinter.lintContent(tscn);
  const issue = report.issues.find(i => i.rule === 'TOUCH_TARGET_SIZE');
  assert.ok(issue);
  assert.strictEqual(issue.severity, 'warning');
});

test('GodotUiLinter flags manual layout_mode on container children and suggests layout_mode 2', () => {
  const tscn = `[gd_scene format=3]

[node name="Root" type="Control"]
anchors_preset = 15

[node name="Grid" type="GridContainer" parent="."]

[node name="ChildButton" type="Button" parent="Grid"]
layout_mode = 0
text = "Click Me"
custom_minimum_size = Vector2(100, 44)
`;

  const report = GodotUiLinter.lintContent(tscn);
  const issue = report.issues.find(i => i.rule === 'CONTAINER_LAYOUT_MODE');
  assert.ok(issue);
  assert.strictEqual(issue.severity, 'warning');
  assert.ok(issue.fixSuggestion.includes('layout_mode = 2'));
});

test('GodotUiLinter reports info for interactive controls lacking accessibility metadata', () => {
  const tscn = `[gd_scene format=3]

[node name="Root" type="Control"]
anchors_preset = 15

[node name="IconOnlyBtn" type="TextureButton" parent="."]
custom_minimum_size = Vector2(48, 48)
`;

  const report = GodotUiLinter.lintContent(tscn);
  const issue = report.issues.find(i => i.rule === 'ACCESSIBILITY_METADATA');
  assert.ok(issue);
  assert.strictEqual(issue.severity, 'info');
  assert.ok(issue.message.includes('lacks text, tooltip_text'));
});

test('GodotUiLinter flags dangling signal connection to missing node or script method', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ui-test-'));
  const scriptPath = path.join(tmpDir, 'test.gd');
  fs.writeFileSync(scriptPath, 'extends Control\nfunc existing_method(): pass\n');

  const tscn = `[gd_scene format=3]

[node name="Root" type="Control"]
anchors_preset = 15

[node name="Btn" type="Button" parent="."]
text = "Ok"
custom_minimum_size = Vector2(60, 50)

[connection signal="pressed" from="Btn" to="." method="missing_method"]
[connection signal="pressed" from="GhostNode" to="." method="existing_method"]
`;

  const report = GodotUiLinter.lintContent(tscn, 'test.tscn', scriptPath);
  assert.strictEqual(report.valid, false); // Errors make valid = false
  const missingMeth = report.issues.find(i => i.rule === 'SCRIPT_METHOD_MISSING');
  assert.ok(missingMeth);
  const ghost = report.issues.find(i => i.rule === 'DANGLING_SIGNAL_NODE');
  assert.ok(ghost);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
