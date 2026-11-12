import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CodexOrchestra } from './codex-orchestra.js';
import type { TeamworkPlan, TeamworkTrack } from './teamwork-types.js';

function track(id: string, files: string[] = [], phase = 1, dependsOn: string[] = []): TeamworkTrack {
  return { id, title: `${id} [${id}]`, subagentName: `solver [${id}]`, roleType: 'solver', phase, dependsOn,
    targetFiles: files, prompt: '', invocationPayload: { TypeName: 'issue-solver', Role: id, Prompt: '', Workspace: 'inherit', Model: 'inherit' } };
}
function plan(...tracks: TeamworkTrack[]): TeamworkPlan {
  return { planId: 'fixture-plan', objective: 'Verify orchestra behavior', createdAt: new Date().toISOString(), summary: '', tracks };
}
function fixture(run: (engine: CodexOrchestra, root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-orchestra-'));
  try { run(new CodexOrchestra(root), root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('Unicode plan task identifiers survive persistence and dependent dispatch', () => fixture(engine => {
  const first = 'solver-şimdi-123';
  const next = 'qa-uyumluluk-123';
  const run = engine.create(plan(track(first), track(next, [], 2, [first])), { maxWorkers: 2 });
  assert.equal(engine.dispatch(run.id)[0].taskId, first);
  engine.acknowledge(run.id, first, 'native-agent');
  engine.finish(run.id, first, { success: true, evidence: 'Unicode task verified' });
  assert.equal(engine.dispatch(run.id)[0].taskId, next);
  for (const unsafe of ['../escape', 'a/b', 'a\\b', 'a:b', '', '.hidden']) {
    assert.throws(() => engine.create(plan(track(unsafe)), { maxWorkers: 1 }), /identifier/);
  }
}));

test('dispatch reservations cap concurrency, survive reload and require actual acknowledgment', () => fixture((engine, root) => {
  const run = engine.create(plan(track('a'), track('b'), track('c')), { maxWorkers: 2 });
  assert.deepEqual(engine.dispatch(run.id, 0), []);
  const first = engine.dispatch(run.id, 1);
  assert.equal(first.length, 1);
  assert.equal(engine.status(run.id).tasks[0].state, 'reserved');
  assert.throws(() => engine.finish(run.id, 'a', { success: true, evidence: 'not running' }), /running/);
  const other = new CodexOrchestra(root);
  assert.equal(other.dispatch(run.id).length, 1);
  assert.deepEqual(other.dispatch(run.id), []);
  other.acknowledge(run.id, 'a', '/root/worker-a');
  other.acknowledge(run.id, 'a', '/root/worker-a');
  assert.throws(() => other.acknowledge(run.id, 'b', '/root/worker-a'), /another task/);
  other.finish(run.id, 'a', { success: true, evidence: 'actual verified output' });
  assert.equal(other.dispatch(run.id).length, 1);
}));

test('brokered hierarchy yields parent, runs children, then resumes parent with verified results', () => fixture(engine => {
  const run = engine.create(plan(track('parent', ['src/a.ts', 'src/b.ts'])), { maxWorkers: 2 });
  engine.dispatch(run.id); engine.acknowledge(run.id, 'parent', '/root/parent');
  engine.delegate(run.id, 'parent', [
    { id: 'child-a', title: 'Child A', targetFiles: ['src/a.ts'] },
    { id: 'child-b', title: 'Child B', targetFiles: ['src/b.ts'] }
  ]);
  assert.throws(() => engine.finish(run.id, 'parent', { success: true, evidence: 'premature' }), /running/);
  const children = engine.dispatch(run.id);
  assert.equal(children.length, 2);
  assert.ok(children.every(d => d.dispatchOwnerId === 'root' && d.parentId === 'parent'));
  for (const child of children) {
    engine.acknowledge(run.id, child.taskId, `/root/${child.taskId}`);
    engine.finish(run.id, child.taskId, { success: true, evidence: `verified ${child.taskId}` });
  }
  const resumed = engine.dispatch(run.id)[0];
  assert.equal(resumed.action, 'resume'); assert.equal(resumed.agentId, '/root/parent');
  assert.match(resumed.codexInvocationPayload.message, /verified child-a/);
  engine.acknowledge(run.id, 'parent', '/root/parent');
  engine.finish(run.id, 'parent', { success: true, evidence: 'parent synthesized both child outputs' });
  assert.equal(engine.status(run.id).state, 'done');
}));

test('dependency aliases expand to all matching tracks and phase barriers stop early QA', () => fixture(engine => {
  const a = track('a'), b = track('b');
  a.subagentName = 'solver [Core]'; b.subagentName = 'solver [Core]';
  const run = engine.create(plan(a, b, track('qa', [], 2, ['Core'])), { maxWorkers: 3 });
  assert.deepEqual(run.tasks[2].dependsOn, ['a', 'b']);
  assert.deepEqual(engine.dispatch(run.id).map(t => t.taskId), ['a', 'b']);
  engine.acknowledge(run.id, 'a', 'agent-a');
  engine.finish(run.id, 'a', { success: true, evidence: 'checked' });
  assert.deepEqual(engine.dispatch(run.id), []);
  engine.acknowledge(run.id, 'b', 'agent-b');
  engine.finish(run.id, 'b', { success: true, evidence: 'checked' });
  assert.deepEqual(engine.dispatch(run.id).map(t => t.taskId), ['qa']);
}));

test('shared solver and QA aliases resolve only upstream tracks, excluding self and later phases', () => fixture(engine => {
  const solverA = track('solver-a'), solverB = track('solver-b');
  const qaA = track('qa-a', [], 2, ['Core']), qaB = track('qa-b', [], 2, ['Core']);
  const docs = track('docs', [], 3, ['Core']);
  for (const item of [solverA, solverB, qaA, qaB, docs]) item.subagentName = `${item.roleType} [Core]`;
  const run = engine.create(plan(solverA, solverB, qaA, qaB, docs), { maxWorkers: 3 });
  assert.deepEqual(run.tasks.find(item => item.id === 'qa-a')?.dependsOn, ['solver-a', 'solver-b']);
  assert.deepEqual(run.tasks.find(item => item.id === 'qa-b')?.dependsOn, ['solver-a', 'solver-b']);
  assert.deepEqual(run.tasks.find(item => item.id === 'docs')?.dependsOn, ['solver-a', 'solver-b', 'qa-a', 'qa-b']);
  for (const id of ['solver-a', 'solver-b']) {
    engine.dispatch(run.id);
    engine.acknowledge(run.id, id, `native-${id}`);
    engine.finish(run.id, id, { success: true, evidence: 'upstream verified' });
  }
  assert.deepEqual(engine.dispatch(run.id).map(item => item.taskId), ['qa-a', 'qa-b']);
}));

test('same-phase aliases remain valid and exact dependency IDs retain their strict meaning', () => fixture(engine => {
  const producer = track('producer'), consumer = track('consumer', [], 1, ['Shared']);
  producer.subagentName = 'solver [Shared]'; consumer.subagentName = 'solver [Shared]';
  const run = engine.create(plan(producer, consumer), { maxWorkers: 2 });
  assert.deepEqual(run.tasks[1].dependsOn, ['producer']);
  assert.deepEqual(engine.dispatch(run.id).map(item => item.taskId), ['producer']);
  const later = track('later', [], 2);
  later.subagentName = 'solver [producer]';
  const exact = engine.create(plan(track('producer'), track('qa', [], 2, ['producer']), later), { maxWorkers: 2 });
  assert.deepEqual(exact.tasks[1].dependsOn, ['producer']);
  assert.throws(() => engine.create(plan(track('self', [], 1, ['self'])), { maxWorkers: 1 }), /Cyclic/);
  assert.throws(() => engine.create(plan(track('early', [], 1, ['later']), later), { maxWorkers: 1 }), /later phase/);
}));

test('same-file work is serialized, including Windows case aliases', () => fixture(engine => {
  const run = engine.create(plan(track('a', ['src/A.ts']), track('b', ['src/a.ts'])), { maxWorkers: 4 });
  assert.equal(engine.dispatch(run.id).length, 1);
  engine.acknowledge(run.id, 'a', 'a'); engine.finish(run.id, 'a', { success: true, evidence: 'verified' });
  assert.equal(engine.dispatch(run.id)[0].taskId, 'b');
}));

test('child failure blocks parent and downstream phases without marking run done', () => fixture(engine => {
  const run = engine.create(plan(track('p'), track('qa', [], 2, ['p'])), { maxWorkers: 2 });
  engine.dispatch(run.id); engine.acknowledge(run.id, 'p', 'parent');
  engine.delegate(run.id, 'p', [{ id: 'child', title: 'Child', targetFiles: [] }]);
  engine.dispatch(run.id); engine.acknowledge(run.id, 'child', 'child-agent');
  engine.finish(run.id, 'child', { success: false, evidence: 'the child verification failed' });
  const state = engine.status(run.id);
  assert.equal(state.state, 'failed');
  assert.equal(state.tasks.find(t => t.id === 'p')?.state, 'blocked');
  assert.equal(state.tasks.find(t => t.id === 'qa')?.state, 'blocked');
  assert.deepEqual(engine.dispatch(run.id), []);
}));

test('invalid graphs, paths and capacity fail before creating a run', () => fixture((engine, root) => {
  const invalid = [plan(track('a', [], 1, ['missing'])), plan(track('a'), track('a')),
    plan(track('a', [], 1, ['b']), track('b', [], 1, ['a'])),
    plan(track('a', [], 1, ['b']), track('b', [], 2)), plan(track('a', ['../outside.ts'])),
    plan(track('a', ['C:\\outside.ts'])), plan(track('a', ['/outside.ts']))];
  for (const input of invalid) assert.throws(() => engine.create(input, { maxWorkers: 2 }));
  assert.throws(() => engine.create(plan(track('a')), { maxWorkers: 0 }));
  assert.throws(() => new CodexOrchestra(path.join(root, 'missing')));
  assert.equal(fs.existsSync(path.join(root, '.aegis/codex-orchestra')), false);
}));

test('child scope, depth and dependency validation preserve the prior state atomically', () => fixture(engine => {
  const run = engine.create(plan(track('parent', ['src/a.ts'])), { maxWorkers: 2, maxDepth: 1 });
  engine.dispatch(run.id); engine.acknowledge(run.id, 'parent', 'parent-agent');
  const before = engine.status(run.id);
  assert.throws(() => engine.delegate(run.id, 'parent', [{ id: 'escape', title: 'Escape', targetFiles: ['src/b.ts'] }]), /scope/);
  assert.throws(() => engine.delegate(run.id, 'parent', [{ id: 'cycle', title: 'Cycle', targetFiles: [], dependsOn: ['parent'] }]), /Cyclic/);
  assert.deepEqual(engine.status(run.id), before);
  engine.delegate(run.id, 'parent', [{ id: 'child', title: 'Child', targetFiles: [] }]);
  engine.dispatch(run.id); engine.acknowledge(run.id, 'child', 'child-agent');
  assert.throws(() => engine.delegate(run.id, 'child', [{ id: 'deep', title: 'Deep', targetFiles: [] }]), /maxDepth/);
}));

test('sequential mode and failed native spawn cancellation never report running work', () => fixture(engine => {
  const run = engine.create(plan(track('a'), track('b')), { maxWorkers: 5, mode: 'sequential' });
  assert.equal(run.options.maxWorkers, 1);
  assert.equal(engine.dispatch(run.id).length, 1);
  engine.cancelDispatch(run.id, 'a', 'native spawn rejected by host');
  assert.equal(engine.status(run.id).tasks[0].state, 'pending');
  engine.dispatch(run.id); engine.acknowledge(run.id, 'a', 'agent-a');
  assert.throws(() => engine.cancelDispatch(run.id, 'a', 'cannot cancel actual running work'));
  assert.throws(() => engine.finish(run.id, 'a', { success: true, evidence: '' }), /evidence/);
}));

test('corrupt persisted state fails without replacing evidence or touching the shared inbox', () => fixture((engine, root) => {
  const run = engine.create(plan(track('a')), { maxWorkers: 2 });
  const file = path.join(root, '.aegis/codex-orchestra', `${run.id}.json`);
  const inbox = path.join(root, '.aegis/task-inbox.json');
  fs.writeFileSync(inbox, 'keep this unrelated inbox');
  fs.writeFileSync(file, '{bad');
  assert.throws(() => engine.dispatch(run.id));
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad');
  assert.equal(fs.readFileSync(inbox, 'utf8'), 'keep this unrelated inbox');
  const broken = { ...run, tasks: [{ ...run.tasks[0], phase: -1 }] };
  fs.writeFileSync(file, JSON.stringify(broken));
  assert.throws(() => engine.status(run.id), /Invalid persisted/);
}));

test('separate coordinator processes reserve each slot exactly once under the run mutex', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-orchestra-process-'));
  try {
    const engine = new CodexOrchestra(root);
    const run = engine.create(plan(track('a'), track('b'), track('c')), { maxWorkers: 2 });
    const source = `const {CodexOrchestra}=require(${JSON.stringify(path.join(__dirname, 'codex-orchestra.js'))});` +
      `console.log(JSON.stringify(new CodexOrchestra(${JSON.stringify(root)}).dispatch(${JSON.stringify(run.id)})))`;
    const execute = promisify(execFile);
    const responses = await Promise.all([execute(process.execPath, ['-e', source]), execute(process.execPath, ['-e', source])]);
    const dispatched = responses.flatMap(result => JSON.parse(result.stdout) as Array<{ taskId: string }>);
    assert.equal(dispatched.length, 2);
    assert.equal(new Set(dispatched.map(task => task.taskId)).size, 2);
    assert.equal(engine.status(run.id).tasks.filter(t => t.state === 'reserved').length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
