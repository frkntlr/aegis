import { test } from 'node:test';
import * as assert from 'node:assert';
import { DashboardServer } from './server/dashboard-server.js';
import { getDashboardHtml } from './ui/dashboard-html.js';

test('getDashboardHtml renders essential dashboard sections', () => {
  const html = getDashboardHtml();
  assert.ok(html.includes('AEGIS'));
  assert.ok(html.includes('Command Center'));
  assert.ok(html.includes('Token & Bağlam Termometresi'));
  assert.ok(html.includes('Deterministik Kalite Kalkanları'));
  assert.ok(html.includes('GitHub Projects Kanban Yansıması'));
});

test('DashboardServer starts and responds to HTTP requests', async () => {
  const server = new DashboardServer({ port: 3888 });
  const port = await server.start();
  assert.strictEqual(port, 3888);

  // Fetch UI
  const htmlRes = await fetch(`http://localhost:${port}/`);
  assert.strictEqual(htmlRes.status, 200);
  const htmlText = await htmlRes.text();
  assert.ok(htmlText.includes('AEGIS'));

  // Fetch Status JSON
  const apiRes = await fetch(`http://localhost:${port}/api/status`);
  assert.strictEqual(apiRes.status, 200);
  const data = await apiRes.json() as any;
  assert.strictEqual(data.qualityShields.tdd, 'PASS');
  assert.strictEqual(data.tokenMetrics.savingsPercent, 73);

  await server.stop();
});
