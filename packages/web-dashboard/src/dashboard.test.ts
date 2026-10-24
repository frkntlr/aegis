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
  assert.ok(html.includes('set-primary-branch'));
  assert.ok(html.includes('branch-badge'));
  assert.ok(html.includes('reclaim_orphans'));
  assert.ok(html.includes('handleDrop'));
});

test('SessionDetector accurately detects worktree sessions and registers heartbeats', () => {
  const detector = new SessionDetector();
  const sessions = detector.detectSessions();
  assert.ok(Array.isArray(sessions));
  assert.ok(sessions.length >= 2);
  assert.ok(sessions.some(s => s.agentName === 'solver'));

  detector.registerHeartbeat('solver', 'Google Antigravity');
  const updated = detector.detectSessions();
  const solver = updated.find(s => s.agentName === 'solver');
  assert.strictEqual(solver?.ideType, 'Google Antigravity');
});

test('RealtimeMetricsService manages dynamic issues and calculates real AST metrics', async () => {
  const metrics = new RealtimeMetricsService({ offline: true });
  const initial = metrics.getIssues();
  assert.ok(initial.length >= 2);

  const created = await metrics.createIssue('Test Dynamic Task', ['src/test.ts']);
  assert.strictEqual(created.title, 'Test Dynamic Task');
  assert.strictEqual(created.status, 'ready');

  const assigned = metrics.moveTask(created.number, 'in_progress', 'solver', 'Google Antigravity');
  assert.strictEqual(assigned?.status, 'in_progress');
  assert.strictEqual(assigned?.assignedAgent, 'solver');

  const completed = metrics.moveTask(created.number, 'done');
  assert.strictEqual(completed?.status, 'done');

  const ast = metrics.computeAstMetrics();
  assert.ok(ast.filesScanned > 0);
  assert.ok(ast.savingsPercent >= 0);

  const cage = metrics.computeCageMetrics();
  assert.ok(cage.label.includes('Uyumlu'));
});

test('AegisEngineService executes all underlying Aegis core tools successfully', async () => {
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

  const mcp = engine.runMcpSecurity('solver', 'ast_skeleton');
  assert.strictEqual(mcp.allowed, true);

  const diff = await engine.runDiffValidator();
  assert.strictEqual(diff.isSurgical, true);

  const oracle = await engine.runOracleAudit();
  assert.strictEqual(oracle.suspicious, false);
});

test('AegisEngineService loads Godot telemetry with nodes array accurately', () => {
  const engine = new AegisEngineService();
  const tmpFile = path.join(os.tmpdir(), `aegis-telemetry-test-${Date.now()}.json`);
  const godotPayload = {
    viewport: { width: 1080, height: 1920, aspectRatio: '9:16' },
    nodes: [
      { id: '/root/Main', name: 'Main', rect: { x: 0, y: 0, width: 720, height: 1280 } },
      { id: '/root/Main/Btn', name: 'Btn', rect: { x: 50, y: 100, width: 200, height: 60 } }
    ]
  };
  fs.writeFileSync(tmpFile, JSON.stringify(godotPayload), 'utf8');
  try {
    const res = engine.runUiInspector(tmpFile);
    assert.strictEqual(res.tool, 'ui_inspector');
    assert.strictEqual(res.elementsChecked, 2);
    assert.strictEqual(res.passed, true);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('DashboardServer handles move_task and status via API', async () => {
  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    assert.ok(port > 0);
    const apiRes = await fetch(`http://localhost:${port}/api/status`);
    assert.strictEqual(apiRes.status, 200);
    const data = (await apiRes.json()) as { issues: Array<{ number: number }> };
    assert.ok(data.issues.length >= 2);
    const testNum = data.issues[0].number;

    const moveRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move_task', issueNumber: testNum, targetStatus: 'in_progress', agentName: 'solver' })
    });
    assert.strictEqual(moveRes.status, 200);
    const moveData = (await moveRes.json()) as { success: boolean };
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
  const server = new DashboardServer({ port: 0, repoRoot: tmpDir, offline: true });
  const port = await server.start();
  try {
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

test('DashboardServer handles save_settings and reclaim_orphans via API', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-dash-set-'));
  const server = new DashboardServer({ port: 0, repoRoot: tmpDir, offline: true });
  const port = await server.start();
  try {
    const setRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_settings', settings: { primaryBranch: 'master' } })
    });
    assert.strictEqual(setRes.status, 200);
    const setData = (await setRes.json()) as { settings: { primaryBranch: string } };
    assert.strictEqual(setData.settings.primaryBranch, 'master');

    const recRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reclaim_orphans' })
    });
    assert.strictEqual(recRes.status, 200);
    const recData = (await recRes.json()) as { success: boolean };
    assert.strictEqual(recData.success, true);
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

  const moved = kanban.updateIssueStatus(created.number, 'in_progress', 'solver');
  assert.strictEqual(moved?.status, 'in_progress');
  assert.strictEqual(moved?.assignedAgent, 'solver');

  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    const res = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync_github' })
    });
    assert.strictEqual(res.status, 200);
    const d = (await res.json()) as { success: boolean; issues: unknown[] };
    assert.strictEqual(d.success, true);
    assert.ok(d.issues.length >= 2);

    const autoRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto' })
    });
    assert.strictEqual(autoRes.status, 200);
    const autoData = (await autoRes.json()) as { success: boolean; message: string };
    assert.strictEqual(typeof autoData.success, 'boolean');
    assert.ok(typeof autoData.message === 'string');
  } finally {
    await server.stop();
  }
});

test('GitHubKanbanService persists local issues to disk and reloads them', async () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-kanban-persist-'));
  try {
    const kanban1 = new GitHubKanbanService({ repoRoot: tmpRepo, offline: true });
    const created = await kanban1.createIssue('Persistent Task', ['src/persist.ts']);
    kanban1.updateIssueStatus(created.number, 'in_progress', 'solver');

    const issuesFile = path.resolve(tmpRepo, '.aegis', 'issues.json');
    assert.ok(fs.existsSync(issuesFile));

    const kanban2 = new GitHubKanbanService({ repoRoot: tmpRepo, offline: true });
    const loaded = kanban2.getIssues();
    const found = loaded.find(i => i.number === created.number);
    assert.ok(found);
    assert.strictEqual(found?.title, 'Persistent Task');
    assert.strictEqual(found?.status, 'in_progress');
    assert.strictEqual(found?.assignedAgent, 'solver');
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});
