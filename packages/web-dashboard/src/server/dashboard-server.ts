import * as http from 'node:http';
import { getDashboardHtml } from '../ui/dashboard-html.js';
import { IdeLauncher, UniversalToolchainSync, RoleClassifier } from '@aegis/orchestrator';
import { OrphanTaskReclaimer } from '@aegis/watchdog';
import { AegisEngineService } from './engine-service.js';
import { ProjectHub } from './project-hub.js';
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
  private hub: ProjectHub;
  private launcher = new IdeLauncher();
  private toolchainSync: UniversalToolchainSync;
  private engineSvc = new AegisEngineService();
  private orphanReclaimer = new OrphanTaskReclaimer();
  private sseClients = new Set<http.ServerResponse>();

  constructor(options: DashboardServerOptions = {}) {
    this.port = options.port ?? 3000;
    this.hub = new ProjectHub(options.repoRoot);
    if (options.metricsService) this.hub.getActiveContext().metrics = options.metricsService;
    this.toolchainSync = new UniversalToolchainSync(options.repoRoot);
    this.hub.discoverProjects().catch(() => {});
  }

  public getStatusPayload(projectId?: string): Record<string, any> {
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
    const ctx = this.hub.getActiveContext();
    const num = parseInt(payload.issueNumber, 10);
    const targetStatus = payload.targetStatus;
    const issue = ctx.metrics.getIssues().find(i => i.number === num);
    if (!issue) return { success: false, message: `Görev #${num} bulunamadı.` };

    if (targetStatus === 'in_progress') {
      let agent = payload.agentName;
      if (!agent || agent === 'auto') {
        const inf = new RoleClassifier().classify({ title: issue.title, targetFiles: issue.targetFiles });
        agent = inf.role;
      }
      const ide = payload.ideType || 'Google Antigravity';
      const lockRes = ctx.wtManager.acquireFileLocks(agent, issue.targetFiles);
      if (!lockRes.success) {
        return { success: false, message: `Kilit çakışması: ${lockRes.conflictingFiles.join(', ')}` };
      }
      ctx.metrics.moveTask(num, 'in_progress', agent, ide);
      return { success: true, message: `Görev #${num} [@${agent}] (${ide}) atandı.` };
    }

    if (targetStatus === 'done' || targetStatus === 'ready') {
      if (issue.assignedAgent) ctx.wtManager.releaseFileLocks(issue.assignedAgent);
    }
    ctx.metrics.moveTask(num, targetStatus);
    return { success: true, message: `Görev #${num} '${targetStatus}' sütununa alındı.` };
  }

  private handleAutoAction(): Record<string, any> {
    const ctx = this.hub.getActiveContext();
    const ready = ctx.metrics.getIssues().filter(i => i.status === 'ready');
    if (ready.length === 0) return { success: true, message: 'Ready sütununda bekleyen görev yok.' };
    const sessions = ctx.detector.detectSessions();
    const target = ready[0];
    const inf = new RoleClassifier().classify({ title: target.title, targetFiles: target.targetFiles });
    const idle = sessions.find(s => s.agentName === inf.role && s.status === 'idle')
      || sessions.find(s => s.status === 'idle')
      || sessions[0];
    const lockRes = ctx.wtManager.acquireFileLocks(idle.agentName, target.targetFiles);
    if (!lockRes.success) {
      return { success: false, message: `Kilit çakışması: ${lockRes.conflictingFiles.join(', ')}` };
    }
    ctx.metrics.assignIssue(target.number, idle.agentName, idle.ideType);
    return { success: true, message: `Görev #${target.number} [@${idle.agentName}] (${idle.ideType}) atandı.` };
  }

  private handleIdeAndSync(action: string, payload: any): Record<string, any> {
    const ctx = this.hub.getActiveContext();
    if (action === 'launch_ide') {
      return this.launcher.launchIde({
        ideType: payload.ideType || 'Google Antigravity',
        worktreePath: payload.worktreePath || `${ctx.localPath}/experimental/solver`,
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
    if (action === 'save_settings' || action === 'update_settings') {
      const s = ctx.metrics.updateSettings(payload.settings || payload);
      return { success: true, settings: s, message: `Ayarlar kaydedildi (Ana Dal: ${s.primaryBranch || 'master'}).` };
    }
    return { success: false, error: 'Bilinmeyen işlem' };
  }

  private handleReclaimOrphans(): Record<string, any> {
    const ctx = this.hub.getActiveContext();
    const issues = ctx.metrics.getIssues();
    const locks = ctx.wtManager.getLockedFiles();
    const sessions = ctx.detector.detectSessions();
    const { reclaimed } = this.orphanReclaimer.scanAndReclaim(issues, locks, sessions);
    for (const r of reclaimed) {
      ctx.metrics.moveTask(r.issueNumber, 'ready');
      if (r.previousAgent) ctx.wtManager.releaseFileLocks(r.previousAgent);
    }
    const msg = reclaimed.length > 0
      ? `${reclaimed.length} adet asılı görev kurtarılarak 'Ready' sütununa devredildi.`
      : 'Tüm görevler tutarlı. Asılı veya yetim görev yok.';
    return { success: true, count: reclaimed.length, reclaimed, message: msg };
  }

  private async executeAction(action: string, payload: any): Promise<Record<string, any>> {
    const ctx = this.hub.getActiveContext();
    if (action === 'switch_project') {
      const res = this.hub.switchProject(payload.projectId);
      this.broadcast('context_switched', res);
      return { success: true, ...res };
    }
    if (action === 'focus_project') {
      const res = this.hub.handleFocus(payload.workspacePath);
      if (res.switched) this.broadcast('context_switched', res);
      return { success: true, ...res };
    }
    if (action === 'auto') return this.handleAutoAction();
    if (action === 'move_task') return this.handleMoveTask(payload);
    if (action === 'reclaim_orphans') return this.handleReclaimOrphans();
    if (action === 'sync_github') {
      const issues = await ctx.metrics.fetchLiveIssues();
      this.handleReclaimOrphans();
      return { success: true, issues: ctx.metrics.getIssues(), status: ctx.metrics.getGitHubStatus(), message: `GitHub senkronize edildi: ${issues.length} görev güncellendi.` };
    }
    if (['launch_ide', 'sync_toolchain', 'run_engine_tool', 'save_settings', 'update_settings'].includes(action)) {
      return this.handleIdeAndSync(action, payload);
    }
    if (action === 'create_task') {
      const issue = await ctx.metrics.createIssue(payload.title || 'Yeni Görev', payload.targetFiles || []);
      return { success: true, message: `GitHub Görevi #${issue.number} oluşturuldu.`, issue };
    }
    if (action === 'complete_task') return this.handleMoveTask({ issueNumber: payload.issueNumber, targetStatus: 'done' });
    if (action === 'release_locks') {
      ctx.wtManager.releaseFileLocks(payload.agentName || 'solver');
      ctx.metrics.releaseIssueLocks(payload.agentName);
      return { success: true, message: 'Kilitler boşaltıldı.' };
    }
    return { success: false, error: 'Bilinmeyen aksiyon: ' + action };
  }

  private readJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', () => {
        try { resolve(bodyStr ? JSON.parse(bodyStr) : {}); } catch (err) { reject(err); }
      });
      req.on('error', reject);
    });
  }

  private async handleActionApi(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readJsonBody(req);
      const result = await this.executeAction(body.action, body);
      this.broadcast('update', this.getStatusPayload());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  private async handleFocusApi(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readJsonBody(req);
      const result = this.hub.handleFocus(body.workspacePath || process.cwd());
      if (result.switched) {
        this.broadcast('context_switched', result);
        this.broadcast('update', this.getStatusPayload());
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (err: any) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  private handleRoutes(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getDashboardHtml());
    } else if (url === '/api/events') {
      this.handleEventsSse(req, res);
    } else if (url === '/api/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getStatusPayload()));
    } else if (url === '/api/projects' && req.method === 'GET') {
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
      if (this.server) this.server.close(() => resolve());
      else resolve();
    });
  }
}
