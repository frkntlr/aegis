import * as http from 'node:http';
import type { GodotRpcRequest, GodotRpcResponse, GodotUiTreePayload } from './rpc-types.js';

export interface GodotBridgeServerOptions {
  port?: number;
  host?: string;
  onTelemetryReceived?: (payload: GodotUiTreePayload) => void;
}

export class GodotBridgeServer {
  private server: http.Server | null = null;
  private port: number;
  private host: string;
  private latestTelemetry: GodotUiTreePayload | null = null;
  private onTelemetryCallback?: (payload: GodotUiTreePayload) => void;

  constructor(options: GodotBridgeServerOptions = {}) {
    this.port = options.port ?? 6850;
    this.host = options.host ?? '127.0.0.1';
    this.onTelemetryCallback = options.onTelemetryReceived;
  }

  public getPort(): number {
    return this.port;
  }

  public getLatestTelemetry(): GodotUiTreePayload | null {
    return this.latestTelemetry;
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleHttpRequest(req, res));
      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => resolve());
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', `http://${this.host}:${this.port}`);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/status') {
      this.sendJsonResponse(res, 200, { status: 'running', port: this.port, hasTelemetry: !!this.latestTelemetry });
      return;
    }

    if (req.method === 'GET' && req.url === '/telemetry/latest') {
      this.sendJsonResponse(res, 200, { telemetry: this.latestTelemetry });
      return;
    }

    if (req.method === 'POST') {
      this.handlePost(req, res);
      return;
    }

    this.sendJsonResponse(res, 404, { error: 'Not found' });
  }

  private handlePost(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.readJsonBody(req, res, (data) => {
      if (req.url === '/telemetry') {
        this.latestTelemetry = data as GodotUiTreePayload;
        if (this.onTelemetryCallback) this.onTelemetryCallback(this.latestTelemetry);
        this.sendJsonResponse(res, 200, { success: true });
        return;
      }

      if (req.url === '/rpc') {
        const rpcReq = data as GodotRpcRequest;
        const response: GodotRpcResponse = {
          id: rpcReq.id || '0',
          success: true,
          data: { acknowledged: true, action: rpcReq.action }
        };
        this.sendJsonResponse(res, 200, response);
        return;
      }

      this.sendJsonResponse(res, 404, { error: 'Unknown endpoint' });
    });
  }

  private readJsonBody(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    callback: (data: unknown) => void
  ): void {
    let body = '';
    const maxBytes = 1_048_576; // 1 MB limit
    let exceeded = false;

    req.on('data', (chunk) => {
      if (exceeded) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        exceeded = true;
        this.sendJsonResponse(res, 413, { error: 'Payload Too Large' });
        req.destroy();
      }
    });

    req.on('end', () => {
      if (exceeded) return;
      try {
        const parsed = body ? JSON.parse(body) : {};
        callback(parsed);
      } catch {
        this.sendJsonResponse(res, 400, { error: 'Invalid JSON' });
      }
    });
  }

  private sendJsonResponse(res: http.ServerResponse, code: number, payload: unknown): void {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }
}
