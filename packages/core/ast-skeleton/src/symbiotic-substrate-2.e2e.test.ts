/**
 * @file symbiotic-substrate-2.e2e.test.ts
 * End-to-End integration test for Symbiotic Substrate 2.0 Hardening.
 * Validates TransitiveTypeClosure, ContractDriftRadar, and MultiLanguageMetadataManager.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TransitiveTypeClosure } from './transitive-type-closure.js';
import { MultiLanguageMetadataManager } from './multi-language-metadata-manager.js';
import { ContractDriftRadar, type ContractSignature } from '@aegis/github-live';

test('Symbiotic Substrate 2.0: Transitive Type Closure with Opaque Stubbing', () => {
  const serviceCode = `
    export interface UserPayload {
      id: string;
      details: TransitiveAccountDetails;
    }
    export function fetchUser(): UserPayload {
      return {} as UserPayload;
    }
  `;
  const closure = new TransitiveTypeClosure({ maxDepth: 1, enableOpaqueStubbing: true });
  const closureRes = closure.resolveClosure('fetchUser', 'service.ts', serviceCode);

  assert.strictEqual(closureRes.fullDeclarations.length, 1);
  assert.strictEqual(closureRes.opaqueStubs.length, 1);
  assert.ok(closureRes.opaqueStubs[0]?.includes('TransitiveAccountDetails'));
});

test('Symbiotic Substrate 2.0: Metadata Manager & Drift Radar integration', async () => {
  const tempDir = path.join(os.tmpdir(), `aegis-substrate2-e2e-${Date.now()}`);
  const cacheDir = path.join(tempDir, '.aegis', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const pkgLock = path.join(tempDir, 'package-lock.json');
  fs.writeFileSync(pkgLock, '{"name": "test-app", "version": "1.0.0"}');

  try {
    const metaMgr = new MultiLanguageMetadataManager({ projectRoot: tempDir, cacheDir });
    const drift1 = metaMgr.checkEcosystemDrift();
    assert.ok(drift1.drifted.includes('npm'));
    metaMgr.saveLockLedger(drift1.ledger);

    const radar = new ContractDriftRadar({ projectRoot: tempDir, cacheDir: path.join(cacheDir, 'context7') });
    const oldContract: ContractSignature[] = [{ library: 'service', symbol: 'fetchUser', parameters: [] }];
    const newContract: ContractSignature[] = [{ library: 'service', symbol: 'fetchUser', parameters: ['userId'] }];

    const radarRes = await radar.evaluateDrift(oldContract, newContract, [pkgLock]);
    assert.strictEqual(radarRes.hasDrift, true);
    assert.strictEqual(radarRes.shouldBlock, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
