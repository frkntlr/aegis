import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GodotTestRunner } from './godot-test-runner.js';
import { GodotLocator } from './godot-locator.js';
import { GodotProcessWatchdog } from './godot-process-watchdog.js';

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

test('playtest rejects script errors and nonzero orphan deltas even when the runtime exits zero', async t => {
  t.mock.method(GodotLocator, 'findGodot', () => ({ binaryPath: 'fixture-godot', majorVersion: 4,
    versionString: '4.x', isHeadlessCapable: true }));
  const outputs = [
    { stdout: '', stderr: 'SCRIPT ERROR: null instance' },
    { stdout: 'SCRIPT ERROR: invalid call', stderr: '' },
    { stdout: 'ORPHAN_NODES_DELTA: 2', stderr: '' },
    { stdout: 'ORPHAN_NODES_DELTA: -1', stderr: '' },
    { stdout: 'ORPHAN_NODES_DELTA: 0', stderr: '' }
  ];
  for (const [index, output] of outputs.entries()) {
    const stub = t.mock.method(GodotProcessWatchdog, 'executeWithWatchdog', async () => ({
      ...output, exitCode: 0, timedOut: false
    }));
    const result = await GodotTestRunner.runPlaytestScenario(process.cwd());
    assert.strictEqual(result.passed, index === outputs.length - 1);
    stub.mock.restore();
  }
});
