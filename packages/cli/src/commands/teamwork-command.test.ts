import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  handleTeamworkStatus,
  handleTeamworkPlan,
  handleTeamworkSetup,
  handleTeamwork,
  mcpTeamworkPlan,
  mcpTeamworkStatus
} from './teamwork-command.js';

test('handleTeamworkStatus runs cleanly without error', () => {
  assert.doesNotThrow(() => handleTeamworkStatus());
});

test('handleTeamworkPlan creates plan and stages tracks', () => {
  const plan = handleTeamworkPlan('Build auth dialog and docs', 'auth.ts', 'docs/AUTH.md');
  assert.ok(plan);
  assert.strictEqual(typeof plan.planId, 'string');
  assert.ok(plan.tracks.length >= 2);
  const solverTrack = plan.tracks.find(t => t.roleType === 'solver' || t.subagentName.startsWith('issue-solver'));
  assert.ok(solverTrack);
  assert.strictEqual(solverTrack?.invocationPayload.TypeName, 'issue-solver');
  assert.strictEqual(solverTrack?.invocationPayload.Workspace, 'inherit');
});

test('handleTeamworkPlan handles missing objective gracefully', () => {
  const plan = handleTeamworkPlan('');
  assert.strictEqual(plan, null);
});

test('handleTeamworkSetup exports subagent manifest', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-cmd-setup-'));
  try {
    assert.doesNotThrow(() => handleTeamworkSetup(tmpDir));
    const manifestPath = path.join(tmpDir, 'subagents.json');
    assert.ok(fs.existsSync(manifestPath));
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.strictEqual(parsed.subagents.length, 4);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('handleTeamwork router invokes subcommands properly', () => {
  assert.doesNotThrow(() => handleTeamwork('status'));
  assert.doesNotThrow(() => handleTeamwork('plan', 'Quick fix in logger'));
  assert.doesNotThrow(() => handleTeamwork('matrix', 'Quick fix in logger'));
  assert.doesNotThrow(() => handleTeamwork('unknown'));
});

test('mcpTeamworkPlan returns valid JSON plan', () => {
  const raw = mcpTeamworkPlan({ objective: 'Refactor cache and UI', targetFiles: ['cache.ts', 'ui.tres'] });
  const parsed = JSON.parse(raw);
  assert.ok(parsed.planId);
  assert.ok(parsed.tracks.length >= 2);
});

test('mcpTeamworkPlan handles missing objective with error response', () => {
  const raw = mcpTeamworkPlan({});
  const parsed = JSON.parse(raw);
  assert.ok(parsed.error);
});

test('mcpTeamworkStatus returns valid JSON report', () => {
  const raw = mcpTeamworkStatus();
  const parsed = JSON.parse(raw);
  assert.strictEqual(typeof parsed.activeTracksCount, 'number');
  assert.strictEqual(typeof parsed.lockedFilesCount, 'number');
  assert.ok(Array.isArray(parsed.profiles));
  assert.strictEqual(parsed.profiles.length, 4);
});
