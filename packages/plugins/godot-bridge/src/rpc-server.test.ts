import { test } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import { GodotBridgeServer } from './rpc/rpc-server.js';
import type { GodotUiTreePayload } from './rpc/rpc-types.js';

function httpPost<T = Record<string, unknown>>(url: string, data: unknown): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const postData = JSON.stringify(data);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, body: (raw ? JSON.parse(raw) : {}) as T });
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpGet<T = Record<string, unknown>>(url: string): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: (raw ? JSON.parse(raw) : {}) as T });
      });
    }).on('error', reject);
  });
}

test('GodotBridgeServer handles status check', async () => {
  const server = new GodotBridgeServer({ port: 0 });
  const port = await server.start();
  try {
    const res = await httpGet<{ status: string }>(`http://127.0.0.1:${port}/status`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'running');
  } finally {
    await server.stop();
  }
});

test('GodotBridgeServer handles telemetry dispatch and retrieval', async () => {
  let received: GodotUiTreePayload | null = null;
  const server = new GodotBridgeServer({
    port: 0,
    onTelemetryReceived: (p) => { received = p; }
  });
  const port = await server.start();
  try {
    const payload: GodotUiTreePayload = {
      viewport: { width: 1920, height: 1080, aspectRatio: '16:9' },
      nodes: [{ id: 'b1', name: 'StartBtn', type: 'Button', visible: true, rect: { x: 0, y: 0, width: 100, height: 40 } }]
    };
    const postRes = await httpPost(`http://127.0.0.1:${port}/telemetry`, payload);
    assert.strictEqual(postRes.status, 200);
    assert.ok(received !== null);

    const getRes = await httpGet<{ telemetry: GodotUiTreePayload }>(`http://127.0.0.1:${port}/telemetry/latest`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.telemetry.nodes.length, 1);
  } finally {
    await server.stop();
  }
});

test('GodotBridgeServer handles command queueing, polling and result retrieval', async () => {
  const server = new GodotBridgeServer({ port: 0 });
  const port = await server.start();
  try {
    const queueRes = await httpPost(`http://127.0.0.1:${port}/command/queue`, {
      id: 'cmd-42',
      action: 'get_ui_tree'
    });
    assert.strictEqual(queueRes.status, 200);

    const pollRes = await httpGet<{ command: { id: string; action: string } | null }>(`http://127.0.0.1:${port}/command/poll`);
    assert.strictEqual(pollRes.status, 200);
    assert.ok(pollRes.body.command !== null);
    assert.strictEqual(pollRes.body.command.id, 'cmd-42');
    assert.strictEqual(pollRes.body.command.action, 'get_ui_tree');

    const resultPost = await httpPost(`http://127.0.0.1:${port}/command/result`, {
      id: 'cmd-42',
      success: true,
      data: { acknowledged: true }
    });
    assert.strictEqual(resultPost.status, 200);

    const resultGet = await httpGet<{ result: { id: string; success: boolean } | null }>(`http://127.0.0.1:${port}/command/result?id=cmd-42`);
    assert.strictEqual(resultGet.status, 200);
    assert.ok(resultGet.body.result !== null);
    assert.strictEqual(resultGet.body.result.success, true);
  } finally {
    await server.stop();
  }
});

test('GodotBridgeServer executeCommand resolves on result and handles timeouts', async () => {
  const server = new GodotBridgeServer({ port: 0 });
  const port = await server.start();
  try {
    const promise = server.executeCommand({ id: 'cmd-test-1', action: 'ping' }, 2000);

    // Simulate game polling command and posting result
    const pollRes = await httpGet<{ command: { id: string } | null }>(`http://127.0.0.1:${port}/command/poll`);
    assert.strictEqual(pollRes.body.command?.id, 'cmd-test-1');

    await httpPost(`http://127.0.0.1:${port}/command/result`, {
      id: 'cmd-test-1',
      success: true,
      data: { pong: true }
    });

    const res = await promise;
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data, { pong: true });

    // Test timeout
    const timeoutRes = await server.executeCommand({ id: 'cmd-timeout', action: 'ping' }, 100);
    assert.strictEqual(timeoutRes.success, false);
    assert.ok(timeoutRes.error?.includes('timed out'));
  } finally {
    await server.stop();
  }
});
