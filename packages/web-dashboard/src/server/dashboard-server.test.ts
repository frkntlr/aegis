import { test } from 'node:test';
import * as assert from 'node:assert';
import { DashboardServer } from './dashboard-server.js';

test('DashboardServer returns 404 for unknown routes', async () => {
  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    const res = await fetch(`http://localhost:${port}/unknown-path-12345`);
    assert.strictEqual(res.status, 404);
  } finally {
    await server.stop();
  }
});

test('DashboardServer rejects invalid JSON on /api/action with 400', async () => {
  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    const res = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json {'
    });
    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as { error?: string };
    assert.ok(body.error);
  } finally {
    await server.stop();
  }
});

test('DashboardServer serves SSE event stream on /api/events', async () => {
  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`http://localhost:${port}/api/events`, {
      signal: controller.signal
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'text/event-stream');

    const reader = res.body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      const chunk = new TextDecoder().decode(value);
      assert.ok(chunk.includes('event: snapshot'));
      assert.ok(chunk.includes('data: {'));
      reader.cancel();
    }
    clearTimeout(timeout);
  } finally {
    await server.stop();
  }
});
