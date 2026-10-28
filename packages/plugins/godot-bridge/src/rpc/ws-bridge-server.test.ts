import { test } from 'node:test';
import * as assert from 'node:assert';
import * as net from 'node:net';
import { WsFrameCodec } from './ws-frame-codec.js';
import { WsBridgeServer } from './ws-bridge-server.js';

test('WsFrameCodec encodes and decodes text frames with masking', () => {
  const original = 'Hello from Godot Aegis Bridge!';
  const encoded = WsFrameCodec.encodeTextFrame(original);
  assert.ok(encoded.length > original.length);

  // Simulate masked client frame
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const payload = Buffer.from(original, 'utf8');
  const maskedPayload = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    maskedPayload[i] = payload[i] ^ mask[i % 4];
  }

  const clientFrame = Buffer.concat([
    Buffer.from([0x81, 0x80 | payload.length]), // FIN + text + MASK flag
    mask,
    maskedPayload
  ]);

  const { frames } = WsFrameCodec.decodeFrames(clientFrame);
  assert.strictEqual(frames.length, 1);
  assert.strictEqual(frames[0].opcode, 1);
  assert.strictEqual(frames[0].payload.toString('utf8'), original);
});

test('WsBridgeServer starts, rejects invalid token, and accepts valid handshake', async () => {
  const token = 'test-token-1234567890abcdef1234';
  const server = new WsBridgeServer({ port: 0, sessionToken: token });
  const port = await server.start();
  assert.ok(port > 0);
  assert.strictEqual(server.getSessionToken(), token);

  // Test 1: Invalid token rejected with 401
  const badConn = net.createConnection({ port, host: '127.0.0.1' });
  await new Promise<void>((resolve) => {
    badConn.on('connect', () => {
      badConn.write('GET /?token=wrong HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
    });
    badConn.on('data', (d) => {
      assert.ok(d.toString().includes('401 Unauthorized'));
      badConn.destroy();
      resolve();
    });
  });

  // Test 2: Valid token handshake accepted with 101
  const goodConn = net.createConnection({ port, host: '127.0.0.1' });
  await new Promise<void>((resolve) => {
    goodConn.on('connect', () => {
      goodConn.write(`GET /?token=${token} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
    });
    goodConn.on('data', (d) => {
      assert.ok(d.toString().includes('101 Switching Protocols'));
      assert.strictEqual(server.isClientConnected(), true);
      goodConn.destroy();
      resolve();
    });
  });

  await server.stop();
});

test('WsBridgeServer executes commands and matches responses', async () => {
  const token = 'exec-token-abc';
  const server = new WsBridgeServer({ port: 0, sessionToken: token });
  const port = await server.start();

  const client = net.createConnection({ port, host: '127.0.0.1' });
  await new Promise<void>((resolve) => {
    client.on('connect', () => {
      client.write(`GET /?token=${token} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
    });
    client.once('data', () => resolve());
  });

  client.on('data', (chunk) => {
    const { frames } = WsFrameCodec.decodeFrames(chunk);
    for (const f of frames) {
      if (f.opcode === 1) {
        const req = JSON.parse(f.payload.toString('utf8'));
        // Send back masked response
        const respText = JSON.stringify({ id: req.id, success: true, data: { pong: true } });
        const mask = Buffer.from([0x01, 0x02, 0x03, 0x04]);
        const p = Buffer.from(respText, 'utf8');
        const masked = Buffer.alloc(p.length);
        for (let i = 0; i < p.length; i++) masked[i] = p[i] ^ mask[i % 4];
        client.write(Buffer.concat([Buffer.from([0x81, 0x80 | p.length]), mask, masked]));
      }
    }
  });

  const res = await server.executeCommand({ id: 'cmd-1', action: 'ping' });
  assert.strictEqual(res.success, true);
  assert.strictEqual((res.data as Record<string, unknown>)?.pong, true);

  client.destroy();
  await server.stop();
});
