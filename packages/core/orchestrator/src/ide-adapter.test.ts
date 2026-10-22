import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { IdeAdapterRegistry, VSCodeAdapter, CursorAdapter, type IdeAdapter } from './ide-adapter.js';

test('IdeAdapterRegistry lists default adapters and registers community adapters', () => {
  const registry = new IdeAdapterRegistry();
  assert.ok(registry.listAdapters().includes('vscode'));
  assert.ok(registry.listAdapters().includes('cursor'));

  const mockZed: IdeAdapter = {
    ideId: 'zed',
    name: 'Zed Editor',
    setupExclusions: (root) => ({ ideId: 'zed', success: true, configuredFiles: [path.join(root, '.zed')] })
  };
  registry.register(mockZed);

  assert.strictEqual(registry.getAdapter('zed')?.name, 'Zed Editor');
  assert.ok(registry.listAdapters().includes('zed'));
});

test('VSCodeAdapter and CursorAdapter configure isolation settings properly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-ide-test-'));
  try {
    const vsAdapter = new VSCodeAdapter();
    const vsRes = vsAdapter.setupExclusions(tmpDir);
    assert.strictEqual(vsRes.success, true);

    const vsSettings = JSON.parse(fs.readFileSync(vsRes.configuredFiles[0], 'utf8'));
    assert.strictEqual(vsSettings['files.exclude']['experimental/**'], true);

    const cursorAdapter = new CursorAdapter();
    const cursorRes = cursorAdapter.setupExclusions(tmpDir);
    assert.strictEqual(cursorRes.success, true);
    assert.strictEqual(cursorRes.configuredFiles.length, 2);

    const cursorRules = fs.readFileSync(path.join(tmpDir, '.cursorrules'), 'utf8');
    assert.ok(cursorRules.includes('experimental/**'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
