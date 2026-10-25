import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Context7Bridge } from './context7-bridge.js';

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
