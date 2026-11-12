import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveSafeRepoRoot } from '@aegis/shared';
import { executeMcpTool } from './mcp-tool-dispatcher.js';
import type { TeamworkPlan, TeamworkTrack } from '@aegis/orchestrator';
import { handleTeamworkPlan } from './teamwork-command.js';
import { loadTeamworkPlan, saveTeamworkPlan } from './teamwork-plan-store.js';

test('saved MCP plan batches retain exact track identities and native payloads', async () => {
  const plan = JSON.parse(await executeMcpTool('teamwork_plan', {
    objective: 'Repair native routing', targetFiles: ['src/engine.ts']
  })) as TeamworkPlan;
  const file = path.join(resolveSafeRepoRoot(), '.aegis/teamwork-plans', `${plan.planId}.json`);
  assert.ok(fs.existsSync(file));
  for (const alias of ['teamwork_batch', 'tw_batch', 'tr_batch']) {
    const batches = JSON.parse(await executeMcpTool(alias, { planId: plan.planId, client: 'codex' })) as TeamworkTrack[][];
    const tracks = batches.flat();
    assert.deepEqual(tracks.map(track => track.id).sort(), plan.tracks.map(track => track.id).sort());
    assert.deepEqual(tracks[0].codexInvocationPayload, plan.tracks[0].codexInvocationPayload);
    assert.ok(tracks.every(track => !('invocationPayload' in track) && !('prompt' in track)));
  }
});

test('batch lookup rejects missing plans and path traversal without replanning', async () => {
  const root = resolveSafeRepoRoot();
  const inbox = path.join(root, '.aegis/task-inbox.json');
  const before = fs.existsSync(inbox) ? fs.readFileSync(inbox, 'utf8') : undefined;
  for (const planId of ['tw-missing', '../../outside']) {
    const result = JSON.parse(await executeMcpTool('tw_batch', { planId })) as { error: string };
    assert.match(result.error, /not found|Invalid teamwork plan ID/);
  }
  assert.equal(fs.existsSync(inbox) ? fs.readFileSync(inbox, 'utf8') : undefined, before);
});

test('CLI dry-run creates no saved plan or inbox tasks', t => {
  t.mock.method(console, 'log', () => {});
  t.after(() => t.mock.restoreAll());
  const root = resolveSafeRepoRoot();
  const inbox = path.join(root, '.aegis/task-inbox.json');
  const before = fs.existsSync(inbox) ? fs.readFileSync(inbox, 'utf8') : undefined;
  const plan = handleTeamworkPlan('Preview unique native routing task', '--dry-run', '--json');
  assert.ok(plan);
  assert.ok(!fs.existsSync(path.join(root, '.aegis/teamwork-plans', `${plan.planId}.json`)));
  assert.equal(fs.existsSync(inbox) ? fs.readFileSync(inbox, 'utf8') : undefined, before);
});

test('saved plans are isolated to the active project', t => {
  const original = process.env.AEGIS_WORKSPACE;
  const restoreWorkspace = () => {
    if (original === undefined) delete process.env.AEGIS_WORKSPACE;
    else process.env.AEGIS_WORKSPACE = original;
  };
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-plan-isolation-'));
  t.after(() => { restoreWorkspace(); fs.rmSync(second, { recursive: true, force: true }); });
  const plan: TeamworkPlan = { planId: 'tw-isolation', objective: 'isolation', createdAt: '', tracks: [], summary: '' };
  saveTeamworkPlan(plan);
  process.env.AEGIS_WORKSPACE = second;
  assert.throws(() => loadTeamworkPlan(plan.planId), /not found/);
  saveTeamworkPlan({ ...plan, objective: 'second project' });
  assert.equal(loadTeamworkPlan(plan.planId).objective, 'second project');
  restoreWorkspace();
  assert.equal(loadTeamworkPlan(plan.planId).objective, 'isolation');
});

test('Codex wave briefing contains native dispatch guidance and excludes Antigravity payloads', async () => {
  const raw = await executeMcpTool('tw_waves', { objective: 'Inspect native routing', client: 'codex' });
  const result = JSON.parse(raw) as { waves: { tracks: TeamworkTrack[] }[]; briefing: string };
  assert.match(result.briefing, /native spawn tool/);
  assert.doesNotMatch(raw, /invoke_subagent|"invocationPayload"|"Prompt"|"Model"/);
  assert.ok(result.waves.flatMap(wave => wave.tracks).every(track => track.codexInvocationPayload));
  const legacy = JSON.parse(await executeMcpTool('tw_waves', { objective: 'Inspect legacy routing' })) as { briefing: string };
  assert.match(legacy.briefing, /invoke_subagent/);
});
