import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TeamworkReflectionEngine } from './teamwork-reflection.js';
import { TeamworkMesh } from './teamwork-mesh.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-reflect-test-'));
}

function initInbox(tmp: string, tasks: unknown[]): string {
  const aegisDir = path.join(tmp, '.aegis');
  fs.mkdirSync(aegisDir, { recursive: true });
  const p = path.join(aegisDir, 'task-inbox.json');
  fs.writeFileSync(p, JSON.stringify(tasks, null, 2), 'utf8');
  return p;
}

test('TeamworkReflectionEngine: detects blocked tasks and missing targets', () => {
  const tmp = createTempDir();
  try {
    initInbox(tmp, [{
      id: 101, issueNumber: 101, title: 'Network Bridge',
      role: 'issue-solver [Network]', targetFiles: ['src/bridge.ts'],
      status: 'blocked', prompt: 'test'
    }]);
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-ref-1', 'Build bridge', []);
    const engine = new TeamworkReflectionEngine(tmp, mesh);
    const result = engine.evaluateCompleteness('plan-ref-1');

    assert.strictEqual(result.isComplete, false);
    assert.strictEqual(result.totalTasks, 1);
    assert.strictEqual(result.blockedTasks, 1);
    assert.ok(result.gaps.some(g => g.type === 'blocked_task'));
    assert.ok(result.gaps.some(g => g.type === 'missing_target'));
    assert.ok(engine.formatReflectionReport(result).includes('INCOMPLETE'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkReflectionEngine: detects deep research needed from keywords', () => {
  const tmp = createTempDir();
  try {
    initInbox(tmp, []);
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-res-1', 'Perform deep dive research and mimari analiz', []);
    const engine = new TeamworkReflectionEngine(tmp, mesh);
    const result = engine.evaluateCompleteness('plan-res-1');

    const gap = result.gaps.find(g => g.type === 'research_needed');
    assert.ok(gap, 'Should flag research_needed gap');
    assert.strictEqual(gap?.suggestedRole, 'doc-architect [NLM-Researcher]');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkReflectionEngine: generates follow-up tasks into task inbox', () => {
  const tmp = createTempDir();
  try {
    const inboxPath = initInbox(tmp, []);
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-gen-1', 'Mission Objective', []);
    const engine = new TeamworkReflectionEngine(tmp, mesh);
    const gaps = [
      { id: 'g1', type: 'missing_target' as const, description: 'Missing c.ts', suggestedRole: 'issue-solver', targetFiles: ['c.ts'], priority: 'high' as const },
      { id: 'g2', type: 'missing_tests' as const, description: 'Missing test', suggestedRole: 'qa-hunter', targetFiles: ['c.test.ts'], priority: 'medium' as const }
    ];

    const followUps = engine.generateFollowUpTasks(gaps, 'plan-gen-1');
    assert.strictEqual(followUps.length, 2);
    const saved = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
    assert.strictEqual(saved.length, 2);
    assert.ok(mesh.getEvents().some(e => e.message.includes('follow-up task(s)')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkReflectionEngine: runFeedbackLoop advances wave when gaps exist', () => {
  const tmp = createTempDir();
  try {
    initInbox(tmp, [{ id: 50, issueNumber: 50, title: 'Task 50', role: 'solver', targetFiles: ['w.ts'], status: 'pending' }]);
    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-loop-1', 'Build widget', []);
    const engine = new TeamworkReflectionEngine(tmp, mesh);

    const loopRes = engine.runFeedbackLoop('plan-loop-1');
    assert.strictEqual(loopRes.waveAdvanced, true);
    assert.strictEqual(loopRes.currentWave, 2);
    assert.ok(loopRes.stagedCount > 0);
    assert.ok(engine.formatIterationReport(loopRes).includes('Wave 2'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TeamworkReflectionEngine: runFeedbackLoop completes cleanly when 100% satisfied', () => {
  const tmp = createTempDir();
  try {
    fs.writeFileSync(path.join(tmp, 'w.ts'), '// widget', 'utf8');
    fs.writeFileSync(path.join(tmp, 'w.test.ts'), '// test', 'utf8');
    initInbox(tmp, [{ id: 50, issueNumber: 50, title: 'Task 50', role: 'solver', targetFiles: ['w.ts'], status: 'done' }]);

    const mesh = new TeamworkMesh(tmp);
    mesh.initializeMesh('plan-loop-1', 'Build widget', []);
    const engine = new TeamworkReflectionEngine(tmp, mesh);

    const cleanEval = engine.evaluateCompleteness('plan-loop-1');
    assert.strictEqual(cleanEval.isComplete, true);
    assert.strictEqual(cleanEval.score, 100);

    const cleanLoop = engine.runFeedbackLoop('plan-loop-1');
    assert.strictEqual(cleanLoop.stagedCount, 0);
    assert.strictEqual(cleanLoop.waveAdvanced, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
