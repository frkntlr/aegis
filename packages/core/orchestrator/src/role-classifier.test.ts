import { test } from 'node:test';
import * as assert from 'node:assert';
import { RoleClassifier } from './role-classifier.js';

test('RoleClassifier identifies solver role from bug labels and code files', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Fix null pointer error in compiler',
    labels: ['bug', 'high-priority'],
    targetFiles: ['src/compiler.ts', 'src/lexer.ts']
  });

  assert.strictEqual(res.role, 'solver');
  assert.ok(res.confidence >= 60);
  assert.strictEqual(res.isAmbiguous, false);
  assert.ok(res.reason.includes('Kod Çözümü'));
});

test('RoleClassifier identifies qa role from test files and qa labels', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Inspect layout overflow on mobile viewport',
    labels: ['qa'],
    targetFiles: ['src/Header.test.ts', 'scenes/Main.tscn']
  });

  assert.strictEqual(res.role, 'qa');
  assert.ok(res.confidence >= 60);
  assert.strictEqual(res.isAmbiguous, false);
  assert.ok(res.reason.includes('Test & Denetim'));
});

test('RoleClassifier identifies ui role from theme labels, tres files and styling semantics', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Arayüz buton teması ve font boyutu güncellemesi',
    labels: ['role:ui', 'theme'],
    targetFiles: ['assets/main_theme.tres', 'scenes/styles/button.theme']
  });

  assert.strictEqual(res.role, 'ui');
  assert.ok(res.confidence >= 60);
  assert.strictEqual(res.isAmbiguous, false);
  assert.ok(res.reason.includes('UI & Tema'));
});

test('RoleClassifier identifies docs role from markdown files and doc keywords', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Update Living Architecture Guide',
    labels: ['docs'],
    targetFiles: ['wiki/Architecture.md', 'docs/README.md']
  });

  assert.strictEqual(res.role, 'docs');
  assert.ok(res.confidence >= 60);
  assert.strictEqual(res.isAmbiguous, false);
  assert.ok(res.reason.includes('Dokümantasyon'));
});

test('RoleClassifier flags low confidence when signals are empty or ambiguous', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Misc cleanup',
    labels: [],
    targetFiles: []
  });

  assert.strictEqual(res.isAmbiguous, true);
  assert.ok(res.confidence < 60);
});

test('RoleClassifier normalizes Windows path separators in target files', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Update Living Architecture Guide',
    labels: ['docs'],
    targetFiles: ['wiki\\Architecture.md', 'docs\\README.md']
  });

  assert.strictEqual(res.role, 'docs');
  assert.ok(res.confidence >= 60);
});

test('RoleClassifier identifies qa role from telemetry and playtest semantics', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Run zero-token telemetry verification and playtest on mobile aspect ratio',
    labels: ['qa'],
    targetFiles: []
  });

  assert.strictEqual(res.role, 'qa');
  assert.ok(res.confidence >= 60);
});

test('RoleClassifier.isUiFile correctly detects Godot UI scenes, themes, and UI controllers', () => {
  assert.strictEqual(RoleClassifier.isUiFile('res://scenes/ui/pause_menu.tscn'), true);
  assert.strictEqual(RoleClassifier.isUiFile('ui/hud.gd'), true);
  assert.strictEqual(RoleClassifier.isUiFile('assets/theme.tres'), true);
  assert.strictEqual(RoleClassifier.isUiFile('scenes/settings_dialog.tscn'), true);
  assert.strictEqual(RoleClassifier.isUiFile('src/player_movement.gd'), false);
  assert.strictEqual(RoleClassifier.isUiFile('scenes/dungeon_level.tscn'), false);
});

test('RoleClassifier classifies Godot menu / HUD scene tasks as ui role with high confidence', () => {
  const classifier = new RoleClassifier();
  const res = classifier.classify({
    title: 'Create pause menu UI with buttons and health bar HUD in Godot',
    targetFiles: ['res://scenes/ui/pause_menu.tscn', 'res://ui/hud.gd']
  });

  assert.strictEqual(res.role, 'ui');
  assert.ok(res.confidence >= 60);
  assert.strictEqual(res.isAmbiguous, false);
});
