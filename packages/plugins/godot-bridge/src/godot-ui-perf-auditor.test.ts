import { test } from 'node:test';
import * as assert from 'node:assert';
import { GodotUiPerfAuditor } from './ui/godot-ui-perf-auditor.js';

test('GodotUiPerfAuditor flags mouse_filter=0 on decorative nodes and redundant clip_contents', () => {
  const unoptimized = `[gd_scene format=3]

[node name="Root" type="Control"]
anchors_preset = 15

[node name="Bg" type="ColorRect" parent="."]
mouse_filter = 0

[node name="Container" type="VBoxContainer" parent="."]
clip_contents = true

[node name="Label" type="Label" parent="Container"]
text = "Static Title"
`;

  const report = GodotUiPerfAuditor.auditContent(unoptimized);
  assert.ok(report.score < 90);
  assert.ok(['B', 'C', 'D'].includes(report.grade));
  const mouseIssue = report.issues.find(i => i.rule === 'MOUSE_FILTER_OVERHEAD');
  assert.ok(mouseIssue);
  assert.strictEqual(mouseIssue.nodeName, 'Bg');

  const clipIssue = report.issues.find(i => i.rule === 'CLIP_CONTENTS_PENALTY');
  assert.ok(clipIssue);
  assert.strictEqual(clipIssue.nodeName, 'Container');
});

test('GodotUiPerfAuditor awards A+ score to properly optimized zero-stutter UI scene', () => {
  const optimized = `[gd_scene format=3]

[node name="Root" type="Control"]
anchors_preset = 15

[node name="Bg" type="ColorRect" parent="."]
mouse_filter = 2

[node name="VBox" type="VBoxContainer" parent="."]
mouse_filter = 2

[node name="StartBtn" type="Button" parent="VBox"]
custom_minimum_size = Vector2(200, 50)
text = "Start Game"
`;

  const report = GodotUiPerfAuditor.auditContent(optimized);
  assert.strictEqual(report.score, 100);
  assert.strictEqual(report.grade, 'A+');
  assert.strictEqual(report.issues.length, 0);
  assert.strictEqual(report.metrics.mouseFilterStopOnNonInteractive, 0);
});

test('GodotUiPerfAuditor optimizeContent injects mouse_filter=2 and strips redundant clipping', () => {
  const rawScene = `[gd_scene format=3]

[node name="Root" type="Control"]
anchors_preset = 15

[node name="Bg" type="ColorRect" parent="."]
color = Color(0, 0, 0, 1)

[node name="Panel" type="PanelContainer" parent="."]
clip_contents = true

[node name="ActionBtn" type="Button" parent="Panel"]
custom_minimum_size = Vector2(100, 44)
text = "Click"
`;

  const { optimizedContent, fixesApplied } = GodotUiPerfAuditor.optimizeContent(rawScene);
  assert.ok(fixesApplied.length >= 2);
  assert.ok(optimizedContent.includes('mouse_filter = 2'));
  assert.ok(!optimizedContent.includes('clip_contents = true'));

  const secondReport = GodotUiPerfAuditor.auditContent(optimizedContent);
  assert.strictEqual(secondReport.score, 100);
  assert.strictEqual(secondReport.grade, 'A+');
});
