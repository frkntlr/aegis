import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { DashboardServer } from './dashboard-server.js';
import { isAllowedLocalOrigin, parseJsonObjectText, readJsonObjectBody, sendJsonError } from './server-security.js';

function sendRawRequest(
  port: number,
  method: string,
  reqPath: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: reqPath, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('DashboardServer returns 404 for unknown routes and 400 for invalid JSON', async () => {
  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    const res404 = await fetch(`http://localhost:${port}/unknown-path-12345`);
    assert.strictEqual(res404.status, 404);
    const res400 = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json {'
    });
    assert.strictEqual(res400.status, 400);
    const body = (await res400.json()) as { error?: string };
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
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`http://localhost:${port}/api/events`, { signal: controller.signal });
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

test('DashboardServer responds to OPTIONS preflight and allows valid local origins', async () => {
  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    const pre = await fetch(`http://localhost:${port}/api/action`, {
      method: 'OPTIONS',
      headers: { Origin: `http://localhost:${port}`, 'Access-Control-Request-Method': 'POST' }
    });
    assert.strictEqual(pre.status, 204);
    assert.strictEqual(pre.headers.get('access-control-allow-origin'), `http://localhost:${port}`);
    assert.ok(pre.headers.get('access-control-allow-methods')?.includes('OPTIONS'));
    for (const goodOrigin of [`http://localhost:${port}`, `http://127.0.0.1:${port}`, `http://[::1]:${port}`]) {
      const res = await sendRawRequest(port, 'GET', '/api/status', { Origin: goodOrigin });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['access-control-allow-origin'], goodOrigin);
    }
  } finally {
    await server.stop();
  }
});

test('DashboardServer blocks spoofed, userinfo, path, query, fragment, and https Origins with 403', async () => {
  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    const badOrigins = [
      'https://malicious-attacker.com',
      'http://localhost',
      'http://localhost:9999',
      `http://localhost.evil.com:${port}`,
      `http://evil@localhost:${port}`,
      `http://u:p@127.0.0.1:${port}`,
      `http://127.0.0.1:${port}/evilpath`,
      `http://localhost:${port}/`,
      `http://localhost:${port}?x=1`,
      `http://localhost:${port}#x`,
      `https://127.0.0.1:${port}`,
      `https://localhost:${port}`,
      'null',
      ''
    ];
    for (const origin of badOrigins) {
      const getRes = await sendRawRequest(port, 'GET', '/api/status', { Origin: origin });
      assert.strictEqual(getRes.status, 403, `Expected 403 GET for origin ${JSON.stringify(origin)}`);
      const postRes = await sendRawRequest(
        port, 'POST', '/api/action',
        { 'Content-Type': 'application/json', Origin: origin },
        JSON.stringify({ action: 'reclaim_orphans' })
      );
      assert.strictEqual(postRes.status, 403, `Expected 403 POST for origin ${JSON.stringify(origin)}`);
    }
  } finally {
    await server.stop();
  }
});

test('DashboardServer returns raw 413 without ECONNRESET on >1MB payloads and keeps serving', async () => {
  const server = new DashboardServer({ port: 0, offline: true });
  const port = await server.start();
  try {
    const largeBody = JSON.stringify({ action: 'reclaim_orphans', data: 'A'.repeat(1024 * 1024 + 500) });
    const rawRes = await sendRawRequest(port, 'POST', '/api/action', { 'Content-Type': 'application/json' }, largeBody);
    assert.strictEqual(rawRes.status, 413);
    assert.ok(rawRes.body.includes('Payload Too Large'));
    const fetchRes = await fetch(`http://localhost:${port}/api/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: largeBody
    });
    assert.strictEqual(fetchRes.status, 413);
    const followUp = await sendRawRequest(port, 'GET', '/api/status', {});
    assert.strictEqual(followUp.status, 200);
  } finally {
    await server.stop();
  }
});

test('DashboardServer validates JSON object bodies, focus workspacePath, and launch_ide containment', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-srv-sec-'));
  const server = new DashboardServer({ port: 0, repoRoot: tmpDir, offline: true });
  const port = await server.start();
  try {
    for (const badBody of ['null', '[]', '123', '{}']) {
      const res = await sendRawRequest(port, 'POST', '/api/action', { 'Content-Type': 'application/json' }, badBody);
      assert.strictEqual(res.status, 400);
    }
    const okAction = await sendRawRequest(port, 'POST', '/api/action', { 'Content-Type': 'application/json' }, JSON.stringify({ action: 'reclaim_orphans' }));
    assert.strictEqual(okAction.status, 200);
    for (const badFocus of [{}, { workspacePath: '   ' }, { workspacePath: 123 }]) {
      const res = await sendRawRequest(port, 'POST', '/api/projects/focus', { 'Content-Type': 'application/json' }, JSON.stringify(badFocus));
      assert.strictEqual(res.status, 400);
    }
    const gitProj = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-srv-git-'));
    fs.mkdirSync(path.join(gitProj, '.git'), { recursive: true });
    const okFocus = await sendRawRequest(port, 'POST', '/api/projects/focus', { 'Content-Type': 'application/json' }, JSON.stringify({ workspacePath: gitProj }));
    assert.strictEqual(okFocus.status, 200);
    fs.rmSync(gitProj, { recursive: true, force: true });
    assert.strictEqual(fs.existsSync(path.join(tmpDir, '.aegis', 'locks.json')), false);
    assert.ok((server.getStatusPayload('non-existent-id').activeProject as { id: string }).id);
    const wtEscape = await sendRawRequest(port, 'POST', '/api/action', { 'Content-Type': 'application/json' }, JSON.stringify({ action: 'launch_ide', worktreePath: '..\\outside' }));
    assert.strictEqual((JSON.parse(wtEscape.body) as { success: boolean }).success, false);
    const focusEscape = await sendRawRequest(port, 'POST', '/api/action', { 'Content-Type': 'application/json' }, JSON.stringify({ action: 'launch_ide', focusFile: '..\\..\\secret.txt' }));
    assert.strictEqual((JSON.parse(focusEscape.body) as { success: boolean }).success, false);
  } finally {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('server-security helpers handle empty JSON, non-object JSON, string chunks, and sendJsonError guards', async () => {
  assert.strictEqual(isAllowedLocalOrigin(undefined, 3000), true);
  assert.strictEqual(isAllowedLocalOrigin('not-a-url', 3000), false);
  assert.strictEqual(isAllowedLocalOrigin('http://localhost', 80), true);
  assert.strictEqual(isAllowedLocalOrigin('http://localhost:80', 80), false);
  assert.deepStrictEqual(parseJsonObjectText(''), {});
  assert.throws(() => parseJsonObjectText('null'), /Invalid JSON body/);
  assert.throws(() => parseJsonObjectText('[1]'), /Invalid JSON body/);

  const emitter = new EventEmitter() as EventEmitter & { complete: boolean };
  emitter.complete = true;
  const bodyPromise = readJsonObjectBody(emitter as unknown as http.IncomingMessage);
  emitter.emit('data', '{"ok":true}');
  emitter.emit('end');
  assert.deepStrictEqual(await bodyPromise, { ok: true });

  let writtenStatus = 0;
  let writtenBody = '';
  const fakeRes = {
    writableEnded: false, destroyed: false,
    writeHead(code: number) { writtenStatus = code; },
    end(chunk: string) { writtenBody = chunk; }
  } as unknown as http.ServerResponse;
  sendJsonError(fakeRes, 'plain string error');
  assert.strictEqual(writtenStatus, 400);
  assert.ok(writtenBody.includes('plain string error'));
  sendJsonError(fakeRes, { statusCode: 422, message: 'custom' });
  assert.strictEqual(writtenStatus, 422);
  const endedRes = { writableEnded: true, destroyed: false, writeHead() { throw new Error('should not write'); }, end() { return undefined; } } as unknown as http.ServerResponse;
  sendJsonError(endedRes, 'ignored');
});
