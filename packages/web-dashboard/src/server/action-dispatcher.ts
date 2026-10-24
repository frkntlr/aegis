import type { ProjectHub } from './project-hub.js';
import type { IdeLauncher, UniversalToolchainSync } from '@aegis/orchestrator';
import { RoleClassifier } from '@aegis/orchestrator';
import type { OrphanTaskReclaimer } from '@aegis/watchdog';
import type { AegisEngineService } from './engine-service.js';
import type { SystemIssue } from './realtime-metrics.js';

export interface ActionDispatcherContext {
  hub: ProjectHub;
  launcher: IdeLauncher;
  toolchainSync: UniversalToolchainSync;
  engineSvc: AegisEngineService;
  orphanReclaimer: OrphanTaskReclaimer;
  broadcast: (event: string, payload: unknown) => void;
}

export class ActionDispatcher {
  constructor(private ctx: ActionDispatcherContext) {}

  public async executeAction(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const hubCtx = this.ctx.hub.getActiveContext();
    if (action === 'switch_project') {
      const res = this.ctx.hub.switchProject(payload.projectId as string);
      this.ctx.broadcast('context_switched', res);
      return { success: true, ...res };
    }
    if (action === 'focus_project') {
      const res = this.ctx.hub.handleFocus(payload.workspacePath as string);
      if (res.switched) this.ctx.broadcast('context_switched', res);
      return { success: true, ...res };
    }
    if (action === 'auto') return this.handleAutoAction();
    if (action === 'move_task') return this.handleMoveTask(payload);
    if (action === 'reclaim_orphans') return this.handleReclaimOrphans();
    if (action === 'sync_github') {
      const issues = await hubCtx.metrics.fetchLiveIssues();
      this.handleReclaimOrphans();
      return {
        success: true,
        issues: hubCtx.metrics.getIssues(),
        status: hubCtx.metrics.getGitHubStatus(),
        message: `GitHub senkronize edildi: ${issues.length} görev güncellendi.`
      };
    }
    if (['launch_ide', 'sync_toolchain', 'run_engine_tool', 'save_settings', 'update_settings'].includes(action)) {
      return this.handleIdeAndSync(action, payload);
    }
    if (action === 'create_task') {
      const issue = await hubCtx.metrics.createIssue((payload.title as string) || 'Yeni Görev', (payload.targetFiles as string[]) || []);
      return { success: true, message: `GitHub Görevi #${issue.number} oluşturuldu.`, issue };
    }
    if (action === 'complete_task') return this.handleMoveTask({ issueNumber: payload.issueNumber, targetStatus: 'done' });
    if (action === 'release_locks') {
      hubCtx.wtManager.releaseFileLocks((payload.agentName as string) || 'solver');
      hubCtx.metrics.releaseIssueLocks(payload.agentName as string);
      return { success: true, message: 'Kilitler boşaltıldı.' };
    }
    return { success: false, error: 'Bilinmeyen aksiyon: ' + action };
  }

  private handleMoveTask(payload: Record<string, unknown>): Record<string, unknown> {
    const ctx = this.ctx.hub.getActiveContext();
    const num = parseInt(String(payload.issueNumber), 10);
    const targetStatus = payload.targetStatus as SystemIssue['status'];
    const issue = ctx.metrics.getIssues().find(i => i.number === num);
    if (!issue) return { success: false, message: `Görev #${num} bulunamadı.` };

    if (targetStatus === 'in_progress') {
      let agent = payload.agentName as string | undefined;
      if (!agent || agent === 'auto') {
        const inf = new RoleClassifier().classify({ title: issue.title, targetFiles: issue.targetFiles });
        agent = inf.role;
      }
      const ide = (payload.ideType as string) || 'Google Antigravity';
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

  private handleAutoAction(): Record<string, unknown> {
    const ctx = this.ctx.hub.getActiveContext();
    const ready = ctx.metrics.getIssues().filter(i => i.status === 'ready');
    if (ready.length === 0) return { success: true, message: 'Ready sütununda bekleyen görev yok.' };
    const sessions = ctx.detector.detectSessions();
    const target = ready[0];
    const inf = new RoleClassifier().classify({ title: target.title, targetFiles: target.targetFiles });
    const idle = sessions.find(s => s.agentName === inf.role && s.status === 'idle') || sessions.find(s => s.status === 'idle') || sessions[0];
    const agentName = idle?.agentName || inf.role || 'solver';
    const ideType = idle?.ideType || 'Google Antigravity';
    const lockRes = ctx.wtManager.acquireFileLocks(agentName, target.targetFiles);
    if (!lockRes.success) {
      return { success: false, message: `Kilit çakışması: ${lockRes.conflictingFiles.join(', ')}` };
    }
    ctx.metrics.assignIssue(target.number, agentName, ideType);
    return { success: true, message: `Görev #${target.number} [@${agentName}] (${ideType}) atandı.` };
  }

  private async handleIdeAndSync(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const ctx = this.ctx.hub.getActiveContext();
    if (action === 'launch_ide') {
      const res = this.ctx.launcher.launchIde({
        ideType: ((payload.ideType as string) || 'Google Antigravity') as 'Google Antigravity' | 'Cursor AI' | 'VS Code' | 'Universal IDE',
        worktreePath: (payload.worktreePath as string) || `${ctx.localPath}/experimental/solver`,
        focusFile: payload.focusFile as string | undefined
      });
      return { success: res.success, command: res.command, message: res.message, pid: res.pid };
    }
    if (action === 'sync_toolchain') {
      const rep = this.ctx.toolchainSync.syncAll();
      return { success: rep.success, report: rep, message: `Toolchain senkronize edildi: ${rep.syncedIdes.join(', ')}` };
    }
    if (action === 'run_engine_tool') {
      return this.handleRunEngineTool(payload);
    }
    const s = ctx.metrics.updateSettings((payload.settings || payload) as Record<string, unknown>);
    return { success: true, settings: s, message: `Ayarlar kaydedildi (Ana Dal: ${s.primaryBranch || 'master'}).` };
  }

  private async handleRunEngineTool(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const t = payload.tool;
    let res: Record<string, unknown>;
    if (t === 'ui_inspector') res = this.ctx.engineSvc.runUiInspector();
    else if (t === 'mutation_gate') res = this.ctx.engineSvc.runMutationGate();
    else if (t === 'adaptive_timeout') res = { ...this.ctx.engineSvc.runAdaptiveTimeout(Number(payload.files ?? 2), Number(payload.tests ?? 4)) };
    else if (t === 'mcp_security') res = this.ctx.engineSvc.runMcpSecurity(payload.agent as string, payload.mcpTool as string);
    else if (t === 'diff_validator') res = await this.ctx.engineSvc.runDiffValidator(payload.diffText as string);
    else if (t === 'immutable_oracle') res = await this.ctx.engineSvc.runOracleAudit(payload.files as string[]);
    else return { success: false, error: 'Bilinmeyen araç: ' + t, message: 'Bilinmeyen araç: ' + t };
    return { success: true, result: res, message: (res.summary as string) || 'Motor aracı çalıştırıldı.' };
  }

  private handleReclaimOrphans(): Record<string, unknown> {
    const ctx = this.ctx.hub.getActiveContext();
    const issues = ctx.metrics.getIssues();
    const locks = ctx.wtManager.getLockedFiles();
    const sessions = ctx.detector.detectSessions();
    const { reclaimed } = this.ctx.orphanReclaimer.scanAndReclaim(issues, locks, sessions);
    for (const r of reclaimed) {
      ctx.metrics.moveTask(r.issueNumber, 'ready');
      if (r.previousAgent) ctx.wtManager.releaseFileLocks(r.previousAgent);
    }
    const msg = reclaimed.length > 0
      ? `${reclaimed.length} adet asılı görev kurtarılarak 'Ready' sütununa devredildi.`
      : 'Tüm görevler tutarlı. Asılı veya yetim görev yok.';
    return { success: true, count: reclaimed.length, reclaimed, message: msg };
  }
}
