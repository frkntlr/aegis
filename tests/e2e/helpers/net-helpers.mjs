import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as crypto from 'node:crypto';

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

export function httpRequest(url, opts = {}) {
  const parsed = new URL(url);
  const client = parsed.protocol === 'https:' ? https : http;
  const timeoutMs = opts.timeoutMs ?? 5000;
  return new Promise((resolve, reject) => {
    const req = client.request(parsed, {
      method: opts.method ?? 'GET',
      headers: opts.headers ?? {}
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const rawSetCookies = Array.isArray(res.headers['set-cookie'])
          ? res.headers['set-cookie']
          : [];
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          rawSetCookies,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`HTTP timeout after ${timeoutMs}ms: ${url}`));
    });
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

export async function waitForHttpReady(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await httpRequest(url, { timeoutMs: 1000 });
      if (res.status >= 200 && res.status < 500) return res;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  const msg = lastErr instanceof Error ? lastErr.message : 'Server did not become ready';
  throw new Error(`waitForHttpReady failed for ${url} within ${timeoutMs}ms: ${msg}`);
}

function buildWsUpgradeRequest(port, reqPath, originHeader) {
  const key = crypto.randomBytes(16).toString('base64');
  const lines = [
    `GET ${reqPath} HTTP/1.1`,
    `Host: 127.0.0.1:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13'
  ];
  if (originHeader !== undefined) lines.push(`Origin: ${originHeader}`);
  lines.push('', '');
  return lines.join('\r\n');
}

function parseHandshakeHead(rawHead) {
  const statusLine = rawHead.split('\r\n')[0] ?? '';
  const match = statusLine.match(/^HTTP\/\d\.\d\s+(\d+)/);
  const statusCode = match ? Number.parseInt(match[1], 10) : 0;
  return { statusLine, statusCode, accepted: statusCode === 101, rawHead };
}

export function wsHandshakeProbe(port, reqPath = '/', originHeader = undefined) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let buf = '';
    let settled = false;
    const finish = (err, data) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(data);
    };
    socket.setTimeout(3000, () => finish(new Error('WebSocket handshake timed out')));
    socket.on('error', (err) => finish(err));
    socket.on('connect', () => {
      socket.write(buildWsUpgradeRequest(port, reqPath, originHeader));
    });
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const idx = buf.indexOf('\r\n\r\n');
      if (idx !== -1) finish(null, parseHandshakeHead(buf.slice(0, idx)));
    });
    socket.on('end', () => {
      if (!settled) finish(null, parseHandshakeHead(buf));
    });
  });
}
