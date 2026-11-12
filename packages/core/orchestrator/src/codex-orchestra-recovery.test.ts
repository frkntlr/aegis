import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodexOrchestra, type OrchestraDeferralInput } from './codex-orchestra.js';
import type { TeamworkPlan, TeamworkTrack } from './teamwork-types.js';

const now = Date.UTC(2030, 0, 1);
const later = '2030-01-01T00:01:00Z';
const deferral: OrchestraDeferralInput = { reason: 'Host quota interruption', checkpoint: 'Implementation saved; validation remains',
  resumeAfter: later, agentStopped: true };

function track(id: string, phase = 1, dependsOn: string[] = [], files: string[] = []): TeamworkTrack {
  return { id, title: id, subagentName: id, roleType: 'solver', phase, dependsOn, targetFiles: files,
    prompt: '', invocationPayload: { TypeName: 'issue-solver', Role: id, Prompt: '', Workspace: 'inherit', Model: 'inherit' } };
}
function plan(...tracks: TeamworkTrack[]): TeamworkPlan {
  return { planId: 'recover-plan', objective: 'Recover interrupted work', createdAt: new Date().toISOString(), summary: '', tracks };
}
function fixture(run: (engine: CodexOrchestra, root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-orchestra-recover-'));
  try { run(new CodexOrchestra(root), root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('deferred work survives reload and resumes only when due without replaying verified tasks', t => fixture((engine, root) => {
  let clock = now;
  t.mock.method(Date, 'now', () => clock);
  const run = engine.create(plan(track('verified'), track('interrupted', 2, ['verified']), track('qa', 3, ['interrupted'])), { maxWorkers: 2 });
  engine.dispatch(run.id); engine.acknowledge(run.id, 'verified', 'native-verified');
  engine.finish(run.id, 'verified', { success: true, evidence: 'Verified output remains authoritative' });
  const verified = engine.status(run.id).tasks[0];
  engine.dispatch(run.id); engine.acknowledge(run.id, 'interrupted', 'native-interrupted');
  engine.defer(run.id, 'interrupted', deferral);
  const reloaded = new CodexOrchestra(root);
  assert.deepEqual(reloaded.status(run.id).tasks[0], verified);
  assert.equal(reloaded.recovery(run.id).deferred[0].due, false);
  assert.equal(reloaded.recovery(run.id).nextResumeAfter, '2030-01-01T00:01:00.000Z');
  assert.deepEqual(reloaded.dispatch(run.id), []);
  clock += 60000;
  const resumed = reloaded.dispatch(run.id);
  assert.deepEqual(resumed.map(item => item.taskId), ['interrupted']);
  assert.equal(resumed[0].action, 'resume'); assert.equal(resumed[0].agentId, 'native-interrupted');
  assert.match(resumed[0].codexInvocationPayload.message, /Implementation saved; validation remains/);
  assert.match(resumed[0].codexInvocationPayload.message, /unverified progress, not completion evidence/);
  assert.deepEqual(reloaded.dispatch(run.id), []);
  reloaded.acknowledge(run.id, 'interrupted', 'native-reconnected');
  reloaded.finish(run.id, 'interrupted', { success: true, evidence: 'Remaining validation passed' });
  assert.deepEqual(reloaded.dispatch(run.id).map(item => item.taskId), ['qa']);
  assert.deepEqual(reloaded.status(run.id).tasks[0], verified);
}));

test('deferral frees capacity but keeps its file scope against unrelated work', t => fixture(engine => {
  t.mock.method(Date, 'now', () => now);
  const run = engine.create(plan(track('interrupted', 1, [], ['src/shared.ts']), track('conflicting', 1, [], ['src/shared.ts']),
    track('independent', 1, [], ['src/independent.ts'])), { maxWorkers: 1 });
  engine.dispatch(run.id); engine.acknowledge(run.id, 'interrupted', 'native-interrupted');
  engine.defer(run.id, 'interrupted', deferral);
  assert.deepEqual(engine.dispatch(run.id).map(item => item.taskId), ['independent']);
  assert.equal(engine.status(run.id).tasks.find(item => item.id === 'conflicting')?.state, 'pending');
}));

test('a deferred resume waits when its stopped native identity was reused for active work', t => fixture(engine => {
  let clock = now;
  t.mock.method(Date, 'now', () => clock);
  const run = engine.create(plan(track('interrupted'), track('independent')), { maxWorkers: 2 });
  engine.dispatch(run.id, 1); engine.acknowledge(run.id, 'interrupted', 'native-reused');
  engine.defer(run.id, 'interrupted', deferral);
  engine.dispatch(run.id); engine.acknowledge(run.id, 'independent', 'native-reused');
  clock += 60000;
  assert.deepEqual(engine.dispatch(run.id), []);
  engine.finish(run.id, 'independent', { success: true, evidence: 'Independent work verified' });
  assert.equal(engine.dispatch(run.id)[0].taskId, 'interrupted');
}));

test('defer of a stopped reserved dispatch clears reservation without inventing an agent', t => fixture(engine => {
  t.mock.method(Date, 'now', () => now);
  const run = engine.create(plan(track('reserved')), { maxWorkers: 1 });
  engine.dispatch(run.id);
  const deferred = engine.defer(run.id, 'reserved', { ...deferral, resumeAfter: '2030-01-01T00:00:00Z' }).tasks[0];
  assert.equal(deferred.state, 'deferred'); assert.equal(deferred.reservationId, undefined);
  assert.equal(deferred.recovery?.lastAgentId, undefined);
  assert.equal(engine.dispatch(run.id)[0].action, 'spawn');
}));

test('invalid timestamps, missing stop confirmation and empty checkpoints preserve prior state atomically', t => fixture((engine, root) => {
  t.mock.method(Date, 'now', () => now);
  const run = engine.create(plan(track('task')), { maxWorkers: 1 });
  engine.dispatch(run.id); engine.acknowledge(run.id, 'task', 'native-task');
  const file = path.join(root, '.aegis/codex-orchestra', `${run.id}.json`);
  const before = fs.readFileSync(file, 'utf8');
  const invalid = [{ ...deferral, agentStopped: false }, { ...deferral, agentStopped: undefined },
    { ...deferral, checkpoint: '' }, { ...deferral, reason: '' },
    ...['tomorrow', '2030-02-30T00:00:00Z', '2030-01-01T00:00:00', '2030-01-01T25:00:00Z'].map(resumeAfter => ({ ...deferral, resumeAfter }))];
  for (const input of invalid) {
    assert.throws(() => engine.defer(run.id, 'task', input as OrchestraDeferralInput));
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
}));

test('verified done, failed and blocked tasks cannot be reset through deferral', t => fixture(engine => {
  t.mock.method(Date, 'now', () => now);
  const run = engine.create(plan(track('done'), track('failed'), track('blocked', 2, ['failed'])), { maxWorkers: 2 });
  engine.dispatch(run.id);
  engine.acknowledge(run.id, 'done', 'native-done'); engine.finish(run.id, 'done', { success: true, evidence: 'Done verified' });
  engine.acknowledge(run.id, 'failed', 'native-failed'); engine.finish(run.id, 'failed', { success: false, evidence: 'Verification failed' });
  const before = engine.status(run.id);
  for (const id of ['done', 'failed', 'blocked']) assert.throws(() => engine.defer(run.id, id, deferral), /running or reserved/);
  assert.deepEqual(engine.status(run.id), before);
}));

test('list and recovery status are read-only and corrupted recovery is never silently reset', t => fixture((engine, root) => {
  t.mock.method(Date, 'now', () => now);
  assert.deepEqual(engine.list(), []);
  const run = engine.create(plan(track('task')), { maxWorkers: 1 });
  engine.dispatch(run.id); engine.acknowledge(run.id, 'task', 'native-task'); engine.defer(run.id, 'task', deferral);
  const file = path.join(root, '.aegis/codex-orchestra', `${run.id}.json`), before = fs.readFileSync(file, 'utf8');
  assert.equal(engine.list()[0].id, run.id); assert.equal(engine.recovery(run.id).deferred[0].agentStopped, true);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const corrupt = engine.status(run.id); corrupt.tasks[0].recovery!.resumeAfter = 'never';
  fs.writeFileSync(file, JSON.stringify(corrupt));
  assert.throws(() => engine.list(), /timestamp/);
  assert.throws(() => engine.dispatch(run.id), /timestamp/);
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(corrupt));
}));
