import * as http from 'node:http';
import { getDashboardHtml } from '../ui/dashboard-html.js';
import { WorktreeManager, IdeLauncher, UniversalToolchainSync, RoleClassifier } from '@aegis/orchestrator';
import { SessionDetector } from './session-detector.js';
import { RealtimeMetricsService } from './realtime-metrics.js';
import { AegisEngineService } from './engine-service.js';

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
  private launcher: IdeLauncher;
  private toolchainSync: UniversalToolchainSync;
  private engineSvc: AegisEngineService;
  private sseClients = new Set<http.ServerResponse>();

  constructor(options: DashboardServerOptions = {}) {
    this.port = options.port ?? 3000;
    const persistLocks = options.persistLocks ?? false;
    this.wtManager = new WorktreeManager({ repoRoot: options.repoRoot, persistLocks });
    this.detector = new SessionDetector(options.repoRoot, this.wtManager);
    this.metrics = options.metricsService ?? new RealtimeMetricsService(options.repoRoot);
    this.launcher = new IdeLauncher();
    this.toolchainSync = new UniversalToolchainSync(options.repoRoot);
    this.engineSvc = new AegisEngineService();
  }

  public getStatusPayload(): Record<string, any> {
    const list = this.wtManager.listWorktrees();
    const locks = this.wtManager.getLockedFiles();
    const sessions = this.detector.detectSessions();
    const snapshot = this.metrics.getSnapshot();
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
      timestamp: new Date().toISOString()
    };
  }

  public broadcast(event: string, payload: any): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.sseClients) {
      try { client.write(msg); } catch { this.sseClients.delete(client); }
    }
  }

  private handleEventsSse(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: snapshot\ndata: ${JSON.stringify(this.getStatusPayload())}\n\n`);
    this.sseClients.add(res);
    req.on('close', () => { this.sseClients.delete(res); });
  }

  private handleMoveTask(payload: any): Record<string, any> {
    const num = parseInt(payload.issueNumber, 10);
    const targetStatus = payload.targetStatus;
    const issue = this.metrics.getIssues().find(i => i.number === num);
    if (!issue) return { success: false, message: `Görev #${num} bulunamadı.` };

    if (targetStatus === 'in_progress') {
      let agent = payload.agentName;
      if (!agent || agent === 'auto' || agent === 'alice') {
        const inf = new RoleClassifier().classify({ title: issue.title, targetFiles: issue.targetFiles });
        agent = inf.role;
      }
      const ide = payload.ideType || 'Google Antigravity';
      const lockRes = this.wtManager.acquireFileLocks(agent, issue.targetFiles);
      if (!lockRes.success) {
        return { success: false, message: `Kilit çakışması: ${lockRes.conflictingFiles.join(', ')}` };
      }
      this.metrics.moveTask(num, 'in_progress', agent, ide);
      return { success: true, message: `Görev #${num} [@${agent}] (${ide}) atandı.` };
    }

    if (targetStatus === 'done' || targetStatus === 'ready') {
      if (issue.assignedAgent) this.wtManager.releaseFileLocks(issue.assignedAgent);
      this.metrics.moveTask(num, targetStatus);
      return { success: true, message: `Görev #${num} '${targetStatus}' durumuna taşındı.` };
    }

    this.metrics.moveTask(num, targetStatus);
    return { success: true, message: `Görev #${num} '${targetStatus}' sütununa alındı.` };
  }

  private handleAutoAction(): Record<string, any> {
    const ready = this.metrics.getIssues().filter(i => i.status === 'ready');
    if (ready.length === 0) return { success: true, message: 'Ready sütununda bekleyen görev yok.' };
    const sessions = this.detector.detectSessions();
    const target = ready[0];
    const inf = new RoleClassifier().classify({ title: target.title, targetFiles: target.targetFiles });
    const idle = sessions.find(s => s.agentName === inf.role && s.status === 'idle')
      || sessions.find(s => s.status === 'idle')
      || sessions[0];
    const lockRes = this.wtManager.acquireFileLocks(idle.agentName, target.targetFiles);
    if (!lockRes.success) {
      return { success: false, message: `Kilit çakışması: ${lockRes.conflictingFiles.join(', ')}` };
    }
    this.metrics.assignIssue(target.number, idle.agentName, idle.ideType);
    return { success: true, message: `Görev #${target.number} [@${idle.agentName}] (${idle.ideType}) atandı.` };
  }

  private handleIdeAndSync(action: string, payload: any): Record<string, any> {
    if (action === 'launch_ide') {
      return this.launcher.launchIde({
        ideType: payload.ideType || 'Google Antigravity',
        worktreePath: payload.worktreePath || 'experimental/solver',
        focusFile: payload.focusFile
      });
    }
    if (action === 'sync_toolchain') {
      const rep = this.toolchainSync.syncAll();
      return { success: rep.success, report: rep, message: `Toolchain senkronize edildi: ${rep.syncedIdes.join(', ')}` };
    }
    if (action === 'run_engine_tool') {
      const t = payload.tool;
      let res: any;
      if (t === 'ui_inspector') res = this.engineSvc.runUiInspector();
      else if (t === 'mutation_gate') res = this.engineSvc.runMutationGate();
      else if (t === 'adaptive_timeout') res = this.engineSvc.runAdaptiveTimeout(payload.files, payload.tests);
      else if (t === 'mcp_security') res = this.engineSvc.runMcpSecurity(payload.agent, payload.mcpTool);
      else if (t === 'diff_validator') res = this.engineSvc.runDiffValidator(payload.diffText);
      else if (t === 'immutable_oracle') res = this.engineSvc.runOracleAudit(payload.files);
      else res = { error: 'Bilinmeyen araç: ' + t };
      return { success: true, result: res, message: res.summary || 'Motor aracı çalıştırıldı.' };
    }
    if (action === 'save_settings') {
      return { success: true, settings: this.metrics.updateSettings(payload.settings || {}), message: 'Ayarlar kaydedildi.' };
    }
    return { success: false, error: 'Bilinmeyen işlem' };
  }

  private async executeAction(action: string, payload: any): Promise<Record<string, any>> {
    if (action === 'auto') return this.handleAutoAction();
    if (action === 'move_task') return this.handleMoveTask(payload);
    if (action === 'sync_github') {
      const issues = await this.metrics.fetchLiveIssues();
      const status = this.metrics.getGitHubStatus();
      return { success: true, issues, status, message: `GitHub senkronize edildi: ${issues.length} görev güncellendi.` };
    }
    if (['launch_ide', 'sync_toolchain', 'run_engine_tool', 'save_settings'].includes(action)) {
      return this.handleIdeAndSync(action, payload);
    }
    if (action === 'create_task') {
      const issue = await this.metrics.createIssue(payload.title || 'Yeni Görev', payload.targetFiles || []);
      let targetAgent = payload.agentName;
      if (!targetAgent || targetAgent === 'auto') {
        const inf = new RoleClassifier().classify({ title: issue.title, targetFiles: issue.targetFiles });
        targetAgent = inf.role;
      }
      if (payload.launchIde && payload.ideType) {
        this.launcher.launchIde({ ideType: payload.ideType, worktreePath: `experimental/${targetAgent}` });
      }
      return { success: true, message: `GitHub Görevi #${issue.number} oluşturuldu (@${targetAgent}).`, issue };
    }
    if (action === 'complete_task') return this.handleMoveTask({ issueNumber: payload.issueNumber, targetStatus: 'done' });
    if (action === 'scan_ast') {
      const ast = this.metrics.computeAstMetrics(true);
      return { success: true, message: `AST İskelet: %${ast.savingsPercent} tasarruf (${ast.filesScanned} dosya)` };
    }
    if (action === 'verify_cage') {
      const cage = this.metrics.computeCageMetrics(true);
      return { success: true, message: `Demir Kafes denetimi: ${cage.label}` };
    }
    if (action === 'release_locks') {
      const agent = payload.agentName;
      if (agent) {
        this.wtManager.releaseFileLocks(agent);
        this.metrics.releaseIssueLocks(agent);
      } else {
        const locked = this.wtManager.getLockedFiles();
        for (const owner of new Set(locked.values())) this.wtManager.releaseFileLocks(owner);
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
    req.on('end', async () => {
      try {
        const body = bodyStr ? JSON.parse(bodyStr) : {};
        const result = await this.executeAction(body.action, body);
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
    if (url === '/api/events') return this.handleEventsSse(req, res);
    if (url === '/api/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getStatusPayload()));
      return;
    }
    if (url === '/api/action' && req.method === 'POST') return this.handleActionApi(req, res);
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
