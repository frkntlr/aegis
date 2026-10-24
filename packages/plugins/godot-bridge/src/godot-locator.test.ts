import { test } from 'node:test';
import * as assert from 'node:assert';
import { GodotLocator } from './godot-locator.js';

test('GodotLocator inspects non-existent path gracefully', () => {
  const result = GodotLocator.findGodot('C:\\non_existent_path\\godot.exe');
  // Should either find the installed Godot on the system or return null without throwing
  if (result) {
    assert.ok(result.majorVersion >= 3);
    assert.ok(typeof result.versionString === 'string');
  } else {
    assert.strictEqual(result, null);
  }
});

test('GodotLocator correctly identifies installed Godot version if present', () => {
  const info = GodotLocator.findGodot();
  if (info) {
    assert.ok(info.binaryPath.length > 0);
    assert.strictEqual(info.majorVersion, 4);
    assert.ok(info.versionString.includes('4.'));
  }
});
