/**
 * @file ws-bridge-server.ts
 * Sub-millisecond WebSocket Bridge Server for Godot 4.x with Ephemeral CSWSH Token Guard.
 * Demir Kafes: <300 lines/file, <40 lines/function.
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import type { Socket } from 'node:net';
import { WsFrameCodec } from './ws-frame-codec.js';
import type { GodotRpcRequest, GodotRpcResponse, GodotUiTreePayload } from './rpc-types.js';

export interface WsBridgeServerOptions {
  port?: number;
  host?: string;
  sessionToken?: string;
  onTelemetry?: (payload: GodotUiTreePayload) => void;
  onLog?: (log: { level: 'info' | 'warn' | 'error'; message: string }) => void;
}

export class WsBridgeServer {
  private server: http.Server | null = null;
  private port: number;
  private host: string;
  private sessionToken: string;
  private clientSocket: Socket | null = null;
  private socketBuffer = Buffer.alloc(0);
  private latestTelemetry: GodotUiTreePayload | null = null;
  private pendingCommands = new Map<string, (res: GodotRpcResponse) => void>();
  private onTelemetryCb?: (payload: GodotUiTreePayload) => void;
  private onLogCb?: (log: { level: 'info' | 'warn' | 'error'; message: string }) => void;

  constructor(options: WsBridgeServerOptions = {}) {
    this.port = options.port ?? 6850;
    this.host = options.host ?? '127.0.0.1';
    this.sessionToken = options.sessionToken ?? crypto.randomBytes(16).toString('hex');
    this.onTelemetryCb = options.onTelemetry;
    this.onLogCb = options.onLog;
  }

  public getPort(): number { return this.port; }
  public getSessionToken(): string { return this.sessionToken; }
  public isClientConnected(): boolean { return this.clientSocket !== null && !this.clientSocket.destroyed; }
  public getLatestTelemetry(): GodotUiTreePayload | null { return this.latestTelemetry; }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleHttp(req, res));
      this.server.on('upgrade', (req, socket) => this.handleUpgrade(req, socket as Socket));
      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => {
        const addr = this.server?.address();
        this.port = typeof addr === 'object' && addr ? addr.port : this.port;
        resolve(this.port);
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.clientSocket && !this.clientSocket.destroyed) {
      this.clientSocket.write(WsFrameCodec.encodeCloseFrame());
      this.clientSocket.destroy();
      this.clientSocket = null;
    }
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  public async executeCommand(cmd: GodotRpcRequest, timeoutMs = 5000): Promise<GodotRpcResponse> {
    if (!this.isClientConnected()) {
      return { id: cmd.id, success: false, error: 'No Godot client connected to WebSocket bridge.' };
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(cmd.id);
        resolve({ id: cmd.id, success: false, error: `Command '${cmd.action}' timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      this.pendingCommands.set(cmd.id, (res) => {
        clearTimeout(timer);
        resolve(res);
      });

      const frame = WsFrameCodec.encodeTextFrame(JSON.stringify(cmd));
      this.clientSocket?.write(frame);
    });
  }

  private handleUpgrade(req: http.IncomingMessage, socket: Socket): void {
    if (!this.verifyOrigin(req.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const token = new URL(req.url || '/', 'http://127.0.0.1').searchParams.get('token');
    if (token !== this.sessionToken) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);

    this.clientSocket = socket;
    this.socketBuffer = Buffer.alloc(0);
    socket.on('data', (chunk) => this.handleSocketData(chunk));
    socket.on('close', () => { if (this.clientSocket === socket) this.clientSocket = null; });
  }

  private verifyOrigin(origin?: string): boolean {
    if (!origin || origin === 'null') return true;
    return origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  }

  private handleSocketData(chunk: Buffer): void {
    this.socketBuffer = Buffer.concat([this.socketBuffer, chunk]);
    const { frames, remaining } = WsFrameCodec.decodeFrames(this.socketBuffer);
    this.socketBuffer = Buffer.from(remaining);

    for (const frame of frames) {
      if (frame.opcode === 0x1) {
        this.processClientMessage(frame.payload.toString('utf8'));
      } else if (frame.opcode === 0x8) {
        this.clientSocket?.destroy();
        this.clientSocket = null;
      }
    }
  }

  private processClientMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'telemetry') {
        this.latestTelemetry = msg.payload as GodotUiTreePayload;
        if (this.onTelemetryCb) this.onTelemetryCb(this.latestTelemetry);
      } else if (msg.type === 'log') {
        if (this.onLogCb) this.onLogCb(msg.payload);
      } else if (msg.id && this.pendingCommands.has(msg.id)) {
        const handler = this.pendingCommands.get(msg.id);
        this.pendingCommands.delete(msg.id);
        handler?.(msg as GodotRpcResponse);
      }
    } catch {
      // Ignore unparseable raw packets
    }
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/status') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'running', port: this.port, connected: this.isClientConnected() }));
      return;
    }
    if (req.url === '/telemetry/latest') {
      res.writeHead(200);
      res.end(JSON.stringify({ telemetry: this.latestTelemetry }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
}
