import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodexOrchestra, type OrchestraRun } from './codex-orchestra.js';
import type { TeamworkPlan, TeamworkTrack } from './teamwork-types.js';

function fixture(run: (root: string, orchestra: CodexOrchestra) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-orchestra-review-'));
  try { run(root, new CodexOrchestra(root)); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function plan(files: string[] = []): TeamworkPlan {
  const track: TeamworkTrack = {
    id: 'parent', roleType: 'solver', subagentName: 'issue-solver', title: 'Bounded task',
    targetFiles: files, prompt: 'Inspect only', dependsOn: [], phase: 1,
    invocationPayload: { TypeName: 'issue-solver', Role: 'solver', Prompt: 'Inspect only', Workspace: 'inherit', Model: 'inherit' }
  };
  return { planId: 'review-plan', objective: 'Review scheduler invariants', createdAt: new Date().toISOString(),
    tracks: [track], summary: 'One bounded task' };
}

function overwrite(root: string, run: OrchestraRun): void {
  fs.writeFileSync(path.join(root, '.aegis/codex-orchestra', `${run.id}.json`), JSON.stringify(run));
}

test('persisted done run cannot conceal unfinished tasks', () => fixture((root, orchestra) => {
  const run = orchestra.create(plan(), { maxWorkers: 1 });
  run.state = 'done';
  overwrite(root, run);
  assert.throws(() => orchestra.status(run.id), /persisted|state|unfinished/i);
}));

test('persisted escaped target scope is rejected before native dispatch', () => fixture((root, orchestra) => {
  const run = orchestra.create(plan(), { maxWorkers: 1 });
  run.tasks[0].targetFiles = ['../outside.ts'];
  overwrite(root, run);
  assert.throws(() => orchestra.dispatch(run.id), /scope|target|persisted/i);
}));

test('directory scope cannot overlap a separate file task unnoticed', () => fixture((root, orchestra) => {
  fs.mkdirSync(path.join(root, 'src'));
  assert.throws(() => orchestra.create(plan(['src']), { maxWorkers: 1 }), /directory|file|target/i);
}));

test('forward phase dependency is rejected rather than waiting forever', () => fixture((_root, orchestra) => {
  const input = plan();
  input.tracks.push({ ...input.tracks[0], id: 'later', phase: 2 });
  input.tracks[0].dependsOn = ['later'];
  assert.throws(() => orchestra.create(input, { maxWorkers: 2 }), /later phase/i);
}));

test('parent-child dependency cycle leaves the running parent unchanged', () => fixture((_root, orchestra) => {
  const run = orchestra.create(plan(), { maxWorkers: 2 });
  orchestra.dispatch(run.id);
  orchestra.acknowledge(run.id, 'parent', 'native-parent');
  assert.throws(() => orchestra.delegate(run.id, 'parent', [
    { id: 'child', title: 'Dependent child', targetFiles: [], dependsOn: ['parent'] }
  ]), /cyclic/i);
  const current = orchestra.status(run.id);
  assert.equal(current.tasks.length, 1);
  assert.equal(current.tasks[0].state, 'running');
}));
