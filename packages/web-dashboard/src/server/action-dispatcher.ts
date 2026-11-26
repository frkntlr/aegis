import type { ProjectHub } from './project-hub.js';
import { type IdeLauncher, RoleClassifier, type UniversalToolchainSync } from '@aegis/orchestrator';
import { LoopBreaker, type OrphanTaskReclaimer } from '@aegis/watchdog';
import type { AegisEngineService } from './engine-service.js';
import type { SystemIssue } from './metrics-types.js';
import {
  IDE_SYNC_ACTIONS,
  assignTaskInProgress,
  handleCreateTask,
  handleReleaseLocks,
  launchIdeAction,
  runEngineToolAction
} from './action-helpers.js';

export interface ActionDispatcherContext {
  hub: ProjectHub;
  launcher: IdeLauncher;
  toolchainSync: UniversalToolchainSync;
  engineSvc: AegisEngineService;
  orphanReclaimer: OrphanTaskReclaimer;
  loopBreaker?: LoopBreaker;
  broadcast: (event: string, payload: unknown) => void;
}

export class ActionDispatcher {
  constructor(private ctx: ActionDispatcherContext) {}

  private handleProjectAndSync(action: string, payload: Record<string, unknown>): Record<string, unknown> | null {
    if (action === 'switch_project') {
      const res = this.ctx.hub.switchProject(payload.projectId as string);
      this.ctx.broadcast('context_switched', res);
      return { success: true, ...res };
    }
    if (action === 'focus_project') {
      if (typeof payload.workspacePath !== 'string' || !payload.workspacePath.trim()) {
        return { success: false, error: 'Invalid workspacePath: expected non-empty string.' };
      }
      const res = this.ctx.hub.handleFocus(payload.workspacePath);
      if (res.switched) this.ctx.broadcast('context_switched', res);
      return { success: true, ...res };
    }
    if (action === 'loop_status') {
      const breaker = this.ctx.loopBreaker ?? new LoopBreaker();
      const records = Array.from(breaker.getAllRecords().entries()).map(([num, r]) => ({
        number: num, attempts: r.attempts, blocked: r.blocked, lastError: r.lastError
      }));
      return { success: true, records, blocked: breaker.getBlockedIssues() };
    }
    if (action === 'loop_reset') {
      const breaker = this.ctx.loopBreaker ?? new LoopBreaker();
      const num = payload.issueNumber ? parseInt(String(payload.issueNumber), 10) : undefined;
      breaker.reset(num);
      return { success: true, message: num ? `Görev #${num} sıfırlandı.` : 'Tüm devre kesici sayaçları sıfırlandı.' };
    }
    return null;
  }

  private async handleSyncGitHub(hubCtx: ReturnType<ProjectHub['getActiveContext']>): Promise<Record<string, unknown>> {
    const issues = await hubCtx.metrics.fetchLiveIssues();
    this.handleReclaimOrphans();
    return {
      success: true,
      issues: hubCtx.metrics.getIssues(),
      status: hubCtx.metrics.getGitHubStatus(),
      message: `GitHub senkronize edildi: ${issues.length} görev güncellendi.`
    };
  }

  public async executeAction(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const hubRes = this.handleProjectAndSync(action, payload);
    if (hubRes) return hubRes;
    if (IDE_SYNC_ACTIONS.has(action)) return this.handleIdeAndSync(action, payload);

    const directMap: Record<string, () => Record<string, unknown>> = {
      auto: () => this.handleAutoAction(),
      move_task: () => this.handleMoveTask(payload),
      reclaim_orphans: () => this.handleReclaimOrphans(),
      complete_task: () => this.handleMoveTask({ issueNumber: payload.issueNumber, targetStatus: 'done' })
    };
    const directHandler = Object.hasOwn(directMap, action) ? directMap[action] : undefined;
    if (directHandler) return directHandler();

    const hubCtx = this.ctx.hub.getActiveContext();
    if (action === 'sync_github') return this.handleSyncGitHub(hubCtx);
    if (action === 'create_task') return handleCreateTask(hubCtx, payload);
    if (action === 'release_locks') return handleReleaseLocks(hubCtx, payload);
    return { success: false, error: 'Bilinmeyen aksiyon: ' + action };
  }

  private handleMoveTask(payload: Record<string, unknown>): Record<string, unknown> {
    const ctx = this.ctx.hub.getActiveContext();
    const num = parseInt(String(payload.issueNumber), 10);
    const targetStatus = payload.targetStatus as SystemIssue['status'];
    const issue = ctx.metrics.getIssues().find(i => i.number === num);
    if (!issue) return { success: false, message: `Görev #${num} bulunamadı.` };

    if (targetStatus === 'in_progress') {
      return assignTaskInProgress(ctx, issue, payload, this.ctx.loopBreaker);
    }

    if (targetStatus === 'done' || targetStatus === 'ready') {
      if (issue.assignedAgent) ctx.wtManager.releaseFileLocks(issue.assignedAgent);
    }
    ctx.metrics.moveTask(num, targetStatus);
    return { success: true, message: `Görev #${num} '${targetStatus}' sütununa alındı.` };
  }

  private handleAutoAction(): Record<string, unknown> {
    const ctx = this.ctx.hub.getActiveContext();
    const breaker = this.ctx.loopBreaker ?? new LoopBreaker();
    const ready = ctx.metrics.getIssues().filter(i => i.status === 'ready' && !breaker.isBlocked(i.number));
    if (ready.length === 0) {
      const blocked = ctx.metrics.getIssues().filter(i => i.status === 'ready' && breaker.isBlocked(i.number));
      if (blocked.length > 0) {
        return { success: false, message: `🛑 Ready havuzundaki ${blocked.length} görev 3 başarısız deneme limitine ulaştığı için kilitlendi (Circuit Breaker aktif).` };
      }
      return { success: true, message: 'Ready sütununda bekleyen görev yok.' };
    }
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
    if (action === 'launch_ide') return launchIdeAction(this.ctx.launcher, ctx.localPath, payload);
    if (action === 'sync_toolchain') {
      const rep = this.ctx.toolchainSync.syncAll();
      return { success: rep.success, report: rep, message: `Toolchain senkronize edildi: ${rep.syncedIdes.join(', ')}` };
    }
    if (action === 'run_engine_tool') {
      return runEngineToolAction(this.ctx.engineSvc, payload);
    }
    const s = ctx.metrics.updateSettings((payload.settings || payload) as Record<string, unknown>);
    return { success: true, settings: s, message: `Ayarlar kaydedildi (Ana Dal: ${s.primaryBranch || 'master'}).` };
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
