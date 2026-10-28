import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GodotTestRunner } from './godot-test-runner.js';
import { GodotLocator } from './godot-locator.js';

test('GodotTestRunner checkSyntax returns valid for clean script or flags syntax error', async () => {
  const install = GodotLocator.findGodot();
  if (!install) return; // Skip if Godot binary not locally detected in test environment

  const tempClean = path.join(process.cwd(), 'temp_clean_script.gd');
  fs.writeFileSync(tempClean, 'extends RefCounted\nfunc get_val() -> int:\n\treturn 42\n', 'utf8');

  const cleanRes = await GodotTestRunner.checkSyntax(tempClean);
  fs.unlinkSync(tempClean);
  assert.strictEqual(cleanRes.valid, true);

  const tempBad = path.join(process.cwd(), 'temp_bad_script.gd');
  fs.writeFileSync(tempBad, 'invalid syntax ::: 123', 'utf8');

  const badRes = await GodotTestRunner.checkSyntax(tempBad);
  fs.unlinkSync(tempBad);
  assert.strictEqual(badRes.valid, false);
  assert.ok(badRes.error);
});
