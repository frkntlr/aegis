import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GodotIdeAdapter } from './godot-adapter.js';

test('GodotIdeAdapter sets up .gdignore in isolated worktree and cache folders', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-adapter-test-'));
  try {
    const experimentalDir = path.join(tmp, 'experimental');
    const aegisDir = path.join(tmp, '.aegis');
    fs.mkdirSync(experimentalDir, { recursive: true });
    fs.mkdirSync(aegisDir, { recursive: true });

    const adapter = new GodotIdeAdapter();
    const result = adapter.setupExclusions(tmp);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.ideId, 'godot');
    assert.ok(fs.existsSync(path.join(experimentalDir, '.gdignore')));
    assert.ok(fs.existsSync(path.join(aegisDir, '.gdignore')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('GodotIdeAdapter detects Godot project and configures addon in project.godot', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-detect-test-'));
  try {
    const projectGodot = path.join(tmp, 'project.godot');
    fs.writeFileSync(projectGodot, 'config_version=5\n[application]\nconfig/name="TestGame"\n', 'utf8');

    const adapter = new GodotIdeAdapter();
    const detected = adapter.detectProject(tmp);
    assert.strictEqual(detected.isGodot, true);
    assert.strictEqual(detected.projectGodotPath, projectGodot);

    const exclusions = adapter.setupExclusions(tmp);
    assert.strictEqual(exclusions.success, true);
    assert.ok(fs.existsSync(path.join(tmp, 'addons', 'aegis_bridge')));

    const updated = fs.readFileSync(projectGodot, 'utf8');
    assert.ok(updated.includes('aegis_bridge'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
