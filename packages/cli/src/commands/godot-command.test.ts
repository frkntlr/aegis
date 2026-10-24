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

test('handleGodotInspect respects mobile aspect ratios in aegis.config.json', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-mobile-inspect-'));
  try {
    const configPath = path.join(tmp, 'aegis.config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      engine: 'godot',
      godot: {
        aspectRatios: ['9:16', '9:18', '9:20']
      }
    }), 'utf8');

    const out = await captureOutput(() => handleGodotInspect(tmp));
    assert.ok(out.includes('Checking 3 target aspect ratios'));
    assert.ok(out.includes('Aspect [9:16] (1080x1920)'));
    assert.ok(out.includes('Aspect [9:18] (1080x2160)'));
    assert.ok(out.includes('Aspect [9:20] (1080x2400)'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('handleGodotInspect loads cached telemetry and flags overlapping UI controls', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-overlap-inspect-'));
  try {
    const aegisDir = path.join(tmp, '.aegis');
    fs.mkdirSync(aegisDir, { recursive: true });
    const telemetryPath = path.join(aegisDir, 'ui_telemetry.json');
    fs.writeFileSync(telemetryPath, JSON.stringify({
      nodes: [
        { id: '/root/Main/ButtonA', name: 'ButtonA', type: 'Button', visible: true, rect: { x: 50, y: 50, width: 200, height: 60 } },
        { id: '/root/Main/ButtonB', name: 'ButtonB', type: 'Button', visible: true, rect: { x: 100, y: 70, width: 200, height: 60 } }
      ]
    }), 'utf8');

    const out = await captureOutput(() => handleGodotInspect(tmp));
    assert.ok(out.includes('Loaded 2 UI nodes from telemetry cache'));
    assert.ok(out.includes('FAIL (overlaps/clippings)'));
    assert.ok(out.includes('Overlap: "/root/Main/ButtonA" and "/root/Main/ButtonB"'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
