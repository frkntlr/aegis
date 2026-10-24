import { test } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import { GodotBridgeServer } from './rpc/rpc-server.js';
import type { GodotUiTreePayload } from './rpc/rpc-types.js';

function httpPost(url: string, data: unknown): Promise<{ status: number; body: any }> {
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
          resolve({ status: res.statusCode || 0, body: raw ? JSON.parse(raw) : {} });
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpGet(url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: raw ? JSON.parse(raw) : {} });
      });
    }).on('error', reject);
  });
}

test('GodotBridgeServer handles status check', async () => {
  const server = new GodotBridgeServer({ port: 6861 });
  await server.start();
  try {
    const res = await httpGet('http://127.0.0.1:6861/status');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'running');
  } finally {
    await server.stop();
  }
});

test('GodotBridgeServer handles telemetry dispatch and retrieval', async () => {
  let received: GodotUiTreePayload | null = null;
  const server = new GodotBridgeServer({
    port: 6862,
    onTelemetryReceived: (p) => { received = p; }
  });
  await server.start();
  try {
    const payload: GodotUiTreePayload = {
      viewport: { width: 1920, height: 1080, aspectRatio: '16:9' },
      nodes: [{ id: 'b1', name: 'StartBtn', type: 'Button', visible: true, rect: { x: 0, y: 0, width: 100, height: 40 } }]
    };
    const postRes = await httpPost('http://127.0.0.1:6862/telemetry', payload);
    assert.strictEqual(postRes.status, 200);
    assert.ok(received !== null);

    const getRes = await httpGet('http://127.0.0.1:6862/telemetry/latest');
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.telemetry.nodes.length, 1);
  } finally {
    await server.stop();
  }
});
