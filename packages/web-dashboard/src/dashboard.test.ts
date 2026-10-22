import { test } from 'node:test';
import * as assert from 'node:assert';
import { DashboardServer } from './server/dashboard-server.js';
import { SessionDetector } from './server/session-detector.js';
import { getDashboardHtml } from './ui/dashboard-html.js';

test('getDashboardHtml renders essential dashboard sections and SSE client', () => {
  const html = getDashboardHtml();
  assert.ok(html.includes('AEGIS'));
  assert.ok(html.includes('Command Center'));
  assert.ok(html.includes('Token & Bağlam Termometresi'));
  assert.ok(html.includes('Deterministik Kalite Kalkanları'));
  assert.ok(html.includes('EventSource(\'/api/events\')'));
  assert.ok(html.includes('Mulgravity'));
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

test('DashboardServer serves status, SSE streams, and handles interactive actions', async () => {
  const server = new DashboardServer({ port: 3889 });
  const port = await server.start();
  assert.strictEqual(port, 3889);

  // Status JSON
  const apiRes = await fetch(`http://localhost:${port}/api/status`);
  assert.strictEqual(apiRes.status, 200);
  const data = await apiRes.json() as any;
  assert.strictEqual(data.qualityShields.tdd, 'PASS');
  assert.ok(Array.isArray(data.agents));

  // Action POST
  const actRes = await fetch(`http://localhost:${port}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'heartbeat', agentName: 'bob', ideType: 'Cursor AI' })
  });
  assert.strictEqual(actRes.status, 200);
  const actData = await actRes.json() as any;
  assert.strictEqual(actData.success, true);

  await server.stop();
});
