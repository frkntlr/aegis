import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { UiVisualLayoutLens } from './teamwork-ui-lens.js';
import type { AnalysisInsight } from './teamwork-analysis-types.js';

test('UiVisualLayoutLens detects responsive anchor and touch target defects in Godot scenes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ui-test-'));
  try {
    const scenePath = path.join(tmpDir, 'test_menu.tscn');
    const sceneContent = [
      '[gd_scene format=3 uid="uid://test"]',
      '[node name="Menu" type="Control"]',
      'layout_mode = 3',
      '',
      '[node name="StartBtn" type="Button" parent="Menu"]',
      'text = "Play"'
    ].join('\n');
    fs.writeFileSync(scenePath, sceneContent, 'utf8');

    const res = await UiVisualLayoutLens.execute(tmpDir, ['test_menu.tscn']);
    assert.strictEqual(res.lens, 'ui');
    assert.strictEqual(res.agent, 'ui-specialist');
    assert.ok(res.insights.length >= 2);

    const presetRisk = res.insights.find((i: AnalysisInsight) => i.id.includes('ui-preset'));
    assert.ok(presetRisk, 'Should flag missing anchors_preset = 15');
    assert.strictEqual(presetRisk.severity, 'high');

    const touchDefect = res.insights.find((i: AnalysisInsight) => i.id.includes('ui-touch'));
    assert.ok(touchDefect, 'Should flag missing 44x44 minimum touch target');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('UiVisualLayoutLens detects fixed desktop widths in web UI files', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ui-web-'));
  try {
    const cssPath = path.join(tmpDir, 'dashboard.css');
    fs.writeFileSync(cssPath, '.container { width: 1200px; }', 'utf8');

    const res = await UiVisualLayoutLens.execute(tmpDir, ['dashboard.css']);
    const fixedWidthRisk = res.insights.find((i: AnalysisInsight) => i.id.includes('ui-web'));
    assert.ok(fixedWidthRisk, 'Should flag fixed desktop width');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
