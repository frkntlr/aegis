import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkMesh } from './teamwork-mesh.js';
import type { TeamworkTrack } from './teamwork-types.js';

function createMockTracks(): TeamworkTrack[] {
  return [
    {
      id: 't-solver',
      roleType: 'solver',
      subagentName: 'solver-core',
      title: 'Parser Logic',
      targetFiles: ['src/core.ts'],
      prompt: 'p',
      invocationPayload: { TypeName: 'issue-solver', Role: 'Core', Prompt: 'p', Workspace: 'inherit', Model: 'flash' },
      dependsOn: [],
      phase: 1
    },
    {
      id: 't-ui',
      roleType: 'ui',
      subagentName: 'ui-hud',
      title: 'HUD Layout',
      targetFiles: ['res://hud.tscn'],
      prompt: 'p',
      invocationPayload: { TypeName: 'ui-specialist', Role: 'UI', Prompt: 'p', Workspace: 'inherit', Model: 'flash' },
      dependsOn: [],
      phase: 1
    }
  ];
}

test('TeamworkMesh advanceWave inspects active wave tasks and returns detailed status and readiness report', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-adv-test-'));
  try {
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-adv-1', 'Build parser & UI', createMockTracks());

    // 1. Advance while tasks are pending in Wave 1
    const res1 = mesh.advanceWave('plan-adv-1');
    assert.strictEqual(res1.advanced, true);
    assert.strictEqual(res1.currentWave, 1);
    assert.strictEqual(res1.nextWave, 2);
    assert.strictEqual(res1.status.total, 2);
    assert.strictEqual(res1.status.done, 0);
    assert.strictEqual(res1.status.pending, 2);
    assert.deepStrictEqual(res1.pendingAgents.sort(), ['solver-core', 'ui-hud']);
    assert.strictEqual(res1.status.readyForNextWave, false);
    assert.ok(res1.readinessReport.includes('Wave 1 in progress: 2 pending agent(s)'));
    assert.ok(res1.message.includes('Wave 1 in progress'));

    // Verify stored event payload has inspection details
    const events = mesh.getEvents();
    const advEvent = events.find(e => e.payload?.eventName === 'WAVE_COMPLETED');
    assert.ok(advEvent);
    assert.strictEqual(advEvent?.payload?.readinessReport, res1.readinessReport);
    assert.deepStrictEqual(advEvent?.payload?.pendingAgents, res1.pendingAgents);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMesh advanceWave flags blocked agents and reports remediation required', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-adv-blocked-'));
  try {
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-adv-2', 'Build with blocked task', createMockTracks());

    mesh.postActivity('solver-core', { status: 'blocked', activity: 'Missing type definitions' });
    mesh.postActivity('ui-hud', { status: 'done', activity: 'Finished HUD' });

    const res = mesh.advanceWave('plan-adv-2');
    assert.strictEqual(res.advanced, true);
    assert.strictEqual(res.status.blocked, 1);
    assert.strictEqual(res.status.done, 1);
    assert.strictEqual(res.status.needsCorrection, true);
    assert.deepStrictEqual(res.blockedAgents, ['solver-core']);
    assert.ok(res.readinessReport.includes('Wave 1 blocked: 1 agent(s) [solver-core]. Remediation required.'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
