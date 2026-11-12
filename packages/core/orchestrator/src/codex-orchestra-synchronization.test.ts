import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodexOrchestra } from './codex-orchestra.js';
import type { TeamworkPlan, TeamworkTrack } from './teamwork-types.js';

function track(id: string, files: string[]): TeamworkTrack {
  return { id, title: id, subagentName: id, roleType: 'solver', phase: 1, dependsOn: [],
    targetFiles: files, prompt: '', invocationPayload: {
      TypeName: 'issue-solver', Role: id, Prompt: '', Workspace: 'inherit', Model: 'inherit'
    } };
}

function fixture(run: (engine: CodexOrchestra) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-orchestra-sync-'));
  try { run(new CodexOrchestra(root)); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function plan(...tracks: TeamworkTrack[]): TeamworkPlan {
  return { planId: 'sync-plan', objective: 'Verify scoped parallel execution',
    createdAt: new Date().toISOString(), summary: '', tracks };
}

test('delegating preserves the parent scope until review while unrelated work continues', () => fixture(engine => {
  const run = engine.create(plan(track('parent', ['src/a.ts', 'src/b.ts']),
    track('conflicting-sibling', ['src/a.ts']), track('independent', ['src/c.ts'])), { maxWorkers: 3 });
  assert.deepEqual(engine.dispatch(run.id).map(item => item.taskId), ['parent', 'independent']);
  engine.acknowledge(run.id, 'parent', 'native-parent');
  engine.acknowledge(run.id, 'independent', 'native-independent');
  engine.delegate(run.id, 'parent', [{ id: 'child', title: 'Implement B', targetFiles: ['src/b.ts'] }]);
  assert.deepEqual(engine.dispatch(run.id).map(item => item.taskId), ['child']);
  engine.acknowledge(run.id, 'child', 'native-child');
  engine.finish(run.id, 'child', { success: true, evidence: 'B verified' });
  assert.deepEqual(engine.dispatch(run.id).map(item => item.taskId), ['parent']);
  engine.acknowledge(run.id, 'parent', 'native-parent');
  engine.finish(run.id, 'parent', { success: true, evidence: 'Reviewed child and parent scope' });
  assert.deepEqual(engine.dispatch(run.id).map(item => item.taskId), ['conflicting-sibling']);
}));

test('waiting ancestor scopes allow parallel grandchildren and block conflicting outsiders', () => fixture(engine => {
  const run = engine.create(plan(track('parent', ['src/a.ts', 'src/b.ts']),
    track('outsider', ['src/a.ts'])), { maxWorkers: 3 });
  engine.dispatch(run.id); engine.acknowledge(run.id, 'parent', 'native-parent');
  engine.delegate(run.id, 'parent', [{ id: 'child', title: 'Delegate implementation',
    targetFiles: ['src/a.ts', 'src/b.ts'] }]);
  assert.deepEqual(engine.dispatch(run.id).map(item => item.taskId), ['child']);
  engine.acknowledge(run.id, 'child', 'native-child');
  engine.delegate(run.id, 'child', [
    { id: 'grandchild-a', title: 'Implement A', targetFiles: ['src/a.ts'] },
    { id: 'grandchild-b', title: 'Implement B', targetFiles: ['src/b.ts'] }
  ]);
  assert.deepEqual(engine.dispatch(run.id).map(item => item.taskId), ['grandchild-a', 'grandchild-b']);
  assert.equal(engine.status(run.id).tasks.find(item => item.id === 'outsider')?.state, 'pending');
}));
