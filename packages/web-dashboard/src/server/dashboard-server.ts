import * as http from 'node:http';
import { getDashboardHtml } from '../ui/dashboard-html.js';
import { WorktreeManager } from '@aegis/orchestrator';
import { SessionDetector } from './session-detector.js';
import { RealtimeMetricsService } from './realtime-metrics.js';

export interface DashboardServerOptions {
  port?: number;
  repoRoot?: string;
  persistLocks?: boolean;
  metricsService?: RealtimeMetricsService;
}

export class DashboardServer {
  private server: http.Server | null = null;
  private port: number;
  private wtManager: WorktreeManager;
  private detector: SessionDetector;
  private metrics: RealtimeMetricsService;
  private sseClients = new Set<http.ServerResponse>();

  constructor(options: DashboardServerOptions = {}) {
    this.port = options.port ?? 3000;
    const persistLocks = options.persistLocks ?? false;
    this.wtManager = new WorktreeManager({ repoRoot: options.repoRoot, persistLocks });
    this.detector = new SessionDetector(options.repoRoot, this.wtManager);
    this.metrics = options.metricsService ?? new RealtimeMetricsService(options.repoRoot);
  }

  public getStatusPayload(): Record<string, any> {
    const list = this.wtManager.listWorktrees();
    const locks = this.wtManager.getLockedFiles();
    const sessions = this.detector.detectSessions();
    const snapshot = this.metrics.getSnapshot();
    const lockEntries: Record<string, string> = {};
    for (const [file, agent] of locks.entries()) {
      lockEntries[file] = agent;
    }

    return {
      activeWorktrees: list.activeCount || sessions.length,
      activeLocks: locks.size,
      lockedFiles: lockEntries,
      agents: sessions,
      tokenMetrics: snapshot.tokenMetrics,
      qualityShields: snapshot.qualityShields,
      issues: snapshot.issues,
      timestamp: new Date().toISOString()
    };
  }

  public broadcast(event: string, payload: any): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(msg);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private handleEventsSse(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`event: snapshot\ndata: ${JSON.stringify(this.getStatusPayload())}\n\n`);
    this.sseClients.add(res);

    req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  private handleAutoAction(): Record<string, any> {
    const ready = this.metrics.getIssues().filter(i => i.status === 'ready');
    if (ready.length === 0) return { success: true, message: 'Ready sütununda bekleyen görev yok.' };
    const sessions = this.detector.detectSessions();
    const idle = sessions.find(s => s.status === 'idle') || sessions[0];
    const target = ready[0];
    const lockRes = this.wtManager.acquireFileLocks(idle.agentName, target.targetFiles);
    if (!lockRes.success) {
      return { success: false, message: `Kilit çakışması: ${lockRes.conflictingFiles.join(', ')}` };
    }
    this.metrics.assignIssue(target.number, idle.agentName, idle.ideType);
    return { success: true, message: `Görev #${target.number} [@${idle.agentName}] (${idle.ideType}) atandı.` };
  }

  private handleTaskAction(action: string, payload: any): Record<string, any> {
    if (action === 'create_task') {
      const issue = this.metrics.createIssue(payload.title || 'Yeni Görev', payload.targetFiles || []);
      return { success: true, message: `Yeni görev #${issue.number} oluşturuldu.`, issue };
    }
    if (action === 'complete_task') {
      const num = parseInt(payload.issueNumber, 10);
      const issue = this.metrics.getIssues().find(i => i.number === num);
      if (issue?.assignedAgent) this.wtManager.releaseFileLocks(issue.assignedAgent);
      this.metrics.completeIssue(num);
      return { success: true, message: `Görev #${num} tamamlandı ve Done sütununa alındı.` };
    }
    return { success: false, error: 'Bilinmeyen görev işlemi' };
  }

  private handleScanAction(action: string): Record<string, any> {
    if (action === 'scan_ast') {
      const ast = this.metrics.computeAstMetrics(true);
      return { success: true, message: `AST İskelet: %${ast.savingsPercent} tasarruf (${ast.filesScanned} dosya)` };
    }
    if (action === 'verify_cage') {
      const cage = this.metrics.computeCageMetrics(true);
      return { success: true, message: `Demir Kafes denetimi: ${cage.label}` };
    }
    return { success: false, error: 'Bilinmeyen tarama işlemi' };
  }

  private executeAction(action: string, payload: any): Record<string, any> {
    if (action === 'auto') return this.handleAutoAction();
    if (action === 'create_task' || action === 'complete_task') return this.handleTaskAction(action, payload);
    if (action === 'scan_ast' || action === 'verify_cage') return this.handleScanAction(action);
    if (action === 'release_locks') {
      const agent = payload.agentName;
      if (agent) {
        this.wtManager.releaseFileLocks(agent);
        this.metrics.releaseIssueLocks(agent);
      } else {
        const locked = this.wtManager.getLockedFiles();
        for (const owner of new Set(locked.values())) {
          this.wtManager.releaseFileLocks(owner);
        }
        this.metrics.releaseIssueLocks();
      }
      return { success: true, message: 'Tüm kilitler boşaltıldı ve görevler Ready sütununa alındı.' };
    }
    if (action === 'heartbeat') {
      this.detector.registerHeartbeat(payload.agentName, payload.ideType);
      return { success: true };
    }
    return { success: false, error: 'Bilinmeyen aksiyon: ' + action };
  }

  private handleActionApi(req: http.IncomingMessage, res: http.ServerResponse): void {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', () => {
      try {
        const body = bodyStr ? JSON.parse(bodyStr) : {};
        const result = this.executeAction(body.action, body);
        this.broadcast('update', this.getStatusPayload());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  }

  private handleRoutes(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getDashboardHtml());
      return;
    }
    if (url === '/api/events') {
      this.handleEventsSse(req, res);
      return;
    }
    if (url === '/api/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getStatusPayload()));
      return;
    }
    if (url === '/api/action' && req.method === 'POST') {
      this.handleActionApi(req, res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRoutes(req, res));
      this.server.on('error', (err) => reject(err));
      this.server.listen(this.port, () => {
        const addr = this.server?.address();
        const p = typeof addr === 'object' && addr ? addr.port : this.port;
        resolve(p);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.sseClients) {
        try { client.end(); } catch {}
      }
      this.sseClients.clear();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
