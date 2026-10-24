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
  private commandQueue: GodotRpcRequest[] = [];
  private commandResults: Map<string, GodotRpcResponse> = new Map();

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

  public queueCommand(cmd: GodotRpcRequest): void {
    this.commandQueue.push(cmd);
  }

  public getCommandResult(id: string): GodotRpcResponse | undefined {
    return this.commandResults.get(id);
  }

  public async executeCommand(cmd: GodotRpcRequest, timeoutMs = 5000): Promise<GodotRpcResponse> {
    this.queueCommand(cmd);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = this.getCommandResult(cmd.id);
      if (res) return res;
      await new Promise(r => setTimeout(r, 50));
    }
    return {
      id: cmd.id,
      success: false,
      error: `Command '${cmd.action}' (id: ${cmd.id}) timed out after ${timeoutMs}ms`
    };
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleHttpRequest(req, res));
      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => {
        const addr = this.server?.address();
        const p = typeof addr === 'object' && addr ? addr.port : this.port;
        this.port = p;
        resolve(p);
      });
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
    const origin = req.headers.origin;
    const allowOrigin = origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))
      ? origin
      : `http://${this.host}:${this.port}`;
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      this.handleGet(req, res);
      return;
    }

    if (req.method === 'POST') {
      this.handlePost(req, res);
      return;
    }

    this.sendJsonResponse(res, 404, { error: 'Not found' });
  }

  private handleGet(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.url === '/status') {
      this.sendJsonResponse(res, 200, { status: 'running', port: this.port, hasTelemetry: !!this.latestTelemetry });
      return;
    }
    if (req.url === '/telemetry/latest') {
      this.sendJsonResponse(res, 200, { telemetry: this.latestTelemetry });
      return;
    }
    if (req.url === '/command/poll') {
      const command = this.commandQueue.shift() || null;
      this.sendJsonResponse(res, 200, { command });
      return;
    }
    if (req.url?.startsWith('/command/result')) {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id');
      const result = id ? (this.commandResults.get(id) || null) : null;
      this.sendJsonResponse(res, 200, { result });
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
      if (req.url === '/command/queue') {
        this.queueCommand(data as GodotRpcRequest);
        this.sendJsonResponse(res, 200, { queued: true });
        return;
      }
      if (req.url === '/command/result') {
        const resp = data as GodotRpcResponse;
        if (resp.id) this.commandResults.set(resp.id, resp);
        this.sendJsonResponse(res, 200, { success: true });
        return;
      }
      if (req.url === '/rpc') {
        const rpcReq = data as GodotRpcRequest;
        this.sendJsonResponse(res, 200, { id: rpcReq.id || '0', success: true, data: { acknowledged: true, action: rpcReq.action } });
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
