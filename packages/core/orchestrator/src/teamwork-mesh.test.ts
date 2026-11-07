import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkMesh } from './teamwork-mesh.js';
import type { TeamworkTrack } from './teamwork-types.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-mesh-test-'));
}

function createMockTracks(): TeamworkTrack[] {
  return [
    {
      id: 'track-1',
      roleType: 'solver',
      subagentName: 'issue-solver [Core]',
      title: 'Core Parser',
      targetFiles: ['src/parser.ts'],
      prompt: 'test',
      invocationPayload: { TypeName: 'issue-solver', Role: 'Core', Prompt: 'p', Workspace: 'inherit', Model: 'flash' },
      dependsOn: [],
      phase: 1
    },
    {
      id: 'track-2',
      roleType: 'ui',
      subagentName: 'ui-specialist [UI]',
      title: 'HUD UI',
      targetFiles: ['res://ui.tscn'],
      prompt: 'test',
      invocationPayload: { TypeName: 'ui-specialist', Role: 'UI', Prompt: 'p', Workspace: 'inherit', Model: 'flash' },
      dependsOn: [],
      phase: 1
    }
  ];
}

test('TeamworkMesh initializes mesh state and records initial event', () => {
  const tmp = createTempDir();
  try {
    const mesh = new TeamworkMesh(tmp);
    const state = mesh.initializeMesh('plan-123', 'Build core parser and UI', createMockTracks());
    assert.strictEqual(state.planId, 'plan-123');
    assert.strictEqual(state.activeWave, 1);
    assert.strictEqual(Object.keys(state.agents).length, 2);
    assert.ok(state.agents['issue-solver [Core]']);
    assert.strictEqual(state.agents['issue-solver [Core]'].status, 'pending');
    assert.ok(state.events.length > 0);
    assert.strictEqual(state.events[0].type, 'milestone');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMesh posts activity updates and appends heartbeat events', () => {
  const tmp = createTempDir();
  try {
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-456', 'Task', []);

    const updated = mesh.postActivity('issue-solver', {
      status: 'working',
      activity: 'Refactoring AST parser functions',
      modifiedFiles: ['src/parser.ts'],
      publishedContracts: ['parseAST', 'ASTNode']
    });

    assert.strictEqual(updated.agentId, 'issue-solver');
    assert.strictEqual(updated.status, 'working');
    assert.strictEqual(updated.currentActivity, 'Refactoring AST parser functions');
    assert.ok(updated.modifiedFiles.includes('src/parser.ts'));
    assert.ok(updated.publishedContracts.includes('parseAST'));

    const events = mesh.getEvents();
    assert.ok(events.some(e => e.fromAgent === 'issue-solver' && e.message.includes('Refactoring AST')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMesh broadcasts messages and can clear mesh file', () => {
  const tmp = createTempDir();
  try {
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-789', 'Task', []);

    const ev = mesh.broadcastEvent('qa-hunter', 'Found 0 regressions in test suite', 'milestone');
    assert.strictEqual(ev.fromAgent, 'qa-hunter');
    assert.strictEqual(ev.type, 'milestone');

    const peers = mesh.listPeers();
    assert.ok(Array.isArray(peers));

    assert.ok(fs.existsSync(mesh.getMeshPath()));
    mesh.clearMesh();
    assert.strictEqual(fs.existsSync(mesh.getMeshPath()), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMesh generates ultra-low token getCompactMeshState', () => {
  const tmp = createTempDir();
  try {
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-compact', 'Optimize engine', createMockTracks());
    mesh.postActivity('issue-solver [Core]', {
      status: 'working',
      activity: 'Editing parser',
      modifiedFiles: ['src/parser.ts'],
      publishedContracts: ['Token']
    });

    const compact = mesh.getCompactMeshState();
    assert.ok(compact.includes('[MESH:plan-compact|W1|Peers:2]'));
    assert.ok(compact.includes('@issue-solver [Core][working]:"Editing parser"'));
    assert.ok(compact.includes('|mod:[src/parser.ts]'));
    assert.ok(compact.includes('|c:[Token]'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMesh detects file collisions and triggers conflict warning event', () => {
  const tmp = createTempDir();
  try {
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-conflict', 'Conflict test', createMockTracks());

    mesh.postActivity('ui-specialist [UI]', {
      status: 'working',
      activity: 'Injecting UI parser bridge',
      modifiedFiles: ['src/parser.ts']
    });

    const conflicts = mesh.detectConflicts();
    assert.ok(conflicts.length > 0);
    assert.ok(conflicts.some(c => c.file === 'src/parser.ts'));

    const events = mesh.getEvents();
    assert.ok(events.some(e => e.message.includes('CONFLICT_WARNING')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMesh advances activeWave when current wave peers report done with custom activity text', () => {
  const tmp = createTempDir();
  try {
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-wave-custom', 'Custom wave progression', [
      {
        id: 'w1',
        roleType: 'solver',
        subagentName: 'solver-custom',
        title: 'Core Parser',
        targetFiles: [],
        prompt: 'p',
        invocationPayload: { TypeName: 'solver', Role: 'c', Prompt: 'p', Workspace: 'inherit', Model: 'flash' },
        dependsOn: [],
        phase: 1
      }
    ]);

    assert.strictEqual(mesh.getMeshState().activeWave, 1);
    mesh.postActivity('solver-custom', { status: 'done', activity: 'Refactored AST and verified Demir Kafes' });

    assert.strictEqual(mesh.getMeshState().activeWave, 2);
    const events = mesh.getEvents();
    assert.ok(events.some(e => e.message.includes('Wave 1 completed! Wave 2 unlocked.')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMesh deduplicates redundant heartbeats and suppresses unnecessary writes', () => {
  const tmp = createTempDir();
  try {
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-dedup', 'Dedup test', createMockTracks());
    const initial = mesh.postActivity('issue-solver [Core]', { status: 'working', activity: 'Working on AST' });
    const stat1 = fs.statSync(mesh.getMeshPath());

    const second = mesh.postActivity('issue-solver [Core]', { status: 'working', activity: 'Working on AST' });
    const stat2 = fs.statSync(mesh.getMeshPath());

    assert.strictEqual(initial.updatedAt, second.updatedAt);
    assert.strictEqual(stat1.mtimeMs, stat2.mtimeMs, 'File mtime should not change for no-op heartbeat');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMesh detects AST section collisions with full file targets', () => {
  const tmp = createTempDir();
  try {
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-ast-conflict', 'AST Conflict test', [
      {
        id: 'track-1',
        roleType: 'solver',
        subagentName: 'solver-logic',
        title: 'Logic',
        targetFiles: ['src/feature.ts#logic'],
        prompt: 'p',
        invocationPayload: { TypeName: 'solver', Role: 'l', Prompt: 'p', Workspace: 'inherit', Model: 'flash' },
        dependsOn: [],
        phase: 1
      },
      {
        id: 'track-2',
        roleType: 'solver',
        subagentName: 'solver-full',
        title: 'Full',
        targetFiles: ['src/feature.ts'],
        prompt: 'p',
        invocationPayload: { TypeName: 'solver', Role: 'f', Prompt: 'p', Workspace: 'inherit', Model: 'flash' },
        dependsOn: [],
        phase: 1
      }
    ]);

    const conflicts = mesh.detectConflicts();
    assert.ok(conflicts.length > 0);
    assert.ok(conflicts.some(c => c.agents.includes('solver-logic') && c.agents.includes('solver-full')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkMesh synchronizes concurrent posts across multiple instances atomically', () => {
  const tmp = createTempDir();
  try {
    const meshA = new TeamworkMesh(tmp);
    const meshB = new TeamworkMesh(tmp);
    meshA.initializeMesh('plan-concurrent', 'Concurrent test', []);

    meshA.postActivity('agent-A', { status: 'working', activity: 'Task A' });
    meshB.postActivity('agent-B', { status: 'working', activity: 'Task B' });

    const state = meshA.getMeshState();
    assert.ok(state.agents['agent-A']);
    assert.ok(state.agents['agent-B']);
    assert.strictEqual(state.agents['agent-A'].currentActivity, 'Task A');
    assert.strictEqual(state.agents['agent-B'].currentActivity, 'Task B');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
