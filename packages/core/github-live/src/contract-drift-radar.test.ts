/**
 * @file contract-drift-radar.test.ts
 * Tests for ContractDriftRadar streaming hash calculation, signature diffing, and drift evaluation.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ContractDriftRadar, type ContractSignature } from './contract-drift-radar.js';

test('computeFileHashStream produces consistent sha256 hash', async () => {
  const tempDir = path.join(os.tmpdir(), `aegis-radar-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const testFile = path.join(tempDir, 'sample-lock.json');
  fs.writeFileSync(testFile, '{"lockfileVersion": 3, "packages": {}}');

  try {
    const hash = await ContractDriftRadar.computeFileHashStream(testFile);
    assert.ok(hash);
    assert.strictEqual(typeof hash, 'string');
    assert.strictEqual(hash.length, 64);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('compareSignatures detects removed methods and arity breaking changes', () => {
  const oldSigs: ContractSignature[] = [
    { library: 'zod', symbol: 'string', parameters: [] },
    { library: 'axios', symbol: 'get', parameters: ['url', 'config'], returnType: 'Promise<AxiosResponse>' },
    { library: 'godot', symbol: 'spawn', parameters: ['node'] }
  ];

  const newSigs: ContractSignature[] = [
    { library: 'zod', symbol: 'string', parameters: [] },
    { library: 'axios', symbol: 'get', parameters: ['url'], returnType: 'Promise<unknown>' }
    // 'spawn' was removed
  ];

  const diff = ContractDriftRadar.compareSignatures(oldSigs, newSigs);
  assert.strictEqual(diff.breaking.length, 2);
  assert.ok(diff.breaking.some(b => b.includes('REMOVED: godot::spawn')));
  assert.ok(diff.breaking.some(b => b.includes('ARITY_CHANGED: axios::get')));
  assert.strictEqual(diff.warnings.length, 1);
  assert.ok(diff.warnings[0]?.includes('RETURN_CHANGED: axios::get'));
});

test('evaluateDrift flags drift on lockfile mismatch and recommends block', async () => {
  const tempDir = path.join(os.tmpdir(), `aegis-drift-eval-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const lockfile = path.join(tempDir, 'package-lock.json');
  fs.writeFileSync(lockfile, '{"version": "1.0.0"}');

  const radar = new ContractDriftRadar({
    projectRoot: tempDir,
    cacheDir: path.join(tempDir, '.cache')
  });

  try {
    // 1. Initial scan: no cache yet -> has drift
    const res1 = await radar.evaluateDrift([], [], [lockfile]);
    assert.strictEqual(res1.hasDrift, true);
    assert.strictEqual(res1.changedFiles.length, 1);
    assert.strictEqual(res1.shouldBlock, false);

    // 2. Save cache
    const metas = await radar.scanLockfiles([lockfile]);
    const ledger = Object.fromEntries(metas.map(m => [m.path, m.hash]));
    radar.saveLedger(ledger);

    // 3. Re-evaluate: same hash -> no drift
    const res2 = await radar.evaluateDrift([], [], [lockfile]);
    assert.strictEqual(res2.hasDrift, false);
    assert.strictEqual(res2.changedFiles.length, 0);

    // 4. Breaking change introduced -> shouldBlock = true
    const oldSig: ContractSignature[] = [{ library: 'test', symbol: 'run', parameters: [] }];
    const res3 = await radar.evaluateDrift(oldSig, [], [lockfile]);
    assert.strictEqual(res3.hasDrift, true);
    assert.strictEqual(res3.shouldBlock, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
