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
