import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GodotUiScaffolder } from './ui/godot-ui-scaffolder.js';
import { GodotUiLinter } from './ui/godot-ui-linter.js';

test('GodotUiScaffolder generates compliant menu UI scene and GDScript controller', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-scaffold-menu-'));
  const res = GodotUiScaffolder.scaffold('menu', { name: 'main_menu', outputDir: tmpDir, title: 'My Epic Game' });

  assert.strictEqual(res.type, 'menu');
  assert.strictEqual(res.name, 'main_menu');
  assert.strictEqual(res.filesWritten.length, 2);
  assert.ok(fs.existsSync(res.scenePath!));
  assert.ok(fs.existsSync(res.scriptPath!));

  const tscnContent = fs.readFileSync(res.scenePath!, 'utf8');
  assert.ok(tscnContent.includes('anchors_preset = 15'));
  assert.ok(tscnContent.includes('StartButton'));

  const scriptContent = fs.readFileSync(res.scriptPath!, 'utf8');
  assert.ok(scriptContent.includes('signal start_pressed'));
  assert.ok(scriptContent.includes('class_name MainMenu'));

  // Verify that the generated scene passes the UI linter with 100 score!
  const lint = GodotUiLinter.lintScene(res.scenePath!, res.scriptPath!);
  assert.strictEqual(lint.valid, true);
  assert.strictEqual(lint.score, 100);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GodotUiScaffolder generates responsive HUD and Dialog', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-scaffold-hud-'));
  const hudRes = GodotUiScaffolder.scaffold('hud', { name: 'game_hud', outputDir: tmpDir });
  assert.ok(fs.existsSync(hudRes.scenePath!));
  assert.ok(fs.existsSync(hudRes.scriptPath!));

  const dialogRes = GodotUiScaffolder.scaffold('dialog', { name: 'confirm_box', outputDir: tmpDir, title: 'Delete Save?' });
  assert.ok(fs.existsSync(dialogRes.scenePath!));
  assert.ok(fs.existsSync(dialogRes.scriptPath!));

  const themeRes = GodotUiScaffolder.scaffold('theme', { name: 'dark_theme', outputDir: tmpDir });
  assert.ok(fs.existsSync(themeRes.themePath!));

  const themeContent = fs.readFileSync(themeRes.themePath!, 'utf8');
  assert.ok(themeContent.includes('StyleBoxFlat'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
