import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GodotInitWorkflow } from './godot-init.js';

test('GodotInitWorkflow initializes addon files and aegis.config.json in target directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-test-'));

  try {
    const res = GodotInitWorkflow.initProject({
      projectDir: tmpDir,
      bridgePort: 6852
    });

    assert.strictEqual(res.success, true);
    assert.ok(fs.existsSync(path.join(tmpDir, 'project.godot')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'aegis.config.json')));

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'aegis.config.json'), 'utf8'));
    assert.strictEqual(config.engine, 'godot');
    assert.strictEqual(config.godot.bridgePort, 6852);
    assert.deepStrictEqual(config.godot.aspectRatios, ['16:9', '21:9', '16:10', '9:16']);

    const projectGodot = fs.readFileSync(path.join(tmpDir, 'project.godot'), 'utf8');
    assert.ok(projectGodot.includes('res://addons/aegis_bridge/plugin.cfg'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GodotInitWorkflow merges into existing editor_plugins without creating duplicate keys', () => {
  const existing = '[editor_plugins]\n\nenabled=PackedStringArray("res://addons/custom_tool/plugin.cfg")\n';
  const merged = GodotInitWorkflow.mergePluginIntoConfig(existing);
  assert.ok(merged.includes('res://addons/custom_tool/plugin.cfg'));
  assert.ok(merged.includes('res://addons/aegis_bridge/plugin.cfg'));
  assert.strictEqual((merged.match(/enabled=/g) || []).length, 1);
  assert.strictEqual((merged.match(/\[editor_plugins\]/g) || []).length, 1);
});

test('GodotInitWorkflow preserves custom aspect ratios configured in existing aegis.config.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-ratios-'));
  try {
    const customConfig = {
      engine: 'godot',
      godot: {
        bridgePort: 7000,
        aspectRatios: ['9:16', '9:19.5', '3:4']
      }
    };
    fs.writeFileSync(path.join(tmpDir, 'aegis.config.json'), JSON.stringify(customConfig), 'utf8');

    GodotInitWorkflow.initProject({ projectDir: tmpDir, bridgePort: 7001 });

    const updated = JSON.parse(fs.readFileSync(path.join(tmpDir, 'aegis.config.json'), 'utf8'));
    assert.strictEqual(updated.godot.bridgePort, 7001);
    assert.deepStrictEqual(updated.godot.aspectRatios, ['9:16', '9:19.5', '3:4']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
