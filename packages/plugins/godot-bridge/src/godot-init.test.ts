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
