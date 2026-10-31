import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkCoordinator } from './teamwork-coordinator.js';

test('TeamworkCoordinator lists all 4 official Antigravity subagent profiles', () => {
  const coordinator = new TeamworkCoordinator();
  const profiles = coordinator.listProfiles();
  assert.strictEqual(profiles.length, 4);

  const names = profiles.map(p => p.name);
  assert.ok(names.includes('issue-solver'));
  assert.ok(names.includes('qa-hunter'));
  assert.ok(names.includes('ui-specialist'));
  assert.ok(names.includes('doc-architect'));

  for (const p of profiles) {
    assert.strictEqual(p.workspaceMode, 'share');
    assert.strictEqual(p.enableWriteTools, true);
    assert.strictEqual(p.enableMcpTools, true);
    assert.ok(p.systemPrompt.includes('Demir Kafes') || p.systemPrompt.includes('Wiki'));
  }
});

test('TeamworkCoordinator plans teamwork, stages tracks in inbox, and acquires locks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-teamwork-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const targetFile = 'packages/core/src/feature.ts';
    const plan = coordinator.planTeamwork('Build responsive inventory UI and document API', [targetFile, 'theme.tres', 'docs/API.md']);

    assert.ok(plan.planId.startsWith('tw-'));
    assert.ok(plan.tracks.length >= 3);

    const solverTrack = plan.tracks.find(t => t.subagentName === 'issue-solver');
    assert.ok(solverTrack);
    assert.strictEqual(solverTrack?.invocationPayload.TypeName, 'issue-solver');
    assert.strictEqual(solverTrack?.invocationPayload.Workspace, 'share');

    const inboxPath = path.join(tmpDir, '.aegis', 'task-inbox.json');
    assert.ok(fs.existsSync(inboxPath));
    const staged = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
    assert.ok(staged.length >= 3);

    const status = coordinator.getTeamworkStatus();
    assert.ok(status.activeTracksCount >= 3);
    assert.ok(status.lockedFilesCount >= 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TeamworkCoordinator exports Antigravity subagents manifest cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-manifest-test-'));
  try {
    const coordinator = new TeamworkCoordinator(tmpDir);
    const result = coordinator.exportSubagentManifest(tmpDir);
    assert.strictEqual(result.count, 4);

    const manifestPath = path.join(tmpDir, 'subagents.json');
    assert.ok(fs.existsSync(manifestPath));
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(parsed.framework, 'antigravity-subagents');
    assert.strictEqual(parsed.subagents.length, 4);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
