/**
 * @file multi-language-metadata-manager.test.ts
 * Tests for MultiLanguageMetadataManager ecosystem tracking, isolated invalidation, and lock check.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MultiLanguageMetadataManager } from './multi-language-metadata-manager.js';

test('computeEcosystemHash computes hash accurately from mock files', () => {
  const mockFiles: Record<string, string> = {
    'package.json': '{"name": "my-app"}',
    'package-lock.json': '{"lockfileVersion": 3}'
  };

  const manager = new MultiLanguageMetadataManager({
    projectRoot: 'C:/mock/project',
    fileReader: (p) => {
      const rel = path.basename(p);
      return mockFiles[rel] ?? null;
    }
  });

  const hash = manager.computeEcosystemHash('npm');
  assert.ok(hash);
  assert.notStrictEqual(hash, 'empty');
  assert.strictEqual(typeof hash, 'string');
});

test('checkEcosystemDrift identifies changed ecosystems and updates ledger', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-meta-drift-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const manager = new MultiLanguageMetadataManager({
    projectRoot: tempDir,
    cacheDir: path.join(tempDir, '.cache')
  });

  try {
    // 1. Initial drift check (all empty or new)
    const res1 = manager.checkEcosystemDrift();
    assert.ok(res1.drifted.includes('npm'));
    assert.ok(res1.drifted.includes('godot'));
    manager.saveLockLedger(res1.ledger);

    // 2. Re-check without any file changes -> 0 drifted
    const res2 = manager.checkEcosystemDrift();
    assert.strictEqual(res2.drifted.length, 0);

    // 3. Create a Godot file -> only godot drifts
    fs.writeFileSync(path.join(tempDir, 'project.godot'), 'config_version=5');
    const res3 = manager.checkEcosystemDrift();
    assert.deepStrictEqual(res3.drifted, ['godot']);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('invalidateEcosystemCache deletes only specific ecosystem directory', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-meta-inval-${Date.now()}`);
  const cacheDir = path.join(tempDir, '.cache');
  const npmCache = path.join(cacheDir, 'context7', 'npm');
  const godotCache = path.join(cacheDir, 'context7', 'godot');
  fs.mkdirSync(npmCache, { recursive: true });
  fs.mkdirSync(godotCache, { recursive: true });

  const manager = new MultiLanguageMetadataManager({ projectRoot: tempDir, cacheDir });

  try {
    const deleted = manager.invalidateEcosystemCache('npm');
    assert.strictEqual(deleted, true);
    assert.strictEqual(fs.existsSync(npmCache), false);
    assert.strictEqual(fs.existsSync(godotCache), true); // Unaffected
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('checkDependencyLock detects locks accurately', () => {
  const tempDir = path.join(os.tmpdir(), `aegis-meta-lock-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const lockFile = path.join(tempDir, 'locks.json');

  const manager = new MultiLanguageMetadataManager({ projectRoot: tempDir });

  try {
    assert.strictEqual(manager.checkDependencyLock(lockFile).isLocked, false);

    fs.writeFileSync(lockFile, JSON.stringify({ 'lock:deps': 'agent-solver' }));
    const locked = manager.checkDependencyLock(lockFile);
    assert.strictEqual(locked.isLocked, true);
    assert.strictEqual(locked.holder, 'agent-solver');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
