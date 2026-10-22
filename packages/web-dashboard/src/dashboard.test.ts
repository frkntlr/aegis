import { test } from 'node:test';
import * as assert from 'node:assert';
import { DashboardServer } from './server/dashboard-server.js';
import { SessionDetector } from './server/session-detector.js';
import { RealtimeMetricsService } from './server/realtime-metrics.js';
import { getDashboardHtml } from './ui/dashboard-html.js';

test('getDashboardHtml renders essential dashboard sections and SSE client', () => {
  const html = getDashboardHtml();
  assert.ok(html.includes('AEGIS'));
  assert.ok(html.includes('Command Center'));
  assert.ok(html.includes('Token & Bağlam Termometresi'));
  assert.ok(html.includes('Deterministik Kalite Kalkanları'));
  assert.ok(html.includes('EventSource(\'/api/events\')'));
  assert.ok(html.includes('Mulgravity'));
  assert.ok(html.includes('col-ready'));
  assert.ok(html.includes('col-in_progress'));
  assert.ok(html.includes('sendAction(\'scan_ast\')'));
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

test('RealtimeMetricsService manages dynamic issues and calculates real AST metrics', () => {
  const metrics = new RealtimeMetricsService();
  const initial = metrics.getIssues();
  assert.ok(initial.length >= 2);

  const created = metrics.createIssue('Test Dynamic Task', ['src/test.ts']);
  assert.strictEqual(created.title, 'Test Dynamic Task');
  assert.strictEqual(created.status, 'ready');

  const assigned = metrics.assignIssue(created.number, 'alice', 'Google Antigravity');
  assert.strictEqual(assigned?.status, 'in_progress');
  assert.strictEqual(assigned?.assignedAgent, 'alice');

  const completed = metrics.completeIssue(created.number);
  assert.strictEqual(completed?.status, 'done');

  const ast = metrics.computeAstMetrics();
  assert.ok(ast.filesScanned > 0);
  assert.ok(ast.savingsPercent >= 0);

  const cage = metrics.computeCageMetrics();
  assert.ok(cage.label.includes('Uyumlu'));
});

test('DashboardServer serves status, SSE streams, and handles interactive actions', async () => {
  const server = new DashboardServer({ port: 0 });
  const port = await server.start();
  try {
    assert.ok(port > 0);

    const apiRes = await fetch(`http://localhost:${port}/api/status`);
    assert.strictEqual(apiRes.status, 200);
    const data = await apiRes.json() as any;
    assert.strictEqual(data.qualityShields.tdd, 'PASS');
    assert.ok(Array.isArray(data.agents));
    assert.ok(Array.isArray(data.issues));
    assert.ok(data.issues.length >= 2);

    const actRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auto' })
    });
    assert.strictEqual(actRes.status, 200);
    const actData = await actRes.json() as any;
    assert.strictEqual(actData.success, true);

    const scanRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scan_ast' })
    });
    assert.strictEqual(scanRes.status, 200);
  } finally {
    await server.stop();
  }
});
