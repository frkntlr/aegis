/**
 * @file teamwork-coordinator-clear.test.ts
 * Tests for TeamworkCoordinator clearTeamwork, clearLocks, advanceWave, deliberate, and formatLiveMatrix.
 * Complies with Demir Kafes: <300 lines/file, <40 lines/function, 0 any.
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  TeamworkCoordinator,
  clearTeamwork,
  clearLocks
} from './teamwork-coordinator.js';

test('TeamworkCoordinator clearTeamwork and clearLocks release locks and clear inbox', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-tw-clear-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const plan = coordinator.planTeamwork('Build responsive inventory UI and document API', [
      'packages/core/src/feature.ts',
      'theme.tres',
      'docs/API.md'
    ]);
    assert.ok(plan.planId);

    const statusBefore = coordinator.getTeamworkStatus();
    assert.ok(statusBefore.lockedFilesCount >= 1);
    assert.ok(statusBefore.activeTracksCount >= 1);

    const clearRes = coordinator.clearTeamwork();
    assert.ok(clearRes.locksCleared >= 1);
    assert.ok(clearRes.tasksCleared >= 1);

    const statusAfter = coordinator.getTeamworkStatus();
    assert.strictEqual(statusAfter.lockedFilesCount, 0);
    assert.strictEqual(statusAfter.activeTracksCount, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('standalone clearTeamwork and clearLocks helpers operate cleanly on custom repoRoot', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-tw-helper-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    coordinator.planTeamwork('Build documentation portal', ['docs/index.md']);
    assert.ok(coordinator.getTeamworkStatus().lockedFilesCount >= 1);

    const locksCount = clearLocks(tmpDir);
    assert.ok(locksCount >= 1);

    coordinator.planTeamwork('Re-stage docs build', ['docs/index.md']);
    const twRes = clearTeamwork(tmpDir);
    assert.ok(twRes.locksCleared >= 1);
    assert.ok(twRes.tasksCleared >= 1);
    assert.strictEqual(coordinator.getTeamworkStatus().lockedFilesCount, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkCoordinator exposes advanceWave, deliberate, and formatLiveMatrix for MCP parity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-tw-mcp-methods-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const plan = coordinator.planTeamwork('Refactor subsystem and verify telemetry', [
      'packages/core/subsystem.ts'
    ]);

    // Test advanceWave
    const adv = coordinator.advanceWave(plan.planId);
    assert.strictEqual(typeof adv.advanced, 'boolean');
    assert.strictEqual(typeof adv.currentWave, 'number');
    assert.strictEqual(typeof adv.nextPhase, 'string');
    assert.ok(Array.isArray(adv.nextBatchPayload));

    // Test deliberate
    const delib = coordinator.deliberate('Refactor subsystem and verify telemetry', [
      'packages/core/subsystem.ts'
    ]);
    assert.strictEqual(typeof delib.deliberationId, 'string');
    assert.ok(delib.consensus);
    assert.strictEqual(typeof delib.consensus.consensusScore, 'number');

    // Test formatLiveMatrix
    const matrix = coordinator.formatLiveMatrix(plan);
    assert.ok(typeof matrix === 'string');
    assert.ok(matrix.includes('Matrisi') || matrix.includes('Faz'));
    assert.ok(matrix.includes('issue-solver') || matrix.includes('qa-hunter'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
