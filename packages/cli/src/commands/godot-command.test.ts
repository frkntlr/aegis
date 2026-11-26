import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GodotLocator } from '@aegis/godot-bridge';
import {
  handleGodotInit,
  handleGodotStatus,
  handleGodotInspect,
  handleGodotQuery,
  handleGodotValidate,
  handleGodotPlaytest,
  handleGodotUi,
  handleGodotTree,
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

test('handleGodotStatus reports environment and missing telemetry cannot pass verification', async () => {
  const statusOut = await captureOutput(() => handleGodotStatus());
  assert.ok(statusOut.includes('Inspecting Godot environment'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-empty-inspect-'));
  const previous = process.exitCode;
  try {
    for (const content of [undefined, '{invalid', '{"nodes":[]}']) {
      if (content !== undefined) {
        fs.mkdirSync(path.join(tmp, '.aegis'), { recursive: true });
        fs.writeFileSync(path.join(tmp, '.aegis/ui_telemetry.json'), content);
      }
      const out = await captureOutput(() => handleGodotInspect(tmp));
      assert.ok(out.includes('Verification unavailable'));
      assert.ok(!out.includes('PASS') && !out.includes('All aspect ratios valid'));
      assert.strictEqual(process.exitCode, 1);
    }
  } finally {
    process.exitCode = previous;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
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
  const prevCwd = process.cwd(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-unknown-'));
  try {
    process.chdir(tmp);
    const out = await captureOutput(() => handleGodot(['unknown_subcmd']));
    assert.ok(out.includes('Unknown godot subcommand'));
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('handleGodotInspect respects mobile aspect ratios in aegis.config.json', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-mobile-inspect-'));
  const previous = process.exitCode;
  try {
    process.exitCode = 0;
    const configPath = path.join(tmp, 'aegis.config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      engine: 'godot',
      godot: {
        aspectRatios: ['9:16', '9:18', '9:20']
      }
    }), 'utf8');
    fs.mkdirSync(path.join(tmp, '.aegis'));
    fs.writeFileSync(path.join(tmp, '.aegis/ui_telemetry.json'), JSON.stringify({ nodes: [
      { id: '/root/Button', name: 'Button', type: 'Button', visible: true,
        rect: { x: 10, y: 10, width: 100, height: 60 } }
    ] }));

    const out = await captureOutput(() => handleGodotInspect(tmp));
    assert.ok(out.includes('Checking 3 target aspect ratios'));
    assert.ok(out.includes('Aspect [9:16] (1080x1920)'));
    assert.ok(out.includes('Aspect [9:18] (1080x2160)'));
    assert.ok(out.includes('Aspect [9:20] (1080x2400)'));
    assert.strictEqual(process.exitCode, 0);
  } finally {
    process.exitCode = previous;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('handleGodotInspect loads cached telemetry and flags overlapping UI controls', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-overlap-inspect-'));
  const previous = process.exitCode;
  try {
    process.exitCode = 0;
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
    assert.strictEqual(process.exitCode, 1);
  } finally {
    process.exitCode = previous;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('handleGodotPlaytest queues scenario actions from file and default smoke scenario', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-playtest-test-'));
  try {
    const scenarioFile = path.join(tmp, 'playtest.json');
    fs.writeFileSync(scenarioFile, JSON.stringify([
      { type: 'click_node', path: '/root/Game/Button' },
      { type: 'wait', duration: 0.5 }
    ]), 'utf8');

    const fileOut = await captureOutput(() => handleGodotPlaytest(scenarioFile));
    assert.ok(fileOut.includes('Scenario loaded from: playtest.json'));
    assert.ok(fileOut.includes('Queued playtest scenario'));
    assert.ok(fileOut.includes('with 2 action(s)'));

    const defaultOut = await captureOutput(() => handleGodotPlaytest('nonexistent-path.json'));
    assert.ok(defaultOut.includes('default smoke playtest scenario'));
    assert.ok(defaultOut.includes('with 3 action(s)'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('godot-helpers parses telemetry nodes and validates scripts safely', async () => {
  const { loadProjectTelemetryNodes, resolveInspectAspectRatios } = await import('./godot-helpers.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-helpers-test-'));
  try {
    const defaultRatios = resolveInspectAspectRatios(tmp);
    assert.ok(defaultRatios.length >= 3);

    const emptyNodes = loadProjectTelemetryNodes(tmp);
    assert.strictEqual(emptyNodes.length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('handleGodot dispatches run, init, ui:perf, ui:optimize, inspect, and tree subcommands', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-dispatch-'));
  const prevExit = process.exitCode, prevCwd = process.cwd();
  try {
    process.chdir(tmp);
    t.mock.method(GodotLocator, 'findGodot', () => null);
    const runOut = await captureOutput(() => handleGodot(['run', 'nonexistent_project_path', '--headless', '--quit-after', '5']));
    assert.ok(runOut.includes('Executing Godot project at: nonexistent_project_path'));
    assert.ok((await captureOutput(() => handleGodot(['init', tmp, '6855']))).includes('Bridge Port: 6855'));
    assert.ok((await captureOutput(() => handleGodotInit(tmp))).includes('Bridge Port: 6850'));
    process.exitCode = 0;
    const inspOut = await captureOutput(() => handleGodot(['inspect', tmp]));
    assert.ok(inspOut.includes('Verification unavailable'));
    assert.strictEqual(process.exitCode, 1);
    const perfOut = await captureOutput(() => handleGodotUi('perf', tmp));
    assert.ok(perfOut.includes('UI Performance') || perfOut.includes('Godot'));
    const optOut = await captureOutput(() => handleGodotUi('optimize', tmp));
    assert.ok(optOut.includes('Usage: aegis godot ui:optimize'));
    const badGd = path.join(tmp, 'bad.gd');
    fs.writeFileSync(badGd, 'extends Node\nfunc _ready():\n\tself.totally_nonexistent_godot_method_xyz()\n', 'utf8');
    const valOut = await captureOutput(() => handleGodotValidate(tmp));
    assert.ok(valOut.includes('validation issue') || valOut.includes('100% CLEAN'));
  } finally {
    process.chdir(prevCwd);
    process.exitCode = prevExit;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('handleGodotUi scaffolds UI scenes and lints Godot UI scenes cleanly', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-ui-cli-test-'));
  const prevCwd = process.cwd();
  try {
    process.chdir(tmp);
    assert.ok((await captureOutput(() => handleGodotUi('scaffold', 'dialog', 'confirm_box', tmp))).includes('Godot UI Scaffolding Complete: [DIALOG] "confirm_box"'));
    assert.ok((await captureOutput(() => handleGodot(['ui', 'scaffold', 'menu', 'pause_menu', tmp]))).includes('Godot UI Scaffolding Complete: [MENU] "pause_menu"'));
    const sceneFile = path.join(tmp, 'pause_menu.tscn');
    assert.ok(fs.existsSync(sceneFile));
    const lintOut = await captureOutput(() => handleGodot(['ui', sceneFile]));
    assert.ok(lintOut.includes('Godot UI Scene Linter Report') && lintOut.includes('Score: 100/100'));
    assert.ok((await captureOutput(() => handleGodotUi('lint'))).includes('Usage: aegis godot ui:lint <scene.tscn>'));
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

function createSampleScene(dir: string): string {
  const sceneFile = path.join(dir, 'hud.tscn');
  fs.writeFileSync(sceneFile, `[gd_scene load_steps=2 format=3]\n[node name="Hud" type="MarginContainer"]\nanchors_preset = 15\n[node name="VBox" type="VBoxContainer" parent="."]\n[node name="StartButton" type="Button" parent="VBox"]\nunique_name_in_owner = true\ncustom_minimum_size = Vector2(100, 50)\n[node name="QuitButton" type="Button" parent="VBox"]\n[node name="Label" type="Label" parent="."]\n`, 'utf8');
  return sceneFile;
}

test('handleGodotTree slices full scenes, respects --depth/--focus/--compact, and handles missing files', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-tree-test-'));
  try {
    const sceneFile = createSampleScene(tmp);
    const fullOut = await captureOutput(() => handleGodotTree(sceneFile));
    assert.ok(fullOut.includes('Hud [MarginContainer]') && fullOut.includes('%StartButton [Button]') && fullOut.includes('QuitButton [Button]'));
    const depthOut = await captureOutput(() => handleGodot(['tree', sceneFile, '--depth=1']));
    assert.ok(depthOut.includes('Max Depth: 1') && depthOut.includes('VBox [VBoxContainer]') && !depthOut.includes('%StartButton'));
    const focusOut = await captureOutput(() => handleGodotTree(sceneFile, '--focus=%StartButton'));
    assert.ok(focusOut.includes('Focus: %StartButton') && focusOut.includes('%StartButton [Button]') && !focusOut.includes('QuitButton'));
    const compactOut = await captureOutput(() => handleGodotTree(sceneFile, '--compact'));
    assert.ok(compactOut.includes('Mode: Compact') && !compactOut.includes('└──'));
    assert.ok((await captureOutput(() => handleGodotTree())).includes('Usage: aegis godot tree <scene.tscn>'));
    assert.ok((await captureOutput(() => handleGodotTree('non_existent_scene.tscn'))).includes('Scene file not found: non_existent_scene.tscn'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('handleGodotPlaytest integrates GodotPortRouter ephemeral track port allocation', async () => {
  const out = await captureOutput(() => handleGodotPlaytest(undefined, '--track=qa-hunter'));
  assert.ok(out.includes('Track Port Isolation: [qa-hunter] -> Port: 6852, Debug: 6202') && out.includes('aegis-godot-qa-hunter'));
});

test('handleGodotStatus reads aegis.config.json and handleGodot dispatches query/validate/status', async t => {
  const prevCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-godot-cfg-'));
  try {
    t.mock.method(GodotLocator, 'findGodot', () => ({ binaryPath: '/usr/bin/godot', versionString: '4.7.2', majorVersion: 4, isHeadlessCapable: true }));
    process.chdir(tmp);
    fs.writeFileSync(path.join(tmp, 'aegis.config.json'), JSON.stringify({ godot: { bridgePort: 7777, aspectRatios: ['16:9'] } }), 'utf8');
    const stOut = await captureOutput(() => handleGodot(['status']));
    assert.ok(stOut.includes('Godot Detected: 4.7.2') && stOut.includes('Bridge Port: 7777') && stOut.includes('16:9'));
    assert.ok((await captureOutput(() => handleGodot(['query']))).includes('Usage: aegis godot query'));
    assert.ok((await captureOutput(() => handleGodot(['validate', tmp]))).includes('100% CLEAN'));
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
