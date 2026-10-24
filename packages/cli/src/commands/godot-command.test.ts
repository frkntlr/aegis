import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  handleGodotStatus,
  handleGodotInspect,
  handleGodotQuery,
  handleGodotValidate,
  handleGodot
} from './godot-command.js';

function captureOutput(fn: () => void | Promise<void>): Promise<string> {
  const originalLog = console.log;
  const originalErr = console.error;
  let logs = '';
  console.log = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  console.error = (...args: unknown[]) => { logs += args.join(' ') + '\n'; };
  return Promise.resolve()
    .then(() => fn())
    .then(() => logs)
    .finally(() => {
      console.log = originalLog;
      console.error = originalErr;
    });
}

test('handleGodotStatus and handleGodotInspect output expected telemetry', async () => {
  const statusOut = await captureOutput(() => handleGodotStatus());
  assert.ok(statusOut.includes('Inspecting Godot environment'));

  const inspectOut = await captureOutput(() => handleGodotInspect());
  assert.ok(inspectOut.includes('Running Zero-Token UI Telemetry'));
  assert.ok(inspectOut.includes('UI Telemetry Verification complete'));
});

test('handleGodotQuery outputs class details or search suggestions', async () => {
  const queryOut = await captureOutput(() => handleGodotQuery('Node'));
  assert.ok(queryOut.includes('Class: Node'));
  assert.ok(queryOut.includes('Methods'));

  const missingOut = await captureOutput(() => handleGodotQuery('NonExistentXyz'));
  assert.ok(missingOut.includes('not found in ClassDB'));
});

test('handleGodotValidate verifies clean GDScript files without errors', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-validate-test-'));
  try {
    const validScript = path.join(tmp, 'player.gd');
    fs.writeFileSync(validScript, 'extends Node\nfunc _ready():\n\tself.queue_free()\n', 'utf8');

    const out = await captureOutput(() => handleGodotValidate(tmp));
    assert.ok(out.includes('100% CLEAN'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('handleGodot dispatches subcommands properly', async () => {
  const out = await captureOutput(() => handleGodot(['unknown_subcmd']));
  assert.ok(out.includes('Unknown godot subcommand'));
});
