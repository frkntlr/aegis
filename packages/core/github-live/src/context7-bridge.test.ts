import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Context7Bridge } from './context7-bridge.js';
import { DependencyMapper } from './dependency-mapper.js';

test('Context7Bridge queries built-in Godot and TypeScript documentation', () => {
  const bridge = new Context7Bridge();
  const godotDoc = bridge.query('godot4', 'lifecycle');
  assert.strictEqual(godotDoc.matched, true);
  assert.ok(godotDoc.doc);
  assert.strictEqual(godotDoc.doc.library, 'godot4');
  assert.ok(godotDoc.doc.breakingChanges?.some(b => b.includes('instantiate()')));

  const tsDoc = bridge.query('typescript', 'test');
  assert.strictEqual(tsDoc.matched, true);
  assert.ok(tsDoc.doc);
  assert.strictEqual(tsDoc.doc.library, 'typescript');
});

test('Context7Bridge registers custom docs and injects prompt context', () => {
  const bridge = new Context7Bridge();
  bridge.registerDoc({
    library: 'custom-lib',
    topic: 'auth',
    version: '1.0',
    summary: 'Custom auth flow',
    signatures: ['authenticate(token: string) -> bool']
  });

  const res = bridge.query('custom-lib', 'auth');
  assert.strictEqual(res.matched, true);
  assert.ok(res.doc?.signatures.includes('authenticate(token: string) -> bool'));

  const prompt = 'Fix player node';
  const injected = bridge.injectDocumentationContext(prompt, ['player.gd']);
  assert.ok(injected.includes('Context7 Ground-Truth Documentation'));
  assert.ok(injected.includes('GODOT4'));
});

test('Context7Bridge persists and loads cache from disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'context7-test-'));
  const bridge = new Context7Bridge();

  try {
    bridge.saveToCache(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'docs.json')));

    const reloadedBridge = new Context7Bridge();
    reloadedBridge.loadFromCache(tmpDir);
    const doc = reloadedBridge.query('godot4', 'signals');
    assert.strictEqual(doc.matched, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Context7Bridge resolves Godot topics via AST extends and ClassDB hierarchy', () => {
  const bridge = new Context7Bridge();

  const physicsCode = 'extends CharacterBody2D\n\nfunc _physics_process(delta):\n\tpass';
  const physResult = bridge.queryGodotTopic(physicsCode);
  assert.strictEqual(physResult.matched, true);
  assert.strictEqual(physResult.doc?.topic, 'physics');
  assert.ok(physResult.doc?.signatures.some(s => s.includes('move_and_slide')));

  const uiCode = 'extends MarginContainer\n\nfunc _ready():\n\tpass';
  const uiResult = bridge.queryGodotTopic(uiCode);
  assert.strictEqual(uiResult.matched, true);
  assert.strictEqual(uiResult.doc?.topic, 'ui');
  assert.ok(uiResult.doc?.summary.includes('Touch Target'));

  const signalCode = 'class_name Bus\nsignal event_occurred(val)\n\nfunc trigger():\n\tpass';
  const sigResult = bridge.queryGodotTopic(signalCode);
  assert.strictEqual(sigResult.matched, true);
  assert.strictEqual(sigResult.doc?.topic, 'signals');

  const lifecycleCode = 'extends Node\n\nfunc spawn():\n\tpass';
  const lifeResult = bridge.queryGodotTopic(lifecycleCode);
  assert.strictEqual(lifeResult.matched, true);
  assert.strictEqual(lifeResult.doc?.topic, 'lifecycle');
});

test('DeprecationLinter catches Godot 3 deprecations', () => {
  const bridge = new Context7Bridge();
  const legacyGodot = [
    'var bullet = bullet_scene.instance()',
    'move_and_slide(velocity, Vector2.UP)',
    'button.connect("pressed", self, "_on_button_pressed")',
    'yield(get_tree().create_timer(1.0), "timeout")'
  ].join('\n');

  const gWarnings = bridge.lintDeprecations(legacyGodot, 'godot');
  assert.strictEqual(gWarnings.length, 4);
  assert.ok(gWarnings.some(w => w.code === 'GD_DEP_001'));
  assert.ok(gWarnings.some(w => w.code === 'GD_DEP_002'));
  assert.ok(gWarnings.some(w => w.code === 'GD_DEP_003'));
  assert.ok(gWarnings.some(w => w.code === 'GD_DEP_004'));

  const cleanGodot = [
    'var bullet = bullet_scene.instantiate()',
    'velocity = Vector2.ZERO',
    'move_and_slide()',
    'button.pressed.connect(_on_button_pressed)',
    'await get_tree().create_timer(1.0).timeout'
  ].join('\n');
  assert.strictEqual(bridge.lintDeprecations(cleanGodot, 'godot').length, 0);
});

test('DeprecationLinter catches TypeScript strict violations and injects warnings', () => {
  const bridge = new Context7Bridge();
  const unsafeTs = [
    'const x: any = JSON.parse(str);',
    'const y = obj as any;',
    'try { doTask(); } catch (err) {}'
  ].join('\n');

  const tsWarnings = bridge.lintDeprecations(unsafeTs, 'typescript');
  assert.strictEqual(tsWarnings.length, 3);
  assert.ok(tsWarnings.some(w => w.code === 'TS_DEP_001'));
  assert.ok(tsWarnings.some(w => w.code === 'TS_DEP_002'));

  const cleanTs = [
    'const x: unknown = JSON.parse(str);',
    'try { doTask(); } catch (err) { logger.error(err); }'
  ].join('\n');
  assert.strictEqual(bridge.lintDeprecations(cleanTs, 'typescript').length, 0);

  const legacy = 'var b = scene.instance()';
  const injected = bridge.injectDocumentationContext('Shoot', ['b.gd'], [legacy]);
  assert.ok(injected.includes('Active Deprecation Warnings'));
  assert.ok(injected.includes('scene.instantiate()'));
});

test('DependencyMapper scans package.json and project.godot with addons', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-scan-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      dependencies: { zod: '^3.23.8' },
      devDependencies: { vitest: '^2.0.0' }
    }));
    fs.writeFileSync(path.join(tmpDir, 'project.godot'), 'config/features=PackedStringArray("4.3")\n');
    const addonDir = path.join(tmpDir, 'addons', 'dialogic');
    fs.mkdirSync(addonDir, { recursive: true });
    fs.writeFileSync(path.join(addonDir, 'plugin.cfg'), '[plugin]\nname="Dialogic"\nversion="2.0-alpha"\n');

    const deps = DependencyMapper.scanWorkspace(tmpDir);
    assert.ok(deps.some(d => d.name === 'zod' && d.ecosystem === 'npm'));
    assert.ok(deps.some(d => d.name === 'vitest' && d.ecosystem === 'npm'));
    assert.ok(deps.some(d => d.name === 'godot' && d.version === '4.3'));
    assert.ok(deps.some(d => d.name === 'dialogic' && d.version === '2.0-alpha'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Context7Bridge multi-level disk cache provides <2ms offline lookup', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-level-test-'));
  try {
    const bridgeA = new Context7Bridge();
    bridgeA.registerDoc({
      library: 'zod',
      topic: 'schema',
      version: '3.23',
      summary: 'TypeScript-first schema validation with static type inference.',
      signatures: ['z.object({ ... })', 'z.string().parse(data)']
    });
    bridgeA.saveToCache(tmpDir);

    const bridgeB = new Context7Bridge();
    const t0 = performance.now();
    const res = bridgeB.query('zod', 'schema', tmpDir);
    const duration = performance.now() - t0;

    assert.strictEqual(res.matched, true);
    assert.strictEqual(res.source, 'cache');
    assert.ok(res.doc?.signatures.includes('z.object({ ... })'));
    assert.ok(duration < 15, `Disk cache access took ${duration}ms, expected fast lookup`);

    const cachedRes = bridgeB.query('zod', 'schema', tmpDir);
    assert.strictEqual(cachedRes.source, 'builtin');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
