import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DashboardServer } from './server/dashboard-server.js';
import { SessionDetector } from './server/session-detector.js';
import { RealtimeMetricsService } from './server/realtime-metrics.js';
import { AegisEngineService } from './server/engine-service.js';
import { GitHubKanbanService } from './server/github-kanban.js';
import { getDashboardHtml } from './ui/dashboard-html.js';

test('getDashboardHtml renders essential dashboard sections and drag-drop support', () => {
  const html = getDashboardHtml();
  assert.ok(html.includes('AEGIS'));
  assert.ok(html.includes('Command Center'));
  assert.ok(html.includes('col-ready'));
  assert.ok(html.includes('col-in_progress'));
  assert.ok(html.includes('modal-new-task'));
  assert.ok(html.includes('modal-engines'));
  assert.ok(html.includes('modal-settings'));
  assert.ok(html.includes('handleDrop'));
});

test('SessionDetector accurately detects worktree sessions and registers heartbeats', () => {
  const detector = new SessionDetector();
  const sessions = detector.detectSessions();
  assert.ok(Array.isArray(sessions));
  assert.ok(sessions.length >= 2);
  assert.ok(sessions.some(s => s.agentName === 'alice'));

  detector.registerHeartbeat('alice', 'Google Antigravity');
  const updated = detector.detectSessions();
  const alice = updated.find(s => s.agentName === 'alice');
  assert.strictEqual(alice?.ideType, 'Google Antigravity');
});

test('RealtimeMetricsService manages dynamic issues and calculates real AST metrics', async () => {
  const metrics = new RealtimeMetricsService();
  const initial = metrics.getIssues();
  assert.ok(initial.length >= 2);

  const created = await metrics.createIssue('Test Dynamic Task', ['src/test.ts']);
  assert.strictEqual(created.title, 'Test Dynamic Task');
  assert.strictEqual(created.status, 'ready');

  const assigned = metrics.moveTask(created.number, 'in_progress', 'alice', 'Google Antigravity');
  assert.strictEqual(assigned?.status, 'in_progress');
  assert.strictEqual(assigned?.assignedAgent, 'alice');

  const completed = metrics.moveTask(created.number, 'done');
  assert.strictEqual(completed?.status, 'done');

  const ast = metrics.computeAstMetrics();
  assert.ok(ast.filesScanned > 0);
  assert.ok(ast.savingsPercent >= 0);

  const cage = metrics.computeCageMetrics();
  assert.ok(cage.label.includes('Uyumlu'));
});

test('AegisEngineService executes all underlying Aegis core tools successfully', () => {
  const engine = new AegisEngineService();
  const ui = engine.runUiInspector();
  assert.strictEqual(ui.tool, 'ui_inspector');
  assert.strictEqual(ui.visionTokens, 0);

  const mut = engine.runMutationGate();
  assert.strictEqual(mut.tool, 'mutation_gate');
  assert.strictEqual(mut.passed, true);

  const est = engine.runAdaptiveTimeout(2, 3);
  assert.strictEqual(est.tool, 'adaptive_timeout');
  assert.ok(est.timeoutSeconds > 0);

  const mcp = engine.runMcpSecurity('alice', 'ast_skeleton');
  assert.strictEqual(mcp.allowed, true);

  const diff = engine.runDiffValidator();
  assert.strictEqual(diff.isSurgical, true);

  const oracle = engine.runOracleAudit();
  assert.strictEqual(oracle.suspicious, false);
});

test('DashboardServer handles move_task and status via API', async () => {
  const server = new DashboardServer({ port: 0 });
  const port = await server.start();
  try {
    assert.ok(port > 0);
    const apiRes = await fetch(`http://localhost:${port}/api/status`);
    assert.strictEqual(apiRes.status, 200);
    const data = await apiRes.json() as any;
    assert.ok(data.issues.length >= 2);
    const testNum = data.issues[0].number;

    const moveRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move_task', issueNumber: testNum, targetStatus: 'in_progress', agentName: 'alice' })
    });
    assert.strictEqual(moveRes.status, 200);
    const moveData = await moveRes.json() as any;
    assert.strictEqual(moveData.success, true);

    const doneRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move_task', issueNumber: testNum, targetStatus: 'done' })
    });
    assert.strictEqual(doneRes.status, 200);
  } finally {
    await server.stop();
  }
});

test('DashboardServer handles run_engine_tool and sync_toolchain via API', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-dash-sync-'));
  const server = new DashboardServer({ port: 0, repoRoot: tmpDir });
  const port = await server.start();
  try {
    assert.ok(port > 0);
    const toolRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'run_engine_tool', tool: 'ui_inspector' })
    });
    assert.strictEqual(toolRes.status, 200);

    const syncRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_toolchain' })
    });
    assert.strictEqual(syncRes.status, 200);
  } finally {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('GitHubKanbanService manages issues and sync_github responds via API', async () => {
  const kanban = new GitHubKanbanService({ offline: true });
  const issues = await kanban.fetchLiveIssues();
  assert.ok(issues.length >= 2);
  const created = await kanban.createIssue('Test Offline Issue', ['src/off.ts']);
  assert.strictEqual(created.title, 'Test Offline Issue');
  assert.strictEqual(created.status, 'ready');

  const moved = kanban.updateIssueStatus(created.number, 'in_progress', 'alice');
  assert.strictEqual(moved?.status, 'in_progress');
  assert.strictEqual(moved?.assignedAgent, 'alice');

  const server = new DashboardServer({ port: 0 });
  const port = await server.start();
  try {
    const res = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_github' })
    });
    assert.strictEqual(res.status, 200);
    const d = await res.json() as any;
    assert.strictEqual(d.success, true);
    assert.ok(d.issues.length >= 2);
  } finally {
    await server.stop();
  }
});
