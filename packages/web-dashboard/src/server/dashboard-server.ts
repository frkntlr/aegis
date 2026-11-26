import * as http from 'node:http';
import { debugLogIgnored } from '@aegis/shared';
import { getDashboardHtml } from '../ui/dashboard-html.js';
import { IdeLauncher, UniversalToolchainSync } from '@aegis/orchestrator';
import { OrphanTaskReclaimer } from '@aegis/watchdog';
import { AegisEngineService } from './engine-service.js';
import { ProjectHub } from './project-hub.js';
import { RealtimeMetricsService } from './realtime-metrics.js';
import { ActionDispatcher } from './action-dispatcher.js';
import { HttpRequestError, isAllowedLocalOrigin, readJsonObjectBody, sendJsonError } from './server-security.js';

export interface DashboardServerOptions {
  port?: number;
  repoRoot?: string;
  persistLocks?: boolean;
  offline?: boolean;
  metricsService?: RealtimeMetricsService;
}

export class DashboardServer {
  private server: http.Server | null = null;
  private port: number;
  private hub: ProjectHub;
  private launcher = new IdeLauncher();
  private toolchainSync: UniversalToolchainSync;
  private engineSvc: AegisEngineService;
  private orphanReclaimer = new OrphanTaskReclaimer();
  private sseClients = new Set<http.ServerResponse>();
  private dispatcher: ActionDispatcher;

  constructor(options: DashboardServerOptions = {}) {
    this.port = options.port ?? 3000;
    this.engineSvc = new AegisEngineService(options.repoRoot);
    this.hub = new ProjectHub(options.repoRoot, options.offline, options.persistLocks ?? false);
    if (options.metricsService) this.hub.getActiveContext().metrics = options.metricsService;
    this.toolchainSync = new UniversalToolchainSync(options.repoRoot);
    this.hub.discoverProjects().catch((err: unknown) => debugLogIgnored('dashboard-server:discoverProjects', err));
    this.dispatcher = new ActionDispatcher({
      hub: this.hub,
      launcher: this.launcher,
      toolchainSync: this.toolchainSync,
      engineSvc: this.engineSvc,
      orphanReclaimer: this.orphanReclaimer,
      broadcast: (ev, p) => this.broadcast(ev, p)
    });
  }

  public getStatusPayload(projectId?: string): Record<string, unknown> {
    const ctx = projectId ? (this.hub.getContext(projectId) || this.hub.getActiveContext()) : this.hub.getActiveContext();
    const list = ctx.wtManager.listWorktrees();
    const locks = ctx.wtManager.getLockedFiles();
    const sessions = ctx.detector.detectSessions();
    const snapshot = ctx.metrics.getSnapshot();
    const runningIdes = this.launcher.detectRunningIdes();
    const lockEntries: Record<string, string> = {};
    for (const [file, agent] of locks.entries()) lockEntries[file] = agent;

    return {
      activeWorktrees: list.activeCount || sessions.length,
      activeLocks: locks.size,
      lockedFiles: lockEntries,
      agents: sessions,
      runningIdes,
      tokenMetrics: snapshot.tokenMetrics,
      qualityShields: snapshot.qualityShields,
      issues: snapshot.issues,
      settings: snapshot.settings,
      github: snapshot.github,
      projects: this.hub.listProjects(),
      activeProject: {
        id: ctx.id, name: ctx.name, projectNumber: ctx.projectNumber,
        localPath: ctx.localPath, isLocalBound: ctx.isLocalBound
      },
      timestamp: new Date().toISOString()
    };
  }

  public broadcast(event: string, payload: unknown): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.sseClients) {
      if (client.writableEnded || client.destroyed) {
        this.sseClients.delete(client);
        continue;
      }
      try {
        client.write(msg);
      } catch (err: unknown) {
        debugLogIgnored('dashboard-server:sseWrite', err);
        this.sseClients.delete(client);
        try {
          client.destroy();
        } catch (destroyErr: unknown) {
          debugLogIgnored('dashboard-server:clientDestroy', destroyErr);
        }
      }
    }
  }

  private setCorsHeaders(res: http.ServerResponse, origin?: string): void {
    const allowed = origin && isAllowedLocalOrigin(origin, this.port) ? origin : `http://127.0.0.1:${this.port}`;
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  private handleEventsSse(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.setCorsHeaders(res, req.headers.origin);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: snapshot\ndata: ${JSON.stringify(this.getStatusPayload())}\n\n`);
    this.sseClients.add(res);

    const cleanup = () => {
      this.sseClients.delete(res);
      try {
        if (!res.writableEnded) res.end();
      } catch (err: unknown) {
        debugLogIgnored('dashboard-server:sseCleanup', err);
      }
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  }

  private async handleActionApi(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.setCorsHeaders(res, req.headers.origin);
    try {
      const body = await readJsonObjectBody(req);
      if (typeof body.action !== 'string' || !body.action.trim()) {
        throw new HttpRequestError('Invalid action: expected non-empty string.', 400);
      }
      const result = await this.dispatcher.executeAction(body.action, body);
      this.broadcast('update', this.getStatusPayload());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: unknown) {
      sendJsonError(res, err);
    }
  }

  private async handleFocusApi(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.setCorsHeaders(res, req.headers.origin);
    try {
      const body = await readJsonObjectBody(req);
      if (typeof body.workspacePath !== 'string' || !body.workspacePath.trim()) {
        throw new HttpRequestError('Invalid workspacePath: expected non-empty string.', 400);
      }
      const result = this.hub.handleFocus(body.workspacePath);
      if (result.switched) {
        this.broadcast('context_switched', result);
        this.broadcast('update', this.getStatusPayload());
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err: unknown) {
      sendJsonError(res, err);
    }
  }

  private handleRoutes(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin;
    if (origin !== undefined && !isAllowedLocalOrigin(origin, this.port)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Forbidden: Invalid Origin' }));
      return;
    }
    if (req.method === 'OPTIONS') {
      this.setCorsHeaders(res, origin);
      res.writeHead(204);
      res.end();
      return;
    }

    const rawUrl = req.url || '/';
    const url = rawUrl.split('?')[0] || '/';
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getDashboardHtml());
    } else if (url === '/api/events') {
      this.handleEventsSse(req, res);
    } else if (url === '/api/status' && req.method === 'GET') {
      this.setCorsHeaders(res, origin);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getStatusPayload()));
    } else if (url === '/api/projects' && req.method === 'GET') {
      this.setCorsHeaders(res, origin);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ projects: this.hub.listProjects(), active: this.hub.getActiveContext().id }));
    } else if (url === '/api/projects/focus' && req.method === 'POST') {
      this.handleFocusApi(req, res);
    } else if (url === '/api/action' && req.method === 'POST') {
      this.handleActionApi(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRoutes(req, res));
      this.server.on('error', (err) => reject(err));
      this.server.listen(this.port, '127.0.0.1', () => {
        const addr = this.server?.address();
        const p = typeof addr === 'object' && addr ? addr.port : this.port;
        this.port = p;
        resolve(p);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.sseClients) {
        try {
          if (!client.writableEnded) client.end();
          client.destroy();
        } catch (err: unknown) {
          debugLogIgnored('dashboard-server:stopCleanup', err);
        }
      }
      this.sseClients.clear();
      (this.server as unknown as { closeAllConnections?: () => void })?.closeAllConnections?.();
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
  }
}
